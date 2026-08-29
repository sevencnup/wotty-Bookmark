use crate::{auth, state::AppState};
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Row, SqlitePool};
use std::{
    collections::{HashMap, HashSet},
    fmt,
    io::Cursor,
};
use tokio::fs;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Folder,
    Bookmark,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct XbelNode {
    pub floccus_id: Option<i64>,
    pub kind: NodeKind,
    pub title: String,
    pub url: Option<String>,
    pub parent: Option<usize>,
    pub position: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct XbelDocument {
    pub highest_id: Option<i64>,
    pub nodes: Vec<XbelNode>,
}

impl XbelDocument {
    pub fn has_complete_floccus_identity(&self) -> bool {
        self.highest_id.is_some() && self.nodes.iter().all(|node| node.floccus_id.is_some())
    }
}

impl std::ops::Deref for XbelDocument {
    type Target = [XbelNode];

    fn deref(&self) -> &Self::Target {
        &self.nodes
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct XbelError(pub String);

impl fmt::Display for XbelError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for XbelError {}

impl From<quick_xml::Error> for XbelError {
    fn from(error: quick_xml::Error) -> Self {
        Self(error.to_string())
    }
}

struct OpenElement {
    name: String,
    node_index: Option<usize>,
    title_target: Option<usize>,
    title_text: String,
}

pub fn parse_xbel(bytes: &[u8]) -> Result<XbelDocument, XbelError> {
    let mut reader = Reader::from_reader(Cursor::new(bytes));
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut stack = Vec::<OpenElement>::new();
    let mut nodes = Vec::new();
    let mut saw_root = false;
    let mut closed_root = false;
    let mut highest_id = None;

    loop {
        let event = reader.read_event_into(&mut buffer)?;
        match event {
            Event::Start(start) => {
                let name = tag_name(start.name().as_ref());
                if name == "xbel" {
                    if saw_root || !stack.is_empty() {
                        return Err(XbelError("XBEL 根元素无效".into()));
                    }
                    saw_root = true;
                } else if !saw_root || closed_root {
                    return Err(XbelError("XBEL 根元素缺失或重复".into()));
                }

                let node_index = match name.as_str() {
                    "folder" => Some(push_node(
                        &mut nodes,
                        parse_floccus_id(&start)?,
                        NodeKind::Folder,
                        None,
                        &stack,
                    )),
                    "bookmark" => {
                        let url = attribute_value(&start, b"href")?
                            .ok_or_else(|| XbelError("书签缺少 href 属性".into()))?;
                        Some(push_node(
                            &mut nodes,
                            parse_floccus_id(&start)?,
                            NodeKind::Bookmark,
                            Some(url),
                            &stack,
                        ))
                    }
                    _ => None,
                };
                let title_target = if name == "title" {
                    stack.iter().rev().find_map(|element| element.node_index)
                } else {
                    None
                };
                stack.push(OpenElement {
                    name,
                    node_index,
                    title_target,
                    title_text: String::new(),
                });
            }
            Event::Empty(empty) => {
                let name = tag_name(empty.name().as_ref());
                if !saw_root || closed_root {
                    return Err(XbelError("XBEL 根元素缺失或已结束".into()));
                }
                match name.as_str() {
                    "folder" => {
                        push_node(
                            &mut nodes,
                            parse_floccus_id(&empty)?,
                            NodeKind::Folder,
                            None,
                            &stack,
                        );
                    }
                    "bookmark" => {
                        let url = attribute_value(&empty, b"href")?
                            .ok_or_else(|| XbelError("书签缺少 href 属性".into()))?;
                        push_node(
                            &mut nodes,
                            parse_floccus_id(&empty)?,
                            NodeKind::Bookmark,
                            Some(url),
                            &stack,
                        );
                    }
                    _ => {}
                }
            }
            Event::Text(text) => {
                if let Some(element) = stack.last_mut() {
                    if element.title_target.is_some() {
                        element.title_text.push_str(
                            &text
                                .unescape()
                                .map_err(|error| XbelError(error.to_string()))?,
                        );
                    }
                }
            }
            Event::CData(text) => {
                if let Some(element) = stack.last_mut() {
                    if element.title_target.is_some() {
                        element.title_text.push_str(&String::from_utf8_lossy(&text));
                    }
                }
            }
            Event::Comment(comment) => {
                let comment = comment
                    .unescape()
                    .map_err(|error| XbelError(error.to_string()))?;
                if let Some(value) = parse_highest_id_comment(&comment)? {
                    if highest_id.replace(value).is_some() {
                        return Err(XbelError("Floccus highestId 注释重复".into()));
                    }
                }
            }
            Event::End(end) => {
                let Some(element) = stack.pop() else {
                    return Err(XbelError("XBEL 元素嵌套无效".into()));
                };
                let end_name = tag_name(end.name().as_ref());
                if element.name != end_name {
                    return Err(XbelError("XBEL 元素未正确闭合".into()));
                }
                if let Some(target) = element.title_target {
                    nodes[target].title = element.title_text.trim().to_owned();
                }
                if end_name == "xbel" {
                    closed_root = true;
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    if !saw_root || !closed_root || !stack.is_empty() {
        return Err(XbelError("XBEL 文档不完整".into()));
    }
    validate_floccus_identity(&nodes, highest_id)?;
    Ok(XbelDocument { highest_id, nodes })
}

pub fn render_xbel(document: &XbelDocument) -> Result<Vec<u8>, XbelError> {
    validate_nodes(&document.nodes)?;
    validate_floccus_identity(&document.nodes, document.highest_id)?;
    let highest_id = document
        .highest_id
        .ok_or_else(|| XbelError("缺少 Floccus highestId".into()))?;
    if document.nodes.iter().any(|node| node.floccus_id.is_none()) {
        return Err(XbelError("存在缺少 Floccus ID 的节点".into()));
    }
    let mut output = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE xbel PUBLIC \"+//IDN python.org//DTD XML Bookmark Exchange Language 1.0//EN//XML\" \"http://pyxml.sourceforge.net/topics/dtds/xbel.dtd\">\n<xbel version=\"1.0\">\n",
    );
    output.push_str(&format!(
        "<!--- highestId :{highest_id}: for Floccus bookmark sync browser extension -->\n"
    ));
    let roots = child_indices(&document.nodes, None);
    render_children(&document.nodes, &roots, 1, &mut output);
    output.push_str("</xbel>\n");
    Ok(output.into_bytes())
}

fn push_node(
    nodes: &mut Vec<XbelNode>,
    floccus_id: Option<i64>,
    kind: NodeKind,
    url: Option<String>,
    stack: &[OpenElement],
) -> usize {
    let parent = stack.iter().rev().find_map(|element| element.node_index);
    let position = nodes.iter().filter(|node| node.parent == parent).count();
    let index = nodes.len();
    nodes.push(XbelNode {
        floccus_id,
        kind,
        title: String::new(),
        url,
        parent,
        position,
    });
    index
}

fn parse_floccus_id(element: &quick_xml::events::BytesStart<'_>) -> Result<Option<i64>, XbelError> {
    let Some(value) = attribute_value(element, b"id")? else {
        return Ok(None);
    };
    let id = value
        .parse::<i64>()
        .map_err(|_| XbelError("Floccus 节点 ID 不是有效整数".into()))?;
    if id <= 0 {
        return Err(XbelError("Floccus 节点 ID 必须为正整数".into()));
    }
    Ok(Some(id))
}

fn parse_highest_id_comment(comment: &str) -> Result<Option<i64>, XbelError> {
    let Some((_, rest)) = comment.split_once("highestId :") else {
        return Ok(None);
    };
    let Some((value, _)) = rest.split_once(':') else {
        return Err(XbelError("Floccus highestId 注释格式无效".into()));
    };
    let highest_id = value
        .trim()
        .parse::<i64>()
        .map_err(|_| XbelError("Floccus highestId 不是有效整数".into()))?;
    if highest_id < 0 {
        return Err(XbelError("Floccus highestId 不能为负数".into()));
    }
    Ok(Some(highest_id))
}

fn validate_floccus_identity(nodes: &[XbelNode], highest_id: Option<i64>) -> Result<(), XbelError> {
    let mut ids = HashSet::new();
    let mut maximum = 0;
    for node in nodes {
        if let Some(id) = node.floccus_id {
            if id <= 0 {
                return Err(XbelError("Floccus 节点 ID 必须为正整数".into()));
            }
            if !ids.insert(id) {
                return Err(XbelError(format!("Floccus 节点 ID {id} 重复")));
            }
            maximum = maximum.max(id);
        }
    }
    if let Some(highest_id) = highest_id {
        if highest_id < maximum {
            return Err(XbelError("Floccus highestId 小于节点最大 ID".into()));
        }
    }
    Ok(())
}

fn attribute_value(
    element: &quick_xml::events::BytesStart<'_>,
    expected: &[u8],
) -> Result<Option<String>, XbelError> {
    for attribute in element.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| XbelError(error.to_string()))?;
        if attribute.key.as_ref() == expected {
            return attribute
                .unescape_value()
                .map(|value| Some(value.into_owned()))
                .map_err(|error| XbelError(error.to_string()));
        }
    }
    Ok(None)
}

fn tag_name(value: &[u8]) -> String {
    let value = value.rsplit(|byte| *byte == b':').next().unwrap_or(value);
    String::from_utf8_lossy(value).to_ascii_lowercase()
}

fn validate_nodes(nodes: &[XbelNode]) -> Result<(), XbelError> {
    for (index, node) in nodes.iter().enumerate() {
        match node.kind {
            NodeKind::Folder if node.url.is_some() => {
                return Err(XbelError("文件夹不能包含 URL".into()))
            }
            NodeKind::Bookmark if node.url.is_none() => {
                return Err(XbelError("书签必须包含 URL".into()))
            }
            _ => {}
        }
        if let Some(parent) = node.parent {
            if parent >= nodes.len() || !matches!(nodes[parent].kind, NodeKind::Folder) {
                return Err(XbelError(format!("节点 {index} 的父文件夹无效")));
            }
        }
    }
    Ok(())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn child_indices(nodes: &[XbelNode], parent: Option<usize>) -> Vec<usize> {
    let mut children = nodes
        .iter()
        .enumerate()
        .filter_map(|(index, node)| (node.parent == parent).then_some(index))
        .collect::<Vec<_>>();
    children.sort_by_key(|index| (nodes[*index].position, *index));
    children
}

fn render_children(nodes: &[XbelNode], children: &[usize], depth: usize, output: &mut String) {
    for index in children {
        let node = &nodes[*index];
        let indent = "  ".repeat(depth);
        match node.kind {
            NodeKind::Folder => {
                output.push_str(&format!(
                    "{indent}<folder folded=\"no\" id=\"{}\">\n",
                    node.floccus_id.unwrap_or_default()
                ));
                output.push_str(&format!(
                    "{}<title>{}</title>\n",
                    "  ".repeat(depth + 1),
                    xml_escape(&node.title)
                ));
                let children = child_indices(nodes, Some(*index));
                render_children(nodes, &children, depth + 1, output);
                output.push_str(&format!("{indent}</folder>\n"));
            }
            NodeKind::Bookmark => {
                output.push_str(&format!(
                    "{indent}<bookmark href=\"{}\" id=\"{}\"><title>{}</title></bookmark>\n",
                    xml_escape(node.url.as_deref().unwrap_or_default()),
                    node.floccus_id.unwrap_or_default(),
                    xml_escape(&node.title)
                ));
            }
        }
    }
}

#[derive(Clone, Debug)]
struct StoredNode {
    id: Uuid,
    parent_id: Option<Uuid>,
    kind: NodeKind,
    title: String,
    url: Option<String>,
    position: i32,
}

#[derive(Deserialize, Default)]
pub struct BookmarkQuery {
    pub q: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkItem {
    pub id: Uuid,
    pub title: String,
    pub url: String,
    pub parent_id: Option<Uuid>,
    pub folder_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderItem {
    pub id: Uuid,
    pub title: String,
    pub bookmark_count: usize,
    pub children: Vec<FolderItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkTreeResponse {
    pub status: &'static str,
    pub etag: Option<String>,
    pub version: Option<i64>,
    pub folders: Vec<FolderItem>,
    pub bookmarks: Vec<BookmarkItem>,
}

#[derive(Clone, Debug)]
pub struct BookmarkNodeForTrash {
    pub node_type: String,
    pub title: String,
    pub url: Option<String>,
    pub folder_path: String,
    pub position: i32,
}

pub async fn load_nodes_for_user(
    db: &SqlitePool,
    user_id: Uuid,
    node_ids: &[Uuid],
) -> Result<HashMap<Uuid, BookmarkNodeForTrash>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, parent_id, node_type, title, url, position
         FROM bookmark_nodes WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    let nodes = rows
        .into_iter()
        .map(|row| StoredNode {
            id: row.get("id"),
            parent_id: row.get("parent_id"),
            kind: match row.get::<String, _>("node_type").as_str() {
                "folder" => NodeKind::Folder,
                _ => NodeKind::Bookmark,
            },
            title: row.get("title"),
            url: row.get("url"),
            position: row.get("position"),
        })
        .collect::<Vec<_>>();
    let by_id = nodes
        .iter()
        .map(|node| (node.id, node))
        .collect::<HashMap<_, _>>();
    let requested_ids = node_ids.iter().copied().collect::<HashSet<_>>();
    Ok(nodes
        .iter()
        .filter(|node| requested_ids.contains(&node.id))
        .map(|node| {
            (
                node.id,
                BookmarkNodeForTrash {
                    node_type: match node.kind {
                        NodeKind::Folder => "folder",
                        NodeKind::Bookmark => "bookmark",
                    }
                    .into(),
                    title: node.title.clone(),
                    url: node.url.clone(),
                    folder_path: folder_path(node.parent_id, &by_id),
                    position: node.position,
                },
            )
        })
        .collect())
}

pub async fn current_bookmark_status(
    state: &AppState,
    user_id: Uuid,
    _login_identifier: &str,
) -> Result<&'static str, sqlx::Error> {
    let file_path = state
        .data_dir
        .join(user_id.to_string())
        .join("bookmarks.xbel");
    if !fs::try_exists(&file_path).await.unwrap_or(false) {
        return Ok("notReady");
    }
    let bytes = fs::read(file_path).await.map_err(sqlx::Error::Io)?;
    Ok(if is_encrypted_sync_file(&bytes) {
        "encrypted"
    } else {
        match parse_xbel(&bytes) {
            Ok(document) if document.has_complete_floccus_identity() => "ready",
            _ => "migrationRequired",
        }
    })
}

pub async fn list_bookmarks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<BookmarkQuery>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match load_bookmark_tree(&state, user.id, &user.login_identifier, query.q.as_deref()).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => {
            tracing::error!(?error, "list bookmarks failed");
            auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "bookmarks_list_failed",
                "书签列表读取失败",
            )
        }
    }
}

async fn load_bookmark_tree(
    state: &AppState,
    user_id: Uuid,
    login_identifier: &str,
    query: Option<&str>,
) -> Result<BookmarkTreeResponse, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, parent_id, node_type, title, url, position
         FROM bookmark_nodes
         WHERE user_id = $1
         ORDER BY parent_id NULLS FIRST, position, id",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;
    let nodes = rows
        .into_iter()
        .map(|row| StoredNode {
            id: row.get("id"),
            parent_id: row.get("parent_id"),
            kind: match row.get::<String, _>("node_type").as_str() {
                "folder" => NodeKind::Folder,
                _ => NodeKind::Bookmark,
            },
            title: row.get("title"),
            url: row.get("url"),
            position: row.get("position"),
        })
        .collect::<Vec<_>>();
    let file_path = state
        .data_dir
        .join(user_id.to_string())
        .join("bookmarks.xbel");
    let file_exists = fs::try_exists(&file_path).await.unwrap_or(false);
    let metadata = if file_exists {
        sqlx::query("SELECT etag, version FROM dav_files WHERE user_id = $1 AND path = $2")
            .bind(user_id)
            .bind(format!("{login_identifier}/bookmarks.xbel"))
            .fetch_optional(&state.db)
            .await?
    } else {
        None
    };
    let status = if file_exists {
        match fs::read(&file_path).await {
            Ok(bytes) if is_encrypted_sync_file(&bytes) => "encrypted",
            Ok(bytes) => match parse_xbel(&bytes) {
                Ok(document) if document.has_complete_floccus_identity() => "ready",
                _ => "migrationRequired",
            },
            Err(_) => "notReady",
        }
    } else {
        "notReady"
    };
    let metadata: Option<(String, i64)> = metadata.map(|row| (row.get("etag"), row.get("version")));
    let (folders, bookmarks) = build_response_nodes(&nodes, query);
    Ok(BookmarkTreeResponse {
        status,
        etag: metadata.as_ref().map(|value| value.0.clone()),
        version: metadata.as_ref().map(|value| value.1),
        folders,
        bookmarks,
    })
}

fn is_encrypted_sync_file(bytes: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return false;
    };
    let Some(object) = value.as_object() else {
        return false;
    };
    object
        .get("ciphertext")
        .and_then(serde_json::Value::as_str)
        .is_some()
        && object
            .get("salt")
            .and_then(serde_json::Value::as_str)
            .is_some()
}

fn build_response_nodes(
    nodes: &[StoredNode],
    query: Option<&str>,
) -> (Vec<FolderItem>, Vec<BookmarkItem>) {
    let by_id = nodes
        .iter()
        .map(|node| (node.id, node))
        .collect::<HashMap<_, _>>();
    let normalized_query = query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let mut bookmarks = nodes
        .iter()
        .filter_map(|node| {
            let NodeKind::Bookmark = node.kind else {
                return None;
            };
            let url = node.url.clone()?;
            let folder_path = folder_path(node.parent_id, &by_id);
            let searchable = format!("{} {} {}", node.title, url, folder_path).to_lowercase();
            if normalized_query
                .as_ref()
                .is_some_and(|value| !searchable.contains(value))
            {
                return None;
            }
            Some(BookmarkItem {
                id: node.id,
                title: node.title.clone(),
                url,
                parent_id: node.parent_id,
                folder_path,
            })
        })
        .collect::<Vec<_>>();
    bookmarks.sort_by_key(|item| item.title.to_lowercase());
    let folders = build_folder_items(None, nodes, &by_id);
    (folders, bookmarks)
}

fn folder_path(parent_id: Option<Uuid>, by_id: &HashMap<Uuid, &StoredNode>) -> String {
    let mut path = Vec::new();
    let mut current = parent_id;
    let mut seen = HashSet::new();
    while let Some(id) = current {
        if !seen.insert(id) {
            break;
        }
        let Some(node) = by_id.get(&id) else {
            break;
        };
        path.push(node.title.clone());
        current = node.parent_id;
    }
    path.reverse();
    path.join(" / ")
}

fn build_folder_items(
    parent_id: Option<Uuid>,
    nodes: &[StoredNode],
    by_id: &HashMap<Uuid, &StoredNode>,
) -> Vec<FolderItem> {
    let mut folders = nodes
        .iter()
        .filter(|node| node.parent_id == parent_id && matches!(node.kind, NodeKind::Folder))
        .map(|node| FolderItem {
            id: node.id,
            title: node.title.clone(),
            bookmark_count: count_descendant_bookmarks(node.id, nodes, by_id),
            children: build_folder_items(Some(node.id), nodes, by_id),
        })
        .collect::<Vec<_>>();
    folders.sort_by_key(|folder| folder.title.to_lowercase());
    folders
}

fn count_descendant_bookmarks(
    folder_id: Uuid,
    nodes: &[StoredNode],
    by_id: &HashMap<Uuid, &StoredNode>,
) -> usize {
    nodes
        .iter()
        .filter(|node| {
            matches!(node.kind, NodeKind::Bookmark)
                && is_descendant(node.parent_id, folder_id, by_id)
        })
        .count()
}

fn is_descendant(
    mut current: Option<Uuid>,
    ancestor: Uuid,
    by_id: &HashMap<Uuid, &StoredNode>,
) -> bool {
    let mut seen = HashSet::new();
    while let Some(id) = current {
        if id == ancestor {
            return true;
        }
        if !seen.insert(id) {
            return false;
        }
        current = by_id.get(&id).and_then(|node| node.parent_id);
    }
    false
}

fn folder_move_creates_cycle(
    folder_id: Uuid,
    target_parent_id: Option<Uuid>,
    parent_by_id: &HashMap<Uuid, Option<Uuid>>,
) -> bool {
    let mut current = target_parent_id;
    let mut seen = HashSet::new();
    while let Some(id) = current {
        if id == folder_id {
            return true;
        }
        if !seen.insert(id) {
            return true;
        }
        current = parent_by_id.get(&id).copied().flatten();
    }
    false
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovePayload {
    pub bookmark_id: Uuid,
    pub parent_id: Uuid,
    pub expected_etag: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveBatchPayload {
    pub bookmark_ids: Vec<Uuid>,
    pub parent_id: Uuid,
    pub expected_etag: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFolderPayload {
    pub folder_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub expected_etag: Option<String>,
}

pub async fn move_bookmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MovePayload>,
) -> Response {
    move_bookmarks_impl(
        &state,
        &headers,
        vec![payload.bookmark_id],
        payload.parent_id,
        payload.expected_etag,
    )
    .await
}

pub async fn move_bookmarks_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MoveBatchPayload>,
) -> Response {
    if payload.bookmark_ids.is_empty() {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "empty_selection",
            "至少选择一个书签",
        );
    }
    move_bookmarks_impl(
        &state,
        &headers,
        payload.bookmark_ids,
        payload.parent_id,
        payload.expected_etag,
    )
    .await
}

pub async fn move_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MoveFolderPayload>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if payload.parent_id == Some(payload.folder_id) {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_target",
            "不能将文件夹移动到自身",
        );
    }
    if let Err(response) = crate::webdav::ensure_bookmark_editable(
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
            tracing::error!(?error, "start folder move transaction failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "folder_move_failed",
                "文件夹移动失败",
            );
        }
    };
    let source = sqlx::query(
        "SELECT parent_id FROM bookmark_nodes WHERE id = $1 AND user_id = $2 AND node_type = 'folder'",
    )
    .bind(payload.folder_id)
    .bind(user.id)
    .fetch_optional(&mut *transaction)
    .await;
    let Ok(Some(source)) = source else {
        return auth::error(StatusCode::NOT_FOUND, "folder_not_found", "源文件夹不存在");
    };
    let current_parent_id = source.get::<Option<Uuid>, _>("parent_id");
    if current_parent_id == payload.parent_id {
        return Json(json!({ "moved": true, "unchanged": true, "etag": payload.expected_etag }))
            .into_response();
    }

    if let Some(parent_id) = payload.parent_id {
        let target = sqlx::query(
            "SELECT 1 FROM bookmark_nodes WHERE id = $1 AND user_id = $2 AND node_type = 'folder'",
        )
        .bind(parent_id)
        .bind(user.id)
        .fetch_optional(&mut *transaction)
        .await;
        if !matches!(target, Ok(Some(_))) {
            return auth::error(
                StatusCode::NOT_FOUND,
                "folder_not_found",
                "目标文件夹不存在",
            );
        }
        let folder_rows = sqlx::query(
            "SELECT id, parent_id FROM bookmark_nodes WHERE user_id = $1 AND node_type = 'folder'",
        )
        .bind(user.id)
        .fetch_all(&mut *transaction)
        .await;
        let Ok(folder_rows) = folder_rows else {
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "folder_move_failed",
                "文件夹关系检查失败",
            );
        };
        let parent_by_id = folder_rows
            .into_iter()
            .map(|row| {
                (
                    row.get::<Uuid, _>("id"),
                    row.get::<Option<Uuid>, _>("parent_id"),
                )
            })
            .collect::<HashMap<_, _>>();
        if folder_move_creates_cycle(payload.folder_id, Some(parent_id), &parent_by_id) {
            return auth::error(
                StatusCode::BAD_REQUEST,
                "folder_cycle",
                "不能将文件夹移动到自己的子文件夹中",
            );
        }
    }

    let next_position = match payload.parent_id {
        Some(parent_id) => sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM bookmark_nodes WHERE user_id = $1 AND parent_id = $2",
        )
        .bind(user.id)
        .bind(parent_id)
        .fetch_one(&mut *transaction)
        .await,
        None => sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM bookmark_nodes WHERE user_id = $1 AND parent_id IS NULL",
        )
        .bind(user.id)
        .fetch_one(&mut *transaction)
        .await,
    };
    let Ok(next_position) = next_position else {
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "folder_move_failed",
            "目标位置读取失败",
        );
    };
    if sqlx::query(
        "UPDATE bookmark_nodes SET parent_id = $1, position = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 AND node_type = 'folder'",
    )
    .bind(payload.parent_id)
    .bind(next_position)
    .bind(payload.folder_id)
    .bind(user.id)
    .execute(&mut *transaction)
    .await
    .is_err()
    {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "folder_move_failed", "文件夹移动失败");
    }
    if transaction.commit().await.is_err() {
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "folder_move_failed",
            "文件夹移动失败",
        );
    }
    match crate::webdav::rewrite_bookmark_file(&state, user.id, &user.login_identifier).await {
        Ok(response) => Json(json!({ "moved": true, "folderId": payload.folder_id, "parentId": payload.parent_id, "etag": response.0, "version": response.1 })).into_response(),
        Err(response) => response,
    }
}

async fn move_bookmarks_impl(
    state: &AppState,
    headers: &HeaderMap,
    bookmark_ids: Vec<Uuid>,
    parent_id: Uuid,
    expected_etag: Option<String>,
) -> Response {
    let Some(user) = auth::authenticate_session(state, headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if bookmark_ids.iter().any(|id| *id == parent_id) {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_target",
            "不能将书签移动到自身",
        );
    }
    if let Err(response) = crate::webdav::ensure_bookmark_editable(
        state,
        user.id,
        &user.login_identifier,
        expected_etag.as_deref(),
    )
    .await
    {
        return response;
    }
    let mut transaction = match state.db.begin().await {
        Ok(transaction) => transaction,
        Err(error) => {
            tracing::error!(?error, "start bookmark move transaction failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "move_failed",
                "书签移动失败",
            );
        }
    };
    let parent_exists = sqlx::query(
        "SELECT 1 FROM bookmark_nodes WHERE id = $1 AND user_id = $2 AND node_type = 'folder'",
    )
    .bind(parent_id)
    .bind(user.id)
    .fetch_optional(&mut *transaction)
    .await;
    if !matches!(parent_exists, Ok(Some(_))) {
        return auth::error(
            StatusCode::NOT_FOUND,
            "folder_not_found",
            "目标文件夹不存在",
        );
    }
    let ids = bookmark_ids.iter().copied().collect::<HashSet<_>>();
    if ids.len() != bookmark_ids.len() {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "duplicate_selection",
            "书签选择不能重复",
        );
    }
    let placeholders = std::iter::repeat_n("?", bookmark_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, node_type FROM bookmark_nodes WHERE user_id = ? AND id IN ({placeholders})"
    );
    let mut rows_query = sqlx::query(&query).bind(user.id);
    for bookmark_id in &bookmark_ids {
        rows_query = rows_query.bind(*bookmark_id);
    }
    let rows = rows_query.fetch_all(&mut *transaction).await;
    let Ok(rows) = rows else {
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "move_failed",
            "书签读取失败",
        );
    };
    if rows.len() != bookmark_ids.len()
        || rows
            .iter()
            .any(|row| row.get::<String, _>("node_type") != "bookmark")
    {
        return auth::error(
            StatusCode::NOT_FOUND,
            "bookmark_not_found",
            "部分书签不存在",
        );
    }
    let next_position = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM bookmark_nodes WHERE user_id = $1 AND parent_id = $2",
    )
    .bind(user.id)
    .bind(parent_id)
    .fetch_one(&mut *transaction)
    .await;
    let Ok(mut position) = next_position else {
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "move_failed",
            "目标文件夹读取失败",
        );
    };
    for bookmark_id in bookmark_ids {
        if sqlx::query(
            "UPDATE bookmark_nodes SET parent_id = $1, position = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4",
        )
        .bind(parent_id)
        .bind(position)
        .bind(bookmark_id)
        .bind(user.id)
        .execute(&mut *transaction)
        .await
        .is_err()
        {
            return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "move_failed", "书签移动失败");
        }
        position += 1;
    }
    if transaction.commit().await.is_err() {
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "move_failed",
            "书签移动失败",
        );
    }
    match crate::webdav::rewrite_bookmark_file(state, user.id, &user.login_identifier).await {
        Ok(response) => Json(
            json!({ "moved": true, "count": ids.len(), "etag": response.0, "version": response.1 }),
        )
        .into_response(),
        Err(response) => response,
    }
}

pub async fn replace_index(
    db: &SqlitePool,
    user_id: Uuid,
    parsed: &XbelDocument,
) -> Result<(), sqlx::Error> {
    let mut transaction = db.begin().await?;
    let stored_highest = sqlx::query_scalar::<_, i64>(
        "SELECT highest_id FROM bookmark_sync_state WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .unwrap_or(0);
    let supplied_maximum = parsed
        .nodes
        .iter()
        .filter_map(|node| node.floccus_id)
        .max()
        .unwrap_or(0);
    let mut highest_id = stored_highest
        .max(parsed.highest_id.unwrap_or(0))
        .max(supplied_maximum);
    sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    let mut ids = Vec::with_capacity(parsed.nodes.len());
    for node in &parsed.nodes {
        let id = Uuid::new_v4();
        let parent_id = node.parent.and_then(|parent| ids.get(parent).copied());
        let floccus_id = match node.floccus_id {
            Some(id) => id,
            None => {
                highest_id += 1;
                highest_id
            }
        };
        sqlx::query(
            "INSERT INTO bookmark_nodes (id, user_id, parent_id, floccus_id, node_type, title, url, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(id)
        .bind(user_id)
        .bind(parent_id)
        .bind(floccus_id)
        .bind(match node.kind {
            NodeKind::Folder => "folder",
            NodeKind::Bookmark => "bookmark",
        })
        .bind(&node.title)
        .bind(&node.url)
        .bind(node.position as i32)
        .execute(&mut *transaction)
        .await?;
        ids.push(id);
    }
    sqlx::query(
        "INSERT INTO bookmark_sync_state (user_id, highest_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           highest_id = MAX(bookmark_sync_state.highest_id, excluded.highest_id),
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user_id)
    .bind(highest_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await
}

pub async fn load_index(db: &SqlitePool, user_id: Uuid) -> Result<XbelDocument, sqlx::Error> {
    let mut transaction = db.begin().await?;
    let mut highest_id = sqlx::query_scalar::<_, i64>(
        "SELECT highest_id FROM bookmark_sync_state WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .unwrap_or(0);
    let missing_ids = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM bookmark_nodes WHERE user_id = $1 AND floccus_id IS NULL
         ORDER BY created_at, id",
    )
    .bind(user_id)
    .fetch_all(&mut *transaction)
    .await?;
    for id in missing_ids {
        highest_id += 1;
        sqlx::query("UPDATE bookmark_nodes SET floccus_id = $1 WHERE id = $2 AND user_id = $3")
            .bind(highest_id)
            .bind(id)
            .bind(user_id)
            .execute(&mut *transaction)
            .await?;
    }
    let rows = sqlx::query(
        "SELECT id, parent_id, floccus_id, node_type, title, url, position
         FROM bookmark_nodes WHERE user_id = $1 ORDER BY parent_id NULLS FIRST, position, id",
    )
    .bind(user_id)
    .fetch_all(&mut *transaction)
    .await?;
    let maximum = rows
        .iter()
        .filter_map(|row| row.get::<Option<i64>, _>("floccus_id"))
        .max()
        .unwrap_or(0);
    highest_id = highest_id.max(maximum);
    sqlx::query(
        "INSERT INTO bookmark_sync_state (user_id, highest_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           highest_id = MAX(bookmark_sync_state.highest_id, excluded.highest_id),
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user_id)
    .bind(highest_id)
    .execute(&mut *transaction)
    .await?;
    let mut index_by_id = HashMap::new();
    for (index, row) in rows.iter().enumerate() {
        index_by_id.insert(row.get::<Uuid, _>("id"), index);
    }
    let nodes = rows
        .iter()
        .map(|row| XbelNode {
            floccus_id: row.get("floccus_id"),
            kind: if row.get::<String, _>("node_type") == "folder" {
                NodeKind::Folder
            } else {
                NodeKind::Bookmark
            },
            title: row.get("title"),
            url: row.get("url"),
            parent: row
                .get::<Option<Uuid>, _>("parent_id")
                .and_then(|id| index_by_id.get(&id).copied()),
            position: row.get::<i32, _>("position") as usize,
        })
        .collect();
    transaction.commit().await?;
    Ok(XbelDocument {
        highest_id: Some(highest_id),
        nodes,
    })
}

pub async fn allocate_floccus_id(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user_id: Uuid,
) -> Result<i64, sqlx::Error> {
    let stored_highest = sqlx::query_scalar::<_, i64>(
        "SELECT highest_id FROM bookmark_sync_state WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut **transaction)
    .await?
    .unwrap_or(0);
    let node_maximum = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(floccus_id), 0) FROM bookmark_nodes WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&mut **transaction)
    .await?;
    let next_id = stored_highest.max(node_maximum) + 1;
    sqlx::query(
        "INSERT INTO bookmark_sync_state (user_id, highest_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           highest_id = excluded.highest_id,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user_id)
    .bind(next_id)
    .execute(&mut **transaction)
    .await?;
    Ok(next_id)
}
#[cfg(test)]
mod tests {
    use super::{
        allocate_floccus_id, folder_move_creates_cycle, is_encrypted_sync_file, load_index,
        parse_xbel, render_xbel, replace_index, NodeKind,
    };
    use sqlx::{sqlite::SqlitePoolOptions, Row};
    use std::collections::HashMap;
    use uuid::Uuid;

    #[test]
    fn rejects_folder_moves_into_self_or_descendants() {
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        let grandchild = Uuid::new_v4();
        let sibling = Uuid::new_v4();
        let parents = HashMap::from([
            (root, None),
            (child, Some(root)),
            (grandchild, Some(child)),
            (sibling, None),
        ]);

        assert!(folder_move_creates_cycle(root, Some(root), &parents));
        assert!(folder_move_creates_cycle(root, Some(child), &parents));
        assert!(folder_move_creates_cycle(root, Some(grandchild), &parents));
        assert!(!folder_move_creates_cycle(child, Some(sibling), &parents));
        assert!(!folder_move_creates_cycle(child, None, &parents));
    }

    #[test]
    fn parses_nested_folders_and_preserves_sibling_order() {
        let nodes = parse_xbel(
            "<?xml version=\"1.0\"?><xbel version=\"1.0\"><folder><title>工作 &amp; 研究</title><bookmark href=\"https://example.com?a=1&amp;b=2\"><title>示例</title></bookmark><folder><title>资料</title><bookmark href=\"https://rust-lang.org\"><title>Rust</title></bookmark></folder></folder><bookmark href=\"https://example.org\"><title>首页</title></bookmark></xbel>".as_bytes(),
        )
        .expect("valid XBEL");

        assert_eq!(nodes.len(), 5);
        assert_eq!(nodes[0].kind, NodeKind::Folder);
        assert_eq!(nodes[0].title, "工作 & 研究");
        assert_eq!(nodes[1].parent, Some(0));
        assert_eq!(nodes[1].position, 0);
        assert_eq!(nodes[2].parent, Some(0));
        assert_eq!(nodes[2].position, 1);
        assert_eq!(nodes[4].parent, None);
        assert_eq!(nodes[4].position, 1);
    }

    async fn test_db() -> sqlx::SqlitePool {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("test database");
        sqlx::migrate!("../../migrations")
            .run(&db)
            .await
            .expect("test migrations");
        db
    }

    async fn create_test_user(db: &sqlx::SqlitePool, user_id: Uuid) {
        sqlx::query(
            "INSERT INTO users (id, login_identifier, password_hash) VALUES ($1, $2, 'hash')",
        )
        .bind(user_id)
        .bind(format!("{user_id}@example.com"))
        .execute(db)
        .await
        .expect("test user");
    }

    #[tokio::test]
    async fn generic_xbel_receives_ids_before_rendering() {
        let db = test_db().await;
        let user_id = Uuid::new_v4();
        create_test_user(&db, user_id).await;
        let parsed = parse_xbel(
            br#"<xbel><bookmark href="https://example.com"><title>A &amp; B</title></bookmark><folder><title>Folder</title></folder></xbel>"#,
        )
        .expect("valid generic XBEL");

        replace_index(&db, user_id, &parsed)
            .await
            .expect("indexed XBEL");
        let indexed = load_index(&db, user_id).await.expect("loaded index");
        assert_eq!(indexed.highest_id, Some(2));
        assert_eq!(indexed.nodes[0].floccus_id, Some(1));
        assert_eq!(indexed.nodes[1].floccus_id, Some(2));

        let rendered = render_xbel(&indexed).expect("rendered XBEL");
        let reparsed = parse_xbel(&rendered).expect("rendered XBEL parses");
        assert_eq!(indexed, reparsed);
    }

    #[tokio::test]
    async fn move_and_delete_keep_remaining_ids_and_highest_id() {
        let db = test_db().await;
        let user_id = Uuid::new_v4();
        create_test_user(&db, user_id).await;
        let parsed = parse_xbel(
            br#"<xbel><!--- highestId :12: for Floccus bookmark sync browser extension --><folder id="10"><title>Folder</title><bookmark href="https://a.example" id="11"><title>A</title></bookmark></folder><bookmark href="https://b.example" id="12"><title>B</title></bookmark></xbel>"#,
        )
        .expect("valid Floccus XBEL");
        replace_index(&db, user_id, &parsed)
            .await
            .expect("indexed XBEL");

        let rows = sqlx::query(
            "SELECT id, floccus_id FROM bookmark_nodes WHERE user_id = $1 ORDER BY floccus_id",
        )
        .bind(user_id)
        .fetch_all(&db)
        .await
        .expect("stored nodes");
        let folder_id: Uuid = rows[0].get("id");
        let nested_id: Uuid = rows[1].get("id");
        let root_bookmark_id: Uuid = rows[2].get("id");
        sqlx::query("UPDATE bookmark_nodes SET parent_id = $1 WHERE id = $2 AND user_id = $3")
            .bind(folder_id)
            .bind(root_bookmark_id)
            .bind(user_id)
            .execute(&db)
            .await
            .expect("move bookmark");
        sqlx::query("DELETE FROM bookmark_nodes WHERE id = $1 AND user_id = $2")
            .bind(nested_id)
            .bind(user_id)
            .execute(&db)
            .await
            .expect("delete bookmark");

        let indexed = load_index(&db, user_id).await.expect("loaded index");
        assert_eq!(indexed.highest_id, Some(12));
        assert_eq!(
            indexed
                .nodes
                .iter()
                .map(|node| node.floccus_id)
                .collect::<Vec<_>>(),
            vec![Some(10), Some(12)]
        );
        assert_eq!(indexed.nodes[1].parent, Some(0));

        let mut transaction = db.begin().await.expect("restore transaction");
        let restored_id = allocate_floccus_id(&mut transaction, user_id)
            .await
            .expect("new Floccus ID");
        transaction.commit().await.expect("commit restored ID");
        assert_eq!(restored_id, 13);
    }

    #[test]
    fn preserves_floccus_node_ids_and_highest_id() {
        let input = br#"<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0">
<!--- highestId :8: for Floccus bookmark sync browser extension -->
<folder id="7"><title>Folder</title><bookmark href="https://example.com" id="8"><title>Example</title></bookmark></folder>
</xbel>"#;
        let parsed = parse_xbel(input).expect("valid Floccus XBEL");
        assert_eq!(parsed.highest_id, Some(8));
        assert_eq!(parsed.nodes[0].floccus_id, Some(7));
        assert_eq!(parsed.nodes[1].floccus_id, Some(8));

        let rendered =
            String::from_utf8(render_xbel(&parsed).expect("rendered XBEL")).expect("UTF-8 XBEL");
        assert!(rendered.contains("highestId :8:"));
        assert!(rendered.contains("<folder folded=\"no\" id=\"7\">"));
        assert!(rendered.contains("id=\"8\""));
    }

    #[test]
    fn rejects_encrypted_or_invalid_documents() {
        assert!(parse_xbel(b"encrypted-bookmarks").is_err());
        assert!(
            parse_xbel(br#"<xbel><bookmark><title>Missing URL</title></bookmark></xbel>"#).is_err()
        );
    }

    #[test]
    fn recognizes_floccus_encrypted_sync_envelope() {
        assert!(is_encrypted_sync_file(
            br#"{"ciphertext":"payload","salt":"secret"}"#
        ));
        assert!(!is_encrypted_sync_file(br#"<xbel version="1.0"></xbel>"#));
    }
}
