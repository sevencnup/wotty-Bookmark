use crate::{auth, bookmarks, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Row, SqlitePool};
use std::collections::{HashMap, HashSet};
use url::Url;
use uuid::Uuid;

const MAX_TITLE_LENGTH: usize = 512;
const MAX_URL_LENGTH: usize = 4_096;
const MAX_IMPORT_BYTES: usize = 5 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: Uuid,
    pub title: String,
    pub bookmark_count: i64,
    pub children: Vec<LibraryFolder>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBookmark {
    pub id: Uuid,
    pub title: String,
    pub url: String,
    pub parent_id: Option<Uuid>,
    pub folder_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTree {
    pub folders: Vec<LibraryFolder>,
    pub bookmarks: Vec<LibraryBookmark>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBookmarkPayload {
    pub title: String,
    pub url: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderPayload {
    pub title: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNodePayload {
    pub title: String,
    pub url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveNodePayload {
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportXbelPayload {
    pub xbel: String,
    #[serde(default)]
    pub replace: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredNode {
    id: Uuid,
    parent_id: Option<Uuid>,
    node_type: String,
    title: String,
    url: Option<String>,
    position: i32,
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<auth::AuthenticatedUser, Response> {
    auth::authenticate_session(state, headers)
        .await
        .ok_or_else(|| auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录"))
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    match load_tree(&state.db, user.id, query.q.as_deref()).await {
        Ok(tree) => Json(tree).into_response(),
        Err(error) => {
            tracing::error!(?error, "self-hosted library lookup failed");
            auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "library_read_failed",
                "书签库读取失败",
            )
        }
    }
}

pub async fn create_bookmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateBookmarkPayload>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let title = match validate_title(&payload.title) {
        Ok(value) => value,
        Err(message) => return bad_request("invalid_title", message),
    };
    let url = match validate_url(&payload.url) {
        Ok(value) => value,
        Err(message) => return bad_request("invalid_url", message),
    };
    match create_node(
        &state.db,
        user.id,
        "bookmark",
        title,
        Some(url),
        payload.parent_id,
    )
    .await
    {
        Ok(node) => Json(json!({ "node": node })).into_response(),
        Err(response) => response,
    }
}

pub async fn create_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateFolderPayload>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let title = match validate_title(&payload.title) {
        Ok(value) => value,
        Err(message) => return bad_request("invalid_title", message),
    };
    match create_node(&state.db, user.id, "folder", title, None, payload.parent_id).await {
        Ok(node) => Json(json!({ "node": node })).into_response(),
        Err(response) => response,
    }
}

pub async fn update_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateNodePayload>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let title = match validate_title(&payload.title) {
        Ok(value) => value,
        Err(message) => return bad_request("invalid_title", message),
    };
    let row = match active_node(&state.db, user.id, id).await {
        Ok(Some(row)) => row,
        Ok(None) => return not_found(),
        Err(error) => return database_error(error),
    };
    let url = if row.node_type == "bookmark" {
        match payload.url.as_deref().map(validate_url) {
            Some(Ok(value)) => value,
            Some(Err(message)) => return bad_request("invalid_url", message),
            None => return bad_request("invalid_url", "书签网址不能为空"),
        }
    } else {
        String::new()
    };
    let result = if row.node_type == "bookmark" {
        sqlx::query("UPDATE library_nodes SET title = $1, url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL")
            .bind(&title).bind(&url).bind(id).bind(user.id).execute(&state.db).await
    } else {
        sqlx::query("UPDATE library_nodes SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL")
            .bind(&title).bind(id).bind(user.id).execute(&state.db).await
    };
    match result {
        Ok(_) => Json(json!({ "updated": true })).into_response(),
        Err(error) => database_error(error),
    }
}

pub async fn move_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(payload): Json<MoveNodePayload>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let node = match active_node(&state.db, user.id, id).await {
        Ok(Some(node)) => node,
        Ok(None) => return not_found(),
        Err(error) => return database_error(error),
    };
    if node.parent_id == payload.parent_id {
        return Json(json!({ "moved": true, "unchanged": true })).into_response();
    }
    if let Some(parent_id) = payload.parent_id {
        let parent = match active_node(&state.db, user.id, parent_id).await {
            Ok(Some(node)) => node,
            Ok(None) => return bad_request("folder_not_found", "目标文件夹不存在"),
            Err(error) => return database_error(error),
        };
        if parent.node_type != "folder" {
            return bad_request("invalid_parent", "目标必须是文件夹");
        }
        if node.node_type == "folder" {
            match folder_move_creates_cycle_db(&state.db, user.id, id, parent_id).await {
                Ok(true) => return bad_request("folder_cycle", "不能移动到自身或子文件夹"),
                Ok(false) => {}
                Err(error) => return database_error(error),
            }
        }
    }
    let position = match next_position(&state.db, user.id, payload.parent_id).await {
        Ok(position) => position,
        Err(error) => return database_error(error),
    };
    match sqlx::query("UPDATE library_nodes SET parent_id = $1, position = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL")
        .bind(payload.parent_id).bind(position).bind(id).bind(user.id).execute(&state.db).await {
        Ok(_) => Json(json!({ "moved": true })).into_response(),
        Err(error) => database_error(error),
    }
}

pub async fn delete_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let node = match active_node(&state.db, user.id, id).await {
        Ok(Some(node)) => node,
        Ok(None) => return not_found(),
        Err(error) => return database_error(error),
    };
    let mut transaction = match state.db.begin().await {
        Ok(transaction) => transaction,
        Err(error) => return database_error(error),
    };
    let result = sqlx::query(
        "WITH RECURSIVE descendants(id) AS (
             SELECT id FROM library_nodes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
             UNION ALL
             SELECT n.id FROM library_nodes n JOIN descendants d ON n.parent_id = d.id
             WHERE n.user_id = $2 AND n.deleted_at IS NULL
         )
         UPDATE library_nodes SET
           deleted_at = CURRENT_TIMESTAMP,
           deleted_root_id = $1,
           original_parent_id = CASE WHEN id = $1 THEN parent_id ELSE original_parent_id END,
           original_position = CASE WHEN id = $1 THEN position ELSE original_position END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id IN (SELECT id FROM descendants)",
    )
    .bind(id)
    .bind(user.id)
    .execute(&mut *transaction)
    .await;
    if let Err(error) = result {
        return database_error(error);
    }
    match transaction.commit().await {
        Ok(_) => Json(json!({ "deleted": true, "title": node.title })).into_response(),
        Err(error) => database_error(error),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: Uuid,
    pub title: String,
    pub node_type: String,
    pub deleted_at: String,
}

pub async fn list_trash(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let rows = sqlx::query("SELECT id, title, node_type, deleted_at FROM library_nodes WHERE user_id = $1 AND deleted_root_id = id AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
        .bind(user.id).fetch_all(&state.db).await;
    match rows {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|row| TrashItem {
                    id: row.get("id"),
                    title: row.get("title"),
                    node_type: row.get("node_type"),
                    deleted_at: row.get("deleted_at"),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(error) => database_error(error),
    }
}

pub async fn restore_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let root = sqlx::query("SELECT original_parent_id FROM library_nodes WHERE id = $1 AND user_id = $2 AND deleted_root_id = id AND deleted_at IS NOT NULL")
        .bind(id).bind(user.id).fetch_optional(&state.db).await;
    let Some(root) = (match root {
        Ok(root) => root,
        Err(error) => return database_error(error),
    }) else {
        return not_found();
    };
    let original_parent_id: Option<Uuid> = root.get("original_parent_id");
    let parent_is_available = match original_parent_id {
        Some(parent_id) => {
            matches!(active_node(&state.db, user.id, parent_id).await, Ok(Some(parent)) if parent.node_type == "folder")
        }
        None => true,
    };
    let parent_id = parent_is_available.then_some(original_parent_id).flatten();
    let position = match next_position(&state.db, user.id, parent_id).await {
        Ok(position) => position,
        Err(error) => return database_error(error),
    };
    match sqlx::query("UPDATE library_nodes SET deleted_at = NULL, deleted_root_id = NULL, original_parent_id = NULL, original_position = NULL, parent_id = CASE WHEN id = $1 THEN $2 ELSE parent_id END, position = CASE WHEN id = $1 THEN $3 ELSE position END, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4 AND deleted_root_id = $1")
        .bind(id).bind(parent_id).bind(position).bind(user.id).execute(&state.db).await {
        Ok(_) => Json(json!({ "restored": true })).into_response(),
        Err(error) => database_error(error),
    }
}

pub async fn import_xbel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImportXbelPayload>,
) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if payload.xbel.len() > MAX_IMPORT_BYTES {
        return bad_request("import_too_large", "导入文件不能超过 5 MB");
    }
    let parsed = match bookmarks::parse_xbel(payload.xbel.as_bytes()) {
        Ok(parsed) => parsed,
        Err(error) => return bad_request("invalid_xbel", &format!("XBEL 文件无效：{error}")),
    };
    match import_document(&state.db, user.id, &parsed.nodes, payload.replace).await {
        Ok(count) => Json(json!({ "imported": true, "count": count })).into_response(),
        Err(error) => database_error(error),
    }
}

pub async fn import_from_sync(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let user = match require_user(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let source = match bookmarks::load_index(&state.db, user.id).await {
        Ok(source) => source,
        Err(error) => return database_error(error),
    };
    if source.nodes.is_empty() {
        return bad_request(
            "sync_library_empty",
            "当前 Floccus 同步索引没有可迁移的书签",
        );
    }
    match import_document(&state.db, user.id, &source.nodes, false).await {
        Ok(count) => Json(json!({ "imported": true, "count": count })).into_response(),
        Err(error) => database_error(error),
    }
}

async fn create_node(
    db: &SqlitePool,
    user_id: Uuid,
    node_type: &str,
    title: String,
    url: Option<String>,
    parent_id: Option<Uuid>,
) -> Result<StoredNode, Response> {
    if let Some(parent_id) = parent_id {
        match active_node(db, user_id, parent_id).await {
            Ok(Some(parent)) if parent.node_type == "folder" => {}
            Ok(_) => return Err(bad_request("folder_not_found", "目标文件夹不存在")),
            Err(error) => return Err(database_error(error)),
        }
    }
    let position = next_position(db, user_id, parent_id)
        .await
        .map_err(database_error)?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO library_nodes (id, user_id, parent_id, node_type, title, url, position) VALUES ($1, $2, $3, $4, $5, $6, $7)")
        .bind(id).bind(user_id).bind(parent_id).bind(node_type).bind(&title).bind(&url).bind(position).execute(db).await.map_err(database_error)?;
    Ok(StoredNode {
        id,
        parent_id,
        node_type: node_type.to_owned(),
        title,
        url,
        position,
    })
}

async fn load_tree(
    db: &SqlitePool,
    user_id: Uuid,
    query: Option<&str>,
) -> Result<LibraryTree, sqlx::Error> {
    let mut rows = sqlx::query("SELECT id, parent_id, node_type, title, url, position FROM library_nodes WHERE user_id = $1 AND deleted_at IS NULL ORDER BY parent_id NULLS FIRST, position, id")
        .bind(user_id).fetch_all(db).await?
        .into_iter().map(stored_node).collect::<Vec<_>>();
    if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let query = query.to_lowercase();
        let matches = rows
            .iter()
            .filter(|node| {
                format!("{} {}", node.title, node.url.as_deref().unwrap_or_default())
                    .to_lowercase()
                    .contains(&query)
            })
            .map(|node| node.id)
            .collect::<HashSet<_>>();
        let parents = rows
            .iter()
            .map(|node| (node.id, node.parent_id))
            .collect::<HashMap<_, _>>();
        let mut keep = matches;
        let mut pending = keep.iter().copied().collect::<Vec<_>>();
        while let Some(id) = pending.pop() {
            if let Some(Some(parent)) = parents.get(&id) {
                if keep.insert(*parent) {
                    pending.push(*parent);
                }
            }
        }
        rows.retain(|node| keep.contains(&node.id));
    }
    Ok(tree_from_nodes(rows))
}

fn stored_node(row: sqlx::sqlite::SqliteRow) -> StoredNode {
    StoredNode {
        id: row.get("id"),
        parent_id: row.get("parent_id"),
        node_type: row.get("node_type"),
        title: row.get("title"),
        url: row.get("url"),
        position: row.get("position"),
    }
}

fn tree_from_nodes(nodes: Vec<StoredNode>) -> LibraryTree {
    let by_id = nodes
        .iter()
        .map(|node| (node.id, node))
        .collect::<HashMap<_, _>>();
    let mut children = HashMap::<Option<Uuid>, Vec<&StoredNode>>::new();
    for node in &nodes {
        children
            .entry(node.parent_id.filter(|parent| by_id.contains_key(parent)))
            .or_default()
            .push(node);
    }
    let mut path_by_id = HashMap::new();
    build_paths(None, "", &children, &mut path_by_id);
    let mut bookmarks = nodes
        .iter()
        .filter(|node| node.node_type == "bookmark")
        .filter_map(|node| {
            Some(LibraryBookmark {
                id: node.id,
                title: node.title.clone(),
                url: node.url.clone()?,
                parent_id: node.parent_id,
                folder_path: node
                    .parent_id
                    .and_then(|parent| path_by_id.get(&parent).cloned())
                    .unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    bookmarks.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));
    let folders = build_folders(None, &children);
    LibraryTree { folders, bookmarks }
}

fn build_paths(
    parent: Option<Uuid>,
    prefix: &str,
    children: &HashMap<Option<Uuid>, Vec<&StoredNode>>,
    output: &mut HashMap<Uuid, String>,
) {
    if let Some(nodes) = children.get(&parent) {
        for node in nodes {
            if node.node_type == "folder" {
                let path = if prefix.is_empty() {
                    node.title.clone()
                } else {
                    format!("{prefix} / {}", node.title)
                };
                output.insert(node.id, path.clone());
                build_paths(Some(node.id), &path, children, output);
            }
        }
    }
}

fn build_folders(
    parent: Option<Uuid>,
    children: &HashMap<Option<Uuid>, Vec<&StoredNode>>,
) -> Vec<LibraryFolder> {
    children
        .get(&parent)
        .into_iter()
        .flatten()
        .filter(|node| node.node_type == "folder")
        .map(|node| {
            let nested = build_folders(Some(node.id), children);
            let bookmark_count = count_bookmarks(Some(node.id), children);
            LibraryFolder {
                id: node.id,
                title: node.title.clone(),
                bookmark_count,
                children: nested,
            }
        })
        .collect()
}

fn count_bookmarks(
    parent: Option<Uuid>,
    children: &HashMap<Option<Uuid>, Vec<&StoredNode>>,
) -> i64 {
    children
        .get(&parent)
        .into_iter()
        .flatten()
        .map(|node| {
            if node.node_type == "bookmark" {
                1
            } else {
                count_bookmarks(Some(node.id), children)
            }
        })
        .sum()
}

async fn active_node(
    db: &SqlitePool,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<StoredNode>, sqlx::Error> {
    sqlx::query("SELECT id, parent_id, node_type, title, url, position FROM library_nodes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL").bind(id).bind(user_id).fetch_optional(db).await.map(|row| row.map(stored_node))
}
async fn next_position(
    db: &SqlitePool,
    user_id: Uuid,
    parent_id: Option<Uuid>,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar("SELECT COALESCE(MAX(position), -1) + 1 FROM library_nodes WHERE user_id = $1 AND parent_id IS $2 AND deleted_at IS NULL").bind(user_id).bind(parent_id).fetch_one(db).await
}
async fn folder_move_creates_cycle_db(
    db: &SqlitePool,
    user_id: Uuid,
    id: Uuid,
    candidate_parent: Uuid,
) -> Result<bool, sqlx::Error> {
    let found = sqlx::query_scalar::<_, i64>("WITH RECURSIVE descendants(id) AS (SELECT id FROM library_nodes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL UNION ALL SELECT node.id FROM library_nodes node JOIN descendants parent ON node.parent_id = parent.id WHERE node.user_id = $2 AND node.deleted_at IS NULL) SELECT COUNT(*) FROM descendants WHERE id = $3").bind(id).bind(user_id).bind(candidate_parent).fetch_one(db).await?;
    Ok(found > 0)
}

async fn import_document(
    db: &SqlitePool,
    user_id: Uuid,
    nodes: &[bookmarks::XbelNode],
    replace: bool,
) -> Result<usize, sqlx::Error> {
    let mut transaction = db.begin().await?;
    if replace {
        sqlx::query("DELETE FROM library_nodes WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *transaction)
            .await?;
    }
    let mut ids = vec![None; nodes.len()];
    let mut count = 0;
    for (index, node) in nodes.iter().enumerate() {
        let id = Uuid::new_v4();
        let parent_id = node
            .parent
            .and_then(|parent| ids.get(parent).copied().flatten());
        let title = normalized_import_title(&node.title);
        let (node_type, url) = match node.kind {
            bookmarks::NodeKind::Folder => ("folder", None),
            bookmarks::NodeKind::Bookmark => {
                let Some(url) = node.url.as_deref().and_then(|url| validate_url(url).ok()) else {
                    continue;
                };
                ("bookmark", Some(url))
            }
        };
        sqlx::query("INSERT INTO library_nodes (id, user_id, parent_id, node_type, title, url, position) VALUES ($1, $2, $3, $4, $5, $6, $7)").bind(id).bind(user_id).bind(parent_id).bind(node_type).bind(title).bind(url).bind(node.position as i32).execute(&mut *transaction).await?;
        ids[index] = Some(id);
        count += 1;
    }
    transaction.commit().await?;
    Ok(count)
}

fn normalized_import_title(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "未命名".into()
    } else {
        value.chars().take(MAX_TITLE_LENGTH).collect()
    }
}
fn validate_title(value: &str) -> Result<String, &'static str> {
    let value = value.trim();
    if value.is_empty() {
        return Err("标题不能为空");
    }
    if value.chars().count() > MAX_TITLE_LENGTH {
        return Err("标题不能超过 512 个字符");
    }
    Ok(value.to_owned())
}
fn validate_url(value: &str) -> Result<String, &'static str> {
    let value = value.trim();
    if value.len() > MAX_URL_LENGTH {
        return Err("网址不能超过 4096 个字符");
    }
    let url = Url::parse(value).map_err(|_| "请输入有效的网址")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("只支持 http 或 https 网址");
    }
    Ok(url.to_string())
}
fn bad_request(code: &str, message: &str) -> Response {
    auth::error(StatusCode::BAD_REQUEST, code, message)
}
fn not_found() -> Response {
    auth::error(
        StatusCode::NOT_FOUND,
        "library_node_not_found",
        "书签或文件夹不存在",
    )
}
fn database_error(error: sqlx::Error) -> Response {
    tracing::error!(?error, "self-hosted library database error");
    auth::error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "library_operation_failed",
        "书签库操作失败",
    )
}

#[cfg(test)]
mod tests {
    use super::{folder_move_creates_cycle_db, import_document, load_tree, validate_url};
    use crate::bookmarks::parse_xbel;
    use sqlx::sqlite::SqlitePoolOptions;
    use uuid::Uuid;

    async fn test_db() -> sqlx::SqlitePool {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("../../migrations").run(&db).await.unwrap();
        db
    }
    async fn user(db: &sqlx::SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (id, login_identifier, password_hash) VALUES ($1, $2, 'hash')",
        )
        .bind(id)
        .bind(format!("{id}@example.test"))
        .execute(db)
        .await
        .unwrap();
        id
    }
    #[test]
    fn only_http_urls_are_allowed() {
        assert!(validate_url("https://example.com/path").is_ok());
        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("file:///secret").is_err());
    }
    #[tokio::test]
    async fn imported_library_is_isolated_and_preserves_tree() {
        let db = test_db().await;
        let first = user(&db).await;
        let second = user(&db).await;
        let xbel = parse_xbel(br#"<xbel><folder><title>Work</title><bookmark href="https://example.com"><title>Example</title></bookmark></folder></xbel>"#).unwrap();
        import_document(&db, first, &xbel.nodes, false)
            .await
            .unwrap();
        let tree = load_tree(&db, first, None).await.unwrap();
        assert_eq!(tree.folders[0].title, "Work");
        assert_eq!(tree.bookmarks[0].folder_path, "Work");
        assert!(load_tree(&db, second, None)
            .await
            .unwrap()
            .bookmarks
            .is_empty());
    }
    #[tokio::test]
    async fn rejects_moving_a_folder_into_its_descendant() {
        let db = test_db().await;
        let id = user(&db).await;
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        for (node, parent) in [(root, None), (child, Some(root))] {
            sqlx::query("INSERT INTO library_nodes (id, user_id, parent_id, node_type, title, position) VALUES ($1, $2, $3, 'folder', 'F', 0)").bind(node).bind(id).bind(parent).execute(&db).await.unwrap();
        }
        assert!(folder_move_creates_cycle_db(&db, id, root, child)
            .await
            .unwrap());
    }
}
