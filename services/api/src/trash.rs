use crate::{auth, bookmarks, state::AppState, webdav};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: Uuid,
    pub title: String,
    pub url: String,
    pub folder_path: String,
    pub original_position: i32,
    pub deleted_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashResponse {
    pub status: &'static str,
    pub items: Vec<TrashItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashCreatePayload {
    pub bookmark_id: Uuid,
    pub expected_etag: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrashMutationPayload {
    pub expected_etag: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let status = match bookmarks::current_bookmark_status(&state, user.id, &user.login_identifier).await {
        Ok(status) => status,
        Err(error) => {
            tracing::error!(?error, "load bookmark trash status failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_list_failed", "回收站状态读取失败");
        }
    };
    let rows = sqlx::query(
        "SELECT id, title, url, folder_path, original_position, deleted_at
         FROM bookmark_trash WHERE user_id = $1 ORDER BY deleted_at DESC, id DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await;
    match rows {
        Ok(rows) => Json(TrashResponse {
            status,
            items: if status == "ready" {
                rows.into_iter().map(trash_item_from_row).collect()
            } else {
                Vec::new()
            },
        })
        .into_response(),
        Err(error) => {
            tracing::error!(?error, "list bookmark trash failed");
            auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_list_failed", "回收站读取失败")
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TrashCreatePayload>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let target = match bookmarks::load_node_for_user(&state.db, user.id, payload.bookmark_id).await {
        Ok(Some(target)) => target,
        Ok(None) => return auth::error(StatusCode::NOT_FOUND, "bookmark_not_found", "书签不存在"),
        Err(error) => {
            tracing::error!(?error, "load bookmark for trash failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_create_failed", "书签读取失败");
        }
    };
    let current_status = match bookmarks::current_bookmark_status(&state, user.id, &user.login_identifier).await {
        Ok(status) => status,
        Err(error) => {
            tracing::error!(?error, "load trash mutation status failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_create_failed", "同步文件状态读取失败");
        }
    };
    if current_status != "ready" {
        return auth::error(StatusCode::CONFLICT, "trash_unavailable", "当前同步文件不是可编辑的明文 XBEL");
    }
    if target.node_type != "bookmark" || target.url.is_none() {
        return auth::error(StatusCode::BAD_REQUEST, "invalid_bookmark", "只能将书签移入回收站");
    }
    if let Err(response) = webdav::ensure_bookmark_editable(
        &state,
        user.id,
        &user.login_identifier,
        payload.expected_etag.as_deref(),
    )
    .await
    {
        return response;
    }
    let mut transaction = match state.db.begin().await {
        Ok(transaction) => transaction,
        Err(error) => {
            tracing::error!(?error, "start trash transaction failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_create_failed", "移入回收站失败");
        }
    };
    let inserted = sqlx::query(
        "INSERT INTO bookmark_trash (id, user_id, title, url, folder_path, original_position)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(user.id)
    .bind(&target.title)
    .bind(target.url.as_deref().unwrap_or_default())
    .bind(&target.folder_path)
    .bind(target.position)
    .execute(&mut *transaction)
    .await;
    if inserted.is_err() {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_create_failed", "回收站记录创建失败");
    }
    let deleted = sqlx::query("DELETE FROM bookmark_nodes WHERE id = $1 AND user_id = $2 AND node_type = 'bookmark'")
        .bind(payload.bookmark_id)
        .bind(user.id)
        .execute(&mut *transaction)
        .await;
    if deleted.map(|result| result.rows_affected()).unwrap_or(0) != 1 {
        return auth::error(StatusCode::NOT_FOUND, "bookmark_not_found", "书签不存在");
    }
    if transaction.commit().await.is_err() {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_create_failed", "移入回收站失败");
    }
    match webdav::rewrite_bookmark_file(&state, user.id, &user.login_identifier).await {
        Ok(_) => Json(serde_json::json!({ "deleted": true })).into_response(),
        Err(response) => response,
    }
}

pub async fn restore(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trash_id): Path<Uuid>,
    Json(payload): Json<TrashMutationPayload>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let status = match bookmarks::current_bookmark_status(&state, user.id, &user.login_identifier).await {
        Ok(status) => status,
        Err(error) => {
            tracing::error!(?error, "load trash restore status failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_restore_failed", "同步文件状态读取失败");
        }
    };
    if status != "ready" {
        return auth::error(StatusCode::CONFLICT, "trash_unavailable", "当前同步文件不是可编辑的明文 XBEL");
    }
    if let Err(response) = webdav::ensure_bookmark_editable(
        &state,
        user.id,
        &user.login_identifier,
        payload.expected_etag.as_deref(),
    )
    .await
    {
        return response;
    }
    let Some(item) = load_trash_item(&state, user.id, trash_id).await else {
        return auth::error(StatusCode::NOT_FOUND, "trash_not_found", "回收站记录不存在");
    };
    let mut transaction = match state.db.begin().await {
        Ok(transaction) => transaction,
        Err(error) => {
            tracing::error!(?error, "start trash restore transaction failed");
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_restore_failed", "恢复书签失败");
        }
    };
    let parent_id = find_folder_by_path(&mut transaction, user.id, &item.folder_path).await;
    let position = next_position(&mut transaction, user.id, parent_id).await.unwrap_or(0);
    let bookmark_id = Uuid::new_v4();
    let inserted = sqlx::query(
        "INSERT INTO bookmark_nodes (id, user_id, parent_id, node_type, title, url, position)
         VALUES ($1, $2, $3, 'bookmark', $4, $5, $6)",
    )
    .bind(bookmark_id)
    .bind(user.id)
    .bind(parent_id)
    .bind(&item.title)
    .bind(&item.url)
    .bind(position)
    .execute(&mut *transaction)
    .await;
    if inserted.is_err() {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_restore_failed", "恢复书签失败");
    }
    let deleted = sqlx::query("DELETE FROM bookmark_trash WHERE id = $1 AND user_id = $2")
        .bind(trash_id)
        .bind(user.id)
        .execute(&mut *transaction)
        .await;
    if deleted.map(|result| result.rows_affected()).unwrap_or(0) != 1 {
        return auth::error(StatusCode::NOT_FOUND, "trash_not_found", "回收站记录不存在");
    }
    if transaction.commit().await.is_err() {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_restore_failed", "恢复书签失败");
    }
    match webdav::rewrite_bookmark_file(&state, user.id, &user.login_identifier).await {
        Ok(_) => Json(serde_json::json!({ "restored": true })).into_response(),
        Err(response) => response,
    }
}

pub async fn remove(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(trash_id): Path<Uuid>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let result = sqlx::query("DELETE FROM bookmark_trash WHERE id = $1 AND user_id = $2")
        .bind(trash_id)
        .bind(user.id)
        .execute(&state.db)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 1 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => auth::error(StatusCode::NOT_FOUND, "trash_not_found", "回收站记录不存在"),
        Err(error) => {
            tracing::error!(?error, "remove bookmark trash failed");
            auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_remove_failed", "永久删除失败")
        }
    }
}

pub async fn empty(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match sqlx::query("DELETE FROM bookmark_trash WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await
    {
        Ok(result) => Json(serde_json::json!({ "removed": result.rows_affected() })).into_response(),
        Err(error) => {
            tracing::error!(?error, "empty bookmark trash failed");
            auth::error(StatusCode::INTERNAL_SERVER_ERROR, "trash_empty_failed", "清空回收站失败")
        }
    }
}

async fn load_trash_item(state: &AppState, user_id: Uuid, id: Uuid) -> Option<TrashItem> {
    sqlx::query(
        "SELECT id, title, url, folder_path, original_position, deleted_at
         FROM bookmark_trash WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(trash_item_from_row)
}

fn trash_item_from_row(row: sqlx::sqlite::SqliteRow) -> TrashItem {
    TrashItem {
        id: row.get("id"),
        title: row.get("title"),
        url: row.get("url"),
        folder_path: row.get("folder_path"),
        original_position: row.get("original_position"),
        deleted_at: row.get("deleted_at"),
    }
}

async fn find_folder_by_path(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: Uuid,
    path: &str,
) -> Option<Uuid> {
    let mut parent_id = None;
    for title in path.split(" / ").filter(|title| !title.is_empty()) {
        let row = sqlx::query(
            "SELECT id FROM bookmark_nodes
             WHERE user_id = $1 AND node_type = 'folder' AND title = $2
               AND ((parent_id IS NULL AND $3 IS NULL) OR parent_id = $3)
             ORDER BY position, id LIMIT 1",
        )
        .bind(user_id)
        .bind(title)
        .bind(parent_id)
        .fetch_optional(&mut **transaction)
        .await
        .ok()
        .flatten();
        let Some(row) = row else { return None };
        parent_id = Some(row.get("id"));
    }
    parent_id
}

async fn next_position(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: Uuid,
    parent_id: Option<Uuid>,
) -> Option<i32> {
    sqlx::query_scalar(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM bookmark_nodes
         WHERE user_id = $1 AND ((parent_id IS NULL AND $2 IS NULL) OR parent_id = $2)",
    )
    .bind(user_id)
    .bind(parent_id)
    .fetch_one(&mut **transaction)
    .await
    .ok()
}
