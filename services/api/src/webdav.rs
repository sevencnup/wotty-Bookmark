use crate::{auth, state::AppState};
use axum::{
    body::{to_bytes, Body},
    extract::{Path, Request, State},
    http::{header, HeaderValue, Method, StatusCode},
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

    let Some(user) = auth::authenticate_webdav(&state, request.headers()).await else {
        return auth::unauthorized_basic();
    };
    let Some(target) = DavTarget::parse(&path, &user.login_identifier, &state.data_dir, user.id)
    else {
        return auth::error(
            StatusCode::NOT_FOUND,
            "dav_path_not_found",
            "WebDAV 路径不存在",
        );
    };

    match method {
        Method::GET => read_file(&target, false).await,
        Method::HEAD => read_file(&target, true).await,
        Method::PUT => write_file(&target, request, &state.db).await,
        Method::DELETE => delete_file(&target, &state.db).await,
        method if method.as_str() == "PROPFIND" => propfind(&target).await,
        method if method.as_str() == "MOVE" => move_file(&target, request, &state.db).await,
        _ => {
            let mut response = StatusCode::METHOD_NOT_ALLOWED.into_response();
            response.headers_mut().insert(
                header::ALLOW,
                HeaderValue::from_static("GET, HEAD, PUT, DELETE, PROPFIND, MOVE, OPTIONS"),
            );
            response
        }
    }
}

#[derive(Clone)]
struct DavTarget {
    user_id: uuid::Uuid,
    relative_path: String,
    file_path: PathBuf,
    data_root: PathBuf,
}

impl DavTarget {
    fn parse(
        path: &str,
        login_identifier: &str,
        data_root: &FsPath,
        user_id: uuid::Uuid,
    ) -> Option<Self> {
        let mut segments = path.split('/');
        let account = segments.next()?;
        let file = segments.next()?;
        if segments.next().is_some() || account != login_identifier {
            return None;
        }
        if !matches!(
            file,
            "bookmarks.xbel" | "bookmarks.xbel.temp" | "bookmarks.xbel.lock"
        ) {
            return None;
        }
        Some(Self {
            user_id,
            relative_path: format!("{account}/{file}"),
            file_path: data_root.join(user_id.to_string()).join(file),
            data_root: data_root.to_path_buf(),
        })
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
    let mut response = if head_only {
        (StatusCode::OK, Body::empty()).into_response()
    } else {
        (StatusCode::OK, Body::from(bytes.clone())).into_response()
    };
    apply_file_headers(&mut response, &bytes);
    response
}

async fn write_file(target: &DavTarget, request: Request, db: &sqlx::PgPool) -> Response {
    if target
        .file_path
        .file_name()
        .and_then(|value| value.to_str())
        == Some("bookmarks.xbel.lock")
    {
        return acquire_lock(target).await;
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
    let temp_path = target.file_path.with_extension("uploading");
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

async fn acquire_lock(target: &DavTarget) -> Response {
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
        let _ = fs::create_dir_all(parent).await;
    }
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target.file_path)
        .await
    {
        Ok(mut file) => {
            let _ = file.write_all(b"bookmark-vault-lock").await;
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

async fn delete_file(target: &DavTarget, db: &sqlx::PgPool) -> Response {
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

async fn move_file(source: &DavTarget, request: Request, db: &sqlx::PgPool) -> Response {
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
    let destination_path = match Url::parse(destination) {
        Ok(url) => url.path().trim_start_matches("/dav/").to_string(),
        Err(_) => destination
            .trim_start_matches('/')
            .trim_start_matches("dav/")
            .to_string(),
    };
    let account = source.relative_path.split('/').next().unwrap_or_default();
    let Some(target) = DavTarget::parse(
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
    if let Some(parent) = target.file_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    match fs::rename(&source.file_path, &target.file_path).await {
        Ok(()) => {
            let body = fs::read(&target.file_path).await.ok();
            remove_file_metadata(db, source).await;
            if let Some(body) = body {
                record_file(db, &target, &body).await;
            }
            StatusCode::NO_CONTENT.into_response()
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

async fn propfind(target: &DavTarget) -> Response {
    let bytes = match fs::read(&target.file_path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return StatusCode::NOT_FOUND.into_response()
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let href = xml_escape(&format!("/dav/{}", target.relative_path));
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><d:multistatus xmlns:d=\"DAV:\"><d:response><d:href>{href}</d:href><d:propstat><d:prop><d:getcontentlength>{}</d:getcontentlength><d:getcontenttype>application/xml</d:getcontenttype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>",
        bytes.len()
    );
    let mut response = (StatusCode::MULTI_STATUS, body).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/xml; charset=utf-8"),
    );
    response
}

fn apply_file_headers(response: &mut Response, bytes: &[u8]) {
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
        HeaderValue::from_str(&fmt_http_date(std::time::SystemTime::now())).unwrap(),
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
