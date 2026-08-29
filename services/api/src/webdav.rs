use crate::{auth, state::AppState};
use axum::{
    body::{to_bytes, Body},
    extract::{Path, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use httpdate::fmt_http_date;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::{
    path::{Path as FsPath, PathBuf},
    time::Duration,
};
use tokio::{fs, io::AsyncWriteExt};
use url::Url;

const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
const LOCK_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_HISTORY_VERSIONS: i64 = 30;

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

pub async fn export_file(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let path = state.data_dir.join(user.id.to_string()).join("bookmarks.xbel");
    let body = match fs::read(path).await {
        Ok(body) => body,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return auth::error(StatusCode::NOT_FOUND, "file_not_found", "还没有可导出的同步文件")
        }
        Err(error) => {
            tracing::error!(?error, "export WebDAV file failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "export_failed", "导出同步文件失败");
        }
    };
    let mut response = (StatusCode::OK, Body::from(body)).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=bookmarks.xbel"),
    );
    response
}

pub async fn import_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Request,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let target = DavTarget {
        user_id: user.id,
        relative_path: format!("{}/bookmarks.xbel", user.login_identifier),
        file_path: state.data_dir.join(user.id.to_string()).join("bookmarks.xbel"),
        data_root: state.data_dir.clone(),
    };
    if let Err(response) = ensure_unlocked(&target).await {
        return response;
    }
    let body = match to_bytes(request.into_body(), MAX_FILE_BYTES + 1).await {
        Ok(body) if body.len() <= MAX_FILE_BYTES => body,
        Ok(_) => return auth::error(StatusCode::PAYLOAD_TOO_LARGE, "file_too_large", "书签文件不能超过 10 MB"),
        Err(_) => return auth::error(StatusCode::BAD_REQUEST, "invalid_body", "无法读取导入文件"),
    };
    let parsed = match validate_import_body(&body) {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };
    if fs::try_exists(&target.file_path).await.unwrap_or(false) {
        if let Err(error) = snapshot_existing_file(&state.db, &target).await {
            tracing::error!(?error, "snapshot before import failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "import_failed", "导入前备份失败");
        }
    }
    if let Err(error) = replace_file(&target.file_path, &body).await {
        tracing::error!(?error, "replace imported file failed");
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "import_failed", "导入同步文件失败");
    }
    if let Err(error) = record_file(&state.db, &target, &body).await {
        tracing::error!(?error, "record imported file failed");
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "import_failed", "导入文件元数据更新失败");
    }
    let encrypted = parsed.is_none();
    match parsed {
        Some(parsed) => {
            if let Err(error) = crate::bookmarks::replace_index(&state.db, user.id, &parsed).await {
                tracing::error!(?error, "index imported bookmarks failed");
                return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "import_failed", "导入书签索引失败");
            }
        }
        None => {
            if let Err(error) = sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
                .bind(user.id)
                .execute(&state.db)
                .await
            {
                tracing::error!(?error, "clear encrypted bookmark index after import failed");
                return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "import_failed", "导入文件索引清理失败");
            }
        }
    }
    Json(json!({ "imported": true, "encrypted": encrypted, "byteSize": body.len() })).into_response()
}

fn validate_import_body(
    body: &[u8],
) -> Result<Option<crate::bookmarks::XbelDocument>, Response> {
    if is_encrypted_sync_file(body) {
        return Ok(None);
    }
    crate::bookmarks::parse_xbel(body)
        .map(Some)
        .map_err(|_| auth::error(StatusCode::UNPROCESSABLE_ENTITY, "invalid_xbel", "导入文件不是有效的 XBEL 或 Floccus 加密文件"))
}

fn is_encrypted_sync_file(bytes: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else { return false };
    let Some(object) = value.as_object() else { return false };
    object.get("ciphertext").and_then(serde_json::Value::as_str).is_some()
        && object.get("salt").and_then(serde_json::Value::as_str).is_some()
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileVersionResponse {
    id: uuid::Uuid,
    file_path: String,
    etag: String,
    byte_size: i64,
    created_at: String,
}

pub async fn list_versions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let rows = sqlx::query(
        "SELECT fv.id, df.path, fv.etag, fv.byte_size, fv.created_at
         FROM file_versions fv
         JOIN dav_files df ON df.id = fv.dav_file_id
         WHERE df.user_id = $1
         ORDER BY fv.created_at DESC, fv.id DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await;
    match rows {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|row| FileVersionResponse {
                    id: row.get("id"),
                    file_path: row.get("path"),
                    etag: row.get("etag"),
                    byte_size: row.get("byte_size"),
                    created_at: row
                        .get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .to_rfc3339(),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(error) => {
            tracing::error!(?error, "list file versions failed");
            auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "versions_list_failed",
                "历史版本读取失败",
            )
        }
    }
}

pub async fn restore_version(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(version_id): Path<uuid::Uuid>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let row = sqlx::query(
        "SELECT fv.storage_key, df.path
         FROM file_versions fv
         JOIN dav_files df ON df.id = fv.dav_file_id
         WHERE fv.id = $1 AND df.user_id = $2",
    )
    .bind(version_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await;
    let Some(row) = (match row {
        Ok(row) => row,
        Err(error) => {
            tracing::error!(?error, "load file version failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "version_load_failed",
                "历史版本读取失败",
            );
        }
    }) else {
        return auth::error(StatusCode::NOT_FOUND, "version_not_found", "历史版本不存在");
    };
    let path: String = row.get("path");
    let Some(DavResource::File(target)) =
        DavResource::parse(&path, &user.login_identifier, &state.data_dir, user.id)
    else {
        return auth::error(StatusCode::NOT_FOUND, "version_not_found", "历史版本不存在");
    };
    if let Err(response) = ensure_unlocked(&target).await {
        return response;
    }
    let snapshot_path: String = row.get("storage_key");
    let body = match fs::read(&snapshot_path).await {
        Ok(body) => body,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return auth::error(
                StatusCode::GONE,
                "version_data_missing",
                "历史版本文件已不存在",
            )
        }
        Err(error) => {
            tracing::error!(?error, "read file version failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "version_read_failed",
                "历史版本读取失败",
            );
        }
    };
    if fs::try_exists(&target.file_path).await.unwrap_or(false) && is_versioned_file(&target) {
        if let Err(error) = snapshot_existing_file(&state.db, &target).await {
            tracing::error!(?error, path = %target.relative_path, "snapshot current file before restore failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    if let Err(error) = replace_file(&target.file_path, &body).await {
        tracing::error!(?error, path = %target.relative_path, "restore file version failed");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    if let Err(error) = record_file(&state.db, &target, &body).await {
        tracing::error!(?error, path = %target.relative_path, "record restored file metadata failed");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    if is_versioned_file(&target) {
        match crate::bookmarks::parse_xbel(&body) {
            Ok(parsed) => {
                if let Err(error) = crate::bookmarks::replace_index(&state.db, user.id, &parsed).await {
                    tracing::error!(?error, path = %target.relative_path, "restore bookmark index failed");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            }
            Err(error) if is_encrypted_sync_file(&body) => {
                tracing::debug!(?error, path = %target.relative_path, "restoring encrypted bookmark file without index");
                if let Err(error) = sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
                    .bind(user.id)
                    .execute(&state.db)
                    .await
                {
                    tracing::error!(?error, path = %target.relative_path, "clear encrypted bookmark index failed");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            }
            Err(error) => {
                tracing::error!(?error, path = %target.relative_path, "restore invalid XBEL");
                return auth::error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_xbel",
                    "历史版本不是有效的 XBEL 或 Floccus 加密文件",
                );
            }
        }
    }
    Json(json!({
        "restored": true,
        "versionId": version_id,
        "filePath": target.relative_path,
    }))
    .into_response()
}

pub async fn cleanup_versions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match cleanup_versions_for_user(&state.db, user.id).await {
        Ok(removed) => Json(json!({
            "removed": removed,
            "retainedPerFile": MAX_HISTORY_VERSIONS,
        }))
        .into_response(),
        Err(error) => {
            tracing::error!(?error, "cleanup file versions failed");
            auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "versions_cleanup_failed",
                "历史版本清理失败",
            )
        }
    }
}

async fn ensure_unlocked(target: &DavTarget) -> Result<(), Response> {
    let Some(parent) = target.file_path.parent() else {
        return Ok(());
    };
    let lock_path = parent.join("bookmarks.xbel.lock");
    let metadata = match fs::metadata(&lock_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            tracing::error!(?error, "inspect restore lock failed");
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
    Err(StatusCode::LOCKED.into_response())
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

pub async fn ensure_bookmark_editable(
    state: &AppState,
    user_id: uuid::Uuid,
    login_identifier: &str,
    expected_etag: Option<&str>,
) -> Result<(), Response> {
    let target = DavTarget {
        user_id,
        relative_path: format!("{login_identifier}/bookmarks.xbel"),
        file_path: state.data_dir.join(user_id.to_string()).join("bookmarks.xbel"),
        data_root: state.data_dir.clone(),
    };
    ensure_unlocked(&target).await?;
    let body = fs::read(&target.file_path).await.map_err(|error| {
        tracing::error!(?error, "read bookmark file before admin edit failed");
        auth::error(
            StatusCode::CONFLICT,
            "floccus_identity_required",
            "请先在 Floccus 中执行一次向上推送，重新建立同步身份",
        )
    })?;
    let identity_ready = crate::bookmarks::parse_xbel(&body)
        .map(|document| document.has_complete_floccus_identity())
        .unwrap_or(false);
    if !identity_ready {
        return Err(auth::error(
            StatusCode::CONFLICT,
            "floccus_identity_required",
            "请先在 Floccus 中执行一次向上推送，重新建立同步身份",
        ));
    }
    if let Some(expected_etag) = expected_etag {
        let current = sqlx::query("SELECT etag FROM dav_files WHERE user_id = $1 AND path LIKE $2")
            .bind(user_id)
            .bind("%/bookmarks.xbel")
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())?;
        let Some(current) = current else {
            return Err(auth::error(StatusCode::CONFLICT, "version_conflict", "同步文件已发生变化，请刷新后重试"));
        };
        let current_etag: String = current.get("etag");
        if current_etag != expected_etag {
            return Err(auth::error(StatusCode::CONFLICT, "version_conflict", "同步文件已发生变化，请刷新后重试"));
        }
    }
    Ok(())
}

pub async fn rewrite_bookmark_file(
    state: &AppState,
    user_id: uuid::Uuid,
    login_identifier: &str,
) -> Result<(String, i64), Response> {
    let target = DavTarget {
        user_id,
        relative_path: format!("{login_identifier}/bookmarks.xbel"),
        file_path: state.data_dir.join(user_id.to_string()).join("bookmarks.xbel"),
        data_root: state.data_dir.clone(),
    };
    let nodes = crate::bookmarks::load_index(&state.db, user_id)
        .await
        .map_err(|_| auth::error(StatusCode::INTERNAL_SERVER_ERROR, "rewrite_failed", "同步文件生成失败"))?;
    let body = crate::bookmarks::render_xbel(&nodes)
        .map_err(|_| auth::error(StatusCode::INTERNAL_SERVER_ERROR, "rewrite_failed", "同步文件生成失败"))?;
    if let Err(error) = replace_file(&target.file_path, &body).await {
        tracing::error!(?error, "rewrite bookmark file failed");
        return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    record_file(&state.db, &target, &body)
        .await
        .map_err(|_| auth::error(StatusCode::INTERNAL_SERVER_ERROR, "rewrite_failed", "同步文件元数据更新失败"))?;
    let row = sqlx::query("SELECT etag, version FROM dav_files WHERE user_id = $1 AND path = $2")
        .bind(user_id)
        .bind(&target.relative_path)
        .fetch_one(&state.db)
        .await
        .map_err(|_| auth::error(StatusCode::INTERNAL_SERVER_ERROR, "rewrite_failed", "同步文件元数据读取失败"))?;
    Ok((row.get("etag"), row.get("version")))
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
    db: &SqlitePool,
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
    let parsed = if is_versioned_file(target) {
        if is_encrypted_sync_file(&body) {
            None
        } else {
            match crate::bookmarks::parse_xbel(&body) {
                Ok(parsed) => Some(parsed),
                Err(error) => {
                    tracing::warn!(?error, path = %target.relative_path, "reject invalid plaintext XBEL");
                    return auth::error(
                        StatusCode::UNPROCESSABLE_ENTITY,
                        "invalid_xbel",
                        "书签文件不是有效的 XBEL 或 Floccus 加密文件",
                    );
                }
            }
        }
    } else {
        None
    };
    if let Some(parent) = target.file_path.parent() {
        if let Err(error) = fs::create_dir_all(parent).await {
            tracing::error!(?error, "create WebDAV storage directory failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    let existed = fs::try_exists(&target.file_path).await.unwrap_or(false);
    if existed && is_versioned_file(target) {
        if let Err(error) = snapshot_existing_file(db, target).await {
            tracing::error!(?error, path = %target.relative_path, "snapshot WebDAV file failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    if let Err(error) = replace_file(&target.file_path, &body).await {
        tracing::error!(?error, "replace WebDAV file failed");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    if let Err(error) = record_file(db, target, &body).await {
        tracing::error!(?error, path = %target.relative_path, "record WebDAV file metadata failed");
    }
    if let Some(parsed) = parsed {
        if let Err(error) = crate::bookmarks::replace_index(db, target.user_id, &parsed).await {
            tracing::error!(?error, path = %target.relative_path, "index plaintext bookmarks failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "bookmark_index_failed",
                "书签索引更新失败",
            );
        }
    } else if is_versioned_file(target) {
        if let Err(error) = sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
            .bind(target.user_id)
            .execute(db)
            .await
        {
            tracing::error!(?error, path = %target.relative_path, "clear encrypted bookmark index failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "bookmark_index_failed",
                "书签索引清理失败",
            );
        }
    }
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
    db: &SqlitePool,
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
    db: &SqlitePool,
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
    if destination_exists && is_versioned_file(&target) {
        if let Err(error) = snapshot_existing_file(db, &target).await {
            tracing::error!(?error, path = %target.relative_path, "snapshot WebDAV MOVE destination failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    match fs::rename(&source.file_path, &target.file_path).await {
        Ok(()) => {
            let body = fs::read(&target.file_path).await.ok();
            remove_file_metadata(db, source).await;
            if let Some(body) = body {
                if let Err(error) = record_file(db, &target, &body).await {
                    tracing::error!(?error, path = %target.relative_path, "record WebDAV MOVE metadata failed");
                }
                if is_versioned_file(&target) {
                    match crate::bookmarks::parse_xbel(&body) {
                        Ok(parsed) => {
                            if let Err(error) = crate::bookmarks::replace_index(db, target.user_id, &parsed).await {
                                tracing::error!(?error, path = %target.relative_path, "index moved plaintext bookmarks failed");
                            }
                        }
                        Err(_) => {
                            if let Err(error) = sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
                                .bind(target.user_id)
                                .execute(db)
                                .await
                            {
                                tracing::error!(?error, path = %target.relative_path, "clear encrypted bookmark index failed");
                            }
                        }
                    }
                }
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

async fn record_file(
    db: &SqlitePool,
    target: &DavTarget,
    body: &[u8],
) -> Result<(), sqlx::Error> {
    let mut digest = Sha256::new();
    digest.update(body);
    let etag = format!("\"{:x}\"", digest.finalize());
    sqlx::query(
        "INSERT INTO dav_files (id, user_id, path, storage_key, etag, byte_size, version, last_modified_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, path) DO UPDATE SET
           storage_key = EXCLUDED.storage_key,
           etag = EXCLUDED.etag,
           byte_size = EXCLUDED.byte_size,
           version = dav_files.version + 1,
           last_modified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(target.user_id)
    .bind(&target.relative_path)
    .bind(target.file_path.to_string_lossy().as_ref())
    .bind(etag)
    .bind(body.len() as i64)
    .execute(db)
    .await
    .map(|_| ())
}

fn is_versioned_file(target: &DavTarget) -> bool {
    target
        .file_path
        .file_name()
        .and_then(|value| value.to_str())
        == Some("bookmarks.xbel")
}

async fn replace_file(path: &FsPath, body: &[u8]) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("webdav-file");
    let temp_path = path.with_file_name(format!(".{file_name}.uploading-{}", uuid::Uuid::new_v4()));
    let result = async {
        let mut file = fs::File::create(&temp_path).await?;
        file.write_all(body).await?;
        file.flush().await?;
        fs::rename(&temp_path, path).await
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&temp_path).await;
    }
    result
}

async fn snapshot_existing_file(db: &SqlitePool, target: &DavTarget) -> Result<(), String> {
    let body = fs::read(&target.file_path)
        .await
        .map_err(|error| format!("read current file: {error}"))?;
    let current = sqlx::query("SELECT id FROM dav_files WHERE user_id = $1 AND path = $2")
        .bind(target.user_id)
        .bind(&target.relative_path)
        .fetch_optional(db)
        .await
        .map_err(|error| format!("load current metadata: {error}"))?;
    let dav_file_id: uuid::Uuid = if let Some(row) = current {
        row.get("id")
    } else {
        record_file(db, target, &body)
            .await
            .map_err(|error| format!("create current metadata: {error}"))?;
        sqlx::query("SELECT id FROM dav_files WHERE user_id = $1 AND path = $2")
            .bind(target.user_id)
            .bind(&target.relative_path)
            .fetch_one(db)
            .await
            .map_err(|error| format!("reload current metadata: {error}"))?
            .get("id")
    };
    let version_id = uuid::Uuid::new_v4();
    let snapshot_path = target
        .data_root
        .join(".versions")
        .join(target.user_id.to_string())
        .join(dav_file_id.to_string())
        .join(format!("{version_id}.blob"));
    replace_file(&snapshot_path, &body)
        .await
        .map_err(|error| format!("write snapshot: {error}"))?;
    let mut digest = Sha256::new();
    digest.update(&body);
    let etag = format!("\"{:x}\"", digest.finalize());
    if let Err(error) = sqlx::query(
        "INSERT INTO file_versions (id, dav_file_id, storage_key, etag, byte_size)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(version_id)
    .bind(dav_file_id)
    .bind(snapshot_path.to_string_lossy().as_ref())
    .bind(etag)
    .bind(body.len() as i64)
    .execute(db)
    .await
    {
        let _ = fs::remove_file(&snapshot_path).await;
        return Err(format!("record snapshot: {error}"));
    }
    cleanup_versions_for_user(db, target.user_id)
        .await
        .map_err(|error| format!("clean old snapshots: {error}"))?;
    Ok(())
}

async fn cleanup_versions_for_user(
    db: &SqlitePool,
    user_id: uuid::Uuid,
) -> Result<usize, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, storage_key
         FROM (
           SELECT fv.id, fv.storage_key,
                  ROW_NUMBER() OVER (
                    PARTITION BY fv.dav_file_id
                    ORDER BY fv.created_at DESC, fv.id DESC
                  ) AS version_number
           FROM file_versions fv
           JOIN dav_files df ON df.id = fv.dav_file_id
           WHERE df.user_id = $1
         ) versions
         WHERE version_number > $2",
    )
    .bind(user_id)
    .bind(MAX_HISTORY_VERSIONS)
    .fetch_all(db)
    .await?;
    let mut removed = 0;
    for row in rows {
        let id: uuid::Uuid = row.get("id");
        let storage_key: String = row.get("storage_key");
        let result = sqlx::query("DELETE FROM file_versions WHERE id = $1")
            .bind(id)
            .execute(db)
            .await?;
        if result.rows_affected() == 0 {
            continue;
        }
        removed += 1;
        let path = PathBuf::from(storage_key);
        if let Err(error) = fs::remove_file(&path).await {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(?error, ?path, "remove old WebDAV snapshot failed");
            }
        }
    }
    Ok(removed)
}

async fn remove_file_metadata(db: &SqlitePool, target: &DavTarget) {
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
    if path.is_empty() {
        return None;
    }
    let decoded = path
        .split('/')
        .map(|segment| percent_decode_str(segment).decode_utf8().ok())
        .collect::<Option<Vec<_>>>()?
        .join("/");
    (!decoded.is_empty()).then_some(decoded)
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
    fn decodes_percent_encoded_account_in_move_destination() {
        assert_eq!(
            normalize_destination("http://localhost:4174/dav/05110%40163.com/bookmarks.xbel"),
            Some("05110@163.com/bookmarks.xbel".to_owned())
        );
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
