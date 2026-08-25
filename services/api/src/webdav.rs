use crate::{auth, state::AppState};
use axum::{
    body::{to_bytes, Body},
    extract::{Path, Request, State},
    http::{header, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
};
use httpdate::fmt_http_date;
use sha2::{Digest, Sha256};
use std::{
    path::{Path as FsPath, PathBuf},
    time::Duration,
};
use tokio::{fs, io::AsyncWriteExt};
use url::Url;

const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
const LOCK_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub async fn handle(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request: Request,
) -> Response {
    let method = request.method().clone();
    if method == Method::OPTIONS {
        return options_response();
    }

    let user = match auth::authenticate_webdav(&state, request.headers()).await {
        Ok(Some(user)) => user,
        Ok(None) => return auth::unauthorized_basic(),
        Err(retry_after) => return auth::rate_limited(retry_after),
    };
    let Some(resource) =
        DavResource::parse(&path, &user.login_identifier, &state.data_dir, user.id)
    else {
        return auth::error(
            StatusCode::NOT_FOUND,
            "dav_path_not_found",
            "WebDAV 路径不存在",
        );
    };
    let depth = request
        .headers()
        .get("depth")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("0");

    match resource {
        DavResource::Collection(collection) => match method.as_str() {
            "PROPFIND" => propfind_collection(&collection, depth).await,
            _ => method_not_allowed(),
        },
        DavResource::File(target) => match method {
            Method::GET => read_file(&target, false).await,
            Method::HEAD => read_file(&target, true).await,
            Method::PUT => write_file(&target, request, &state.db, user.app_password_id).await,
            Method::DELETE => delete_file(&target, &state.db, user.app_password_id).await,
            method if method.as_str() == "PROPFIND" => propfind_file(&target).await,
            method if method.as_str() == "MOVE" => {
                move_file(&target, request, &state.db, user.app_password_id).await
            }
            _ => method_not_allowed(),
        },
    }
}

#[derive(Clone)]
struct DavTarget {
    user_id: uuid::Uuid,
    relative_path: String,
    file_path: PathBuf,
    data_root: PathBuf,
}

#[derive(Clone)]
struct DavCollection {
    relative_path: String,
    directory: PathBuf,
}

enum DavResource {
    Collection(DavCollection),
    File(DavTarget),
}

impl DavResource {
    fn parse(
        path: &str,
        login_identifier: &str,
        data_root: &FsPath,
        user_id: uuid::Uuid,
    ) -> Option<Self> {
        let mut segments = path.trim_matches('/').split('/');
        let account = segments.next()?;
        if account != login_identifier {
            return None;
        }
        let user_directory = data_root.join(user_id.to_string());
        let Some(file) = segments.next() else {
            return Some(Self::Collection(DavCollection {
                relative_path: account.to_owned(),
                directory: user_directory,
            }));
        };
        if segments.next().is_some() {
            return None;
        }
        if !matches!(
            file,
            "bookmarks.xbel" | "bookmarks.xbel.temp" | "bookmarks.xbel.lock"
        ) {
            return None;
        }
        Some(Self::File(DavTarget {
            user_id,
            relative_path: format!("{account}/{file}"),
            file_path: user_directory.join(file),
            data_root: data_root.to_path_buf(),
        }))
    }
}

async fn read_file(target: &DavTarget, head_only: bool) -> Response {
    let bytes = match fs::read(&target.file_path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return StatusCode::NOT_FOUND.into_response()
        }
        Err(error) => {
            tracing::error!(?error, "read WebDAV file failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let modified = fs::metadata(&target.file_path)
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok());
    let mut response = if head_only {
        (StatusCode::OK, Body::empty()).into_response()
    } else {
        (StatusCode::OK, Body::from(bytes.clone())).into_response()
    };
    apply_file_headers(&mut response, &bytes, modified);
    response
}

async fn write_file(
    target: &DavTarget,
    request: Request,
    db: &sqlx::PgPool,
    owner_id: Option<uuid::Uuid>,
) -> Response {
    if target
        .file_path
        .file_name()
        .and_then(|value| value.to_str())
        == Some("bookmarks.xbel.lock")
    {
        let Some(owner_id) = owner_id else {
            return auth::unauthorized_basic();
        };
        return acquire_lock(target, owner_id).await;
    }
    if let Err(response) = check_lock_owner(target, owner_id).await {
        return response;
    }
    let body = match to_bytes(request.into_body(), MAX_FILE_BYTES + 1).await {
        Ok(body) if body.len() <= MAX_FILE_BYTES => body,
        Ok(_) => {
            return auth::error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "file_too_large",
                "书签文件不能超过 10 MB",
            )
        }
        Err(_) => return auth::error(StatusCode::BAD_REQUEST, "invalid_body", "无法读取请求内容"),
    };
    if let Some(parent) = target.file_path.parent() {
        if let Err(error) = fs::create_dir_all(parent).await {
            tracing::error!(?error, "create WebDAV storage directory failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    let existed = fs::try_exists(&target.file_path).await.unwrap_or(false);
    let temp_path = target.file_path.with_file_name(format!(
        ".{}.uploading-{}",
        target
            .file_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("webdav-file"),
        uuid::Uuid::new_v4()
    ));
    match fs::File::create(&temp_path).await {
        Ok(mut file) => {
            if file.write_all(&body).await.is_err() || file.flush().await.is_err() {
                let _ = fs::remove_file(&temp_path).await;
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        }
        Err(error) => {
            tracing::error!(?error, "create WebDAV file failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    if let Err(error) = fs::rename(&temp_path, &target.file_path).await {
        tracing::error!(?error, "replace WebDAV file failed");
        let _ = fs::remove_file(&temp_path).await;
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    record_file(db, target, &body).await;
    if existed {
        StatusCode::NO_CONTENT.into_response()
    } else {
        StatusCode::CREATED.into_response()
    }
}

async fn check_lock_owner(
    target: &DavTarget,
    owner_id: Option<uuid::Uuid>,
) -> Result<(), Response> {
    let Some(parent) = target.file_path.parent() else {
        return Ok(());
    };
    let lock_path = parent.join("bookmarks.xbel.lock");
    let metadata = match fs::metadata(&lock_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            tracing::error!(?error, "inspect WebDAV lock failed");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };
    if metadata
        .modified()
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|elapsed| elapsed > LOCK_TIMEOUT)
    {
        let _ = fs::remove_file(&lock_path).await;
        return Ok(());
    }
    let Some(owner_id) = owner_id else {
        return Err(auth::unauthorized_basic());
    };
    let expected = format!("bookmark-vault-lock:{owner_id}");
    match fs::read(&lock_path).await {
        Ok(contents) if contents == expected.as_bytes() => Ok(()),
        Ok(_) => Err(StatusCode::LOCKED.into_response()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => {
            tracing::error!(?error, "read WebDAV lock failed");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

async fn acquire_lock(target: &DavTarget, owner_id: uuid::Uuid) -> Response {
    if let Ok(metadata) = fs::metadata(&target.file_path).await {
        if let Ok(modified) = metadata.modified() {
            if modified.elapsed().unwrap_or_default() > LOCK_TIMEOUT {
                let _ = fs::remove_file(&target.file_path).await;
            } else {
                return StatusCode::LOCKED.into_response();
            }
        }
    }
    if let Some(parent) = target.file_path.parent() {
        if let Err(error) = fs::create_dir_all(parent).await {
            tracing::error!(?error, "create WebDAV lock directory failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target.file_path)
        .await
    {
        Ok(mut file) => {
            let marker = format!("bookmark-vault-lock:{owner_id}");
            if file.write_all(marker.as_bytes()).await.is_err() || file.flush().await.is_err() {
                let _ = fs::remove_file(&target.file_path).await;
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            StatusCode::CREATED.into_response()
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            StatusCode::LOCKED.into_response()
        }
        Err(error) => {
            tracing::error!(?error, "create WebDAV lock failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_file(
    target: &DavTarget,
    db: &sqlx::PgPool,
    owner_id: Option<uuid::Uuid>,
) -> Response {
    if let Err(response) = check_lock_owner(target, owner_id).await {
        return response;
    }
    match fs::remove_file(&target.file_path).await {
        Ok(()) => {
            remove_file_metadata(db, target).await;
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NOT_FOUND.into_response()
        }
        Err(error) => {
            tracing::error!(?error, "delete WebDAV file failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn move_file(
    source: &DavTarget,
    request: Request,
    db: &sqlx::PgPool,
    owner_id: Option<uuid::Uuid>,
) -> Response {
    if let Err(response) = check_lock_owner(source, owner_id).await {
        return response;
    }
    let Some(destination) = request
        .headers()
        .get("destination")
        .and_then(|value| value.to_str().ok())
    else {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "destination_required",
            "MOVE 请求缺少 Destination",
        );
    };
    let Some(destination_path) = normalize_destination(destination) else {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_destination",
            "MOVE 目标路径无效",
        );
    };
    let account = source.relative_path.split('/').next().unwrap_or_default();
    let Some(DavResource::File(target)) = DavResource::parse(
        &destination_path,
        account,
        &source.data_root,
        source.user_id,
    ) else {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_destination",
            "MOVE 目标路径无效",
        );
    };
    let overwrite = request
        .headers()
        .get("overwrite")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("T");
    if !matches!(overwrite, "T" | "t" | "F" | "f") {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_overwrite",
            "Overwrite 必须是 T 或 F",
        );
    }
    let destination_exists = fs::try_exists(&target.file_path).await.unwrap_or(false);
    if matches!(overwrite, "F" | "f") && destination_exists {
        return StatusCode::PRECONDITION_FAILED.into_response();
    }
    if let Some(parent) = target.file_path.parent() {
        if let Err(error) = fs::create_dir_all(parent).await {
            tracing::error!(?error, "create WebDAV MOVE destination directory failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    match fs::rename(&source.file_path, &target.file_path).await {
        Ok(()) => {
            let body = fs::read(&target.file_path).await.ok();
            remove_file_metadata(db, source).await;
            if let Some(body) = body {
                record_file(db, &target, &body).await;
            }
            if destination_exists {
                StatusCode::NO_CONTENT.into_response()
            } else {
                StatusCode::CREATED.into_response()
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NOT_FOUND.into_response()
        }
        Err(error) => {
            tracing::error!(?error, "move WebDAV file failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn record_file(db: &sqlx::PgPool, target: &DavTarget, body: &[u8]) {
    let mut digest = Sha256::new();
    digest.update(body);
    let etag = format!("\"{:x}\"", digest.finalize());
    let result = sqlx::query(
        "INSERT INTO dav_files (id, user_id, path, storage_key, etag, byte_size, version, last_modified_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
         ON CONFLICT (user_id, path) DO UPDATE SET
           storage_key = EXCLUDED.storage_key,
           etag = EXCLUDED.etag,
           byte_size = EXCLUDED.byte_size,
           version = dav_files.version + 1,
           last_modified_at = NOW(),
           updated_at = NOW()",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(target.user_id)
    .bind(&target.relative_path)
    .bind(target.file_path.to_string_lossy().as_ref())
    .bind(etag)
    .bind(body.len() as i64)
    .execute(db)
    .await;
    if let Err(error) = result {
        tracing::error!(?error, path = %target.relative_path, "record WebDAV file metadata failed");
    }
}

async fn remove_file_metadata(db: &sqlx::PgPool, target: &DavTarget) {
    if let Err(error) = sqlx::query("DELETE FROM dav_files WHERE user_id = $1 AND path = $2")
        .bind(target.user_id)
        .bind(&target.relative_path)
        .execute(db)
        .await
    {
        tracing::error!(?error, path = %target.relative_path, "remove WebDAV file metadata failed");
    }
}

async fn propfind_file(target: &DavTarget) -> Response {
    let bytes = match fs::read(&target.file_path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return StatusCode::NOT_FOUND.into_response()
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let href = xml_escape(&format!("/dav/{}", target.relative_path));
    let body = multistatus(vec![file_propfind_response(&href, &bytes)]);
    multistatus_response(body)
}

async fn propfind_collection(collection: &DavCollection, depth: &str) -> Response {
    let mut entries = vec![collection_propfind_response(&format!(
        "/dav/{}/",
        xml_escape(&collection.relative_path)
    ))];

    if depth != "0" {
        let mut directory = match fs::read_dir(&collection.directory).await {
            Ok(directory) => directory,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return multistatus_response(multistatus(entries));
            }
            Err(error) => {
                tracing::error!(?error, "read WebDAV collection failed");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };
        loop {
            let entry = match directory.next_entry().await {
                Ok(Some(entry)) => entry,
                Ok(None) => break,
                Err(error) => {
                    tracing::error!(?error, "iterate WebDAV collection failed");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            };
            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !matches!(
                file_name.as_str(),
                "bookmarks.xbel" | "bookmarks.xbel.temp" | "bookmarks.xbel.lock"
            ) {
                continue;
            }
            let bytes = match fs::read(entry.path()).await {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => {
                    tracing::error!(?error, file = %file_name, "read WebDAV collection entry failed");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            };
            let href = xml_escape(&format!("/dav/{}/{}", collection.relative_path, file_name));
            entries.push(file_propfind_response(&href, &bytes));
        }
    }

    multistatus_response(multistatus(entries))
}

fn file_propfind_response(href: &str, bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    let etag = xml_escape(&format!("\"{:x}\"", digest.finalize()));
    format!(
        "<d:response><d:href>{href}</d:href><d:propstat><d:prop><d:getcontentlength>{}</d:getcontentlength><d:getcontenttype>application/xml</d:getcontenttype><d:getetag>{etag}</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>",
        bytes.len()
    )
}

fn collection_propfind_response(href: &str) -> String {
    format!(
        "<d:response><d:href>{href}</d:href><d:propstat><d:prop><d:getcontentlength>0</d:getcontentlength><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"
    )
}

fn multistatus(entries: Vec<String>) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:multistatus xmlns:d=\"DAV:\">{}</d:multistatus>",
        entries.join("")
    )
}

fn multistatus_response(body: String) -> Response {
    let mut response = (StatusCode::MULTI_STATUS, body).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/xml; charset=utf-8"),
    );
    response
}

fn normalize_destination(destination: &str) -> Option<String> {
    let path = match Url::parse(destination) {
        Ok(url) => url.path().to_owned(),
        Err(_) => destination.trim().to_owned(),
    };
    let path = path
        .strip_prefix("/dav/")
        .or_else(|| path.strip_prefix("dav/"))
        .or_else(|| path.strip_prefix('/'))?;
    let path = path.trim_matches('/');
    (!path.is_empty()).then(|| path.to_owned())
}

fn method_not_allowed() -> Response {
    let mut response = StatusCode::METHOD_NOT_ALLOWED.into_response();
    response.headers_mut().insert(
        header::ALLOW,
        HeaderValue::from_static("GET, HEAD, PUT, DELETE, PROPFIND, MOVE, OPTIONS"),
    );
    response
}

fn apply_file_headers(
    response: &mut Response,
    bytes: &[u8],
    modified: Option<std::time::SystemTime>,
) {
    let mut digest = Sha256::new();
    digest.update(bytes);
    let etag = format!("\"{:x}\"", digest.finalize());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/xml"),
    );
    response.headers_mut().insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&bytes.len().to_string()).unwrap(),
    );
    response
        .headers_mut()
        .insert(header::ETAG, HeaderValue::from_str(&etag).unwrap());
    response.headers_mut().insert(
        header::LAST_MODIFIED,
        HeaderValue::from_str(&fmt_http_date(
            modified.unwrap_or_else(std::time::SystemTime::now),
        ))
        .unwrap(),
    );
}

fn options_response() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::ALLOW,
        HeaderValue::from_static("GET, HEAD, PUT, DELETE, PROPFIND, MOVE, OPTIONS"),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Authorization, Content-Type, Depth, Destination, Overwrite"),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, PUT, DELETE, PROPFIND, MOVE, OPTIONS"),
    );
    response.headers_mut().insert(
        HeaderName::from_static("dav"),
        HeaderValue::from_static("1"),
    );
    response
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::{check_lock_owner, normalize_destination, xml_escape, DavResource, DavTarget};
    use std::fs;
    use std::path::Path;
    use uuid::Uuid;

    #[test]
    fn parses_collection_and_supported_file_paths() {
        let user_id = Uuid::nil();
        assert!(matches!(
            DavResource::parse("alice/", "alice", Path::new("/tmp/data"), user_id),
            Some(DavResource::Collection(_))
        ));
        assert!(matches!(
            DavResource::parse(
                "/alice/bookmarks.xbel",
                "alice",
                Path::new("/tmp/data"),
                user_id
            ),
            Some(DavResource::File(_))
        ));
        assert!(DavResource::parse(
            "alice/private.txt",
            "alice",
            Path::new("/tmp/data"),
            user_id
        )
        .is_none());
    }

    #[test]
    fn normalizes_absolute_and_relative_move_destinations() {
        assert_eq!(
            normalize_destination("https://vault.example/dav/alice/bookmarks.xbel"),
            Some("alice/bookmarks.xbel".to_owned())
        );
        assert_eq!(
            normalize_destination("/dav/alice/bookmarks.xbel"),
            Some("alice/bookmarks.xbel".to_owned())
        );
        assert_eq!(normalize_destination("/dav/"), None);
    }

    #[test]
    fn xml_escapes_resource_names() {
        assert_eq!(xml_escape("a<&\"'>"), "a&lt;&amp;&quot;&apos;&gt;");
    }

    #[tokio::test]
    async fn only_the_lock_owner_can_modify_a_locked_resource() {
        let user_id = Uuid::new_v4();
        let data_root = std::env::temp_dir().join(format!("bookmark-vault-webdav-{user_id}"));
        let user_directory = data_root.join(user_id.to_string());
        fs::create_dir_all(&user_directory).expect("create test WebDAV directory");
        let target = DavTarget {
            user_id,
            relative_path: "alice/bookmarks.xbel.temp".to_owned(),
            file_path: user_directory.join("bookmarks.xbel.temp"),
            data_root: data_root.clone(),
        };
        let owner = Uuid::new_v4();
        fs::write(
            user_directory.join("bookmarks.xbel.lock"),
            format!("bookmark-vault-lock:{owner}"),
        )
        .expect("write test lock");

        assert!(check_lock_owner(&target, Some(owner)).await.is_ok());
        assert!(check_lock_owner(&target, Some(Uuid::new_v4()))
            .await
            .is_err());

        fs::remove_dir_all(data_root).expect("remove test WebDAV directory");
    }
}
