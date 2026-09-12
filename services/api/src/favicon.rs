use crate::auth;
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::{redirect, Client};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    net::{Ipv4Addr, Ipv6Addr},
    path::{Path as FilePath, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{fs, sync::Semaphore, task::JoinSet};
use url::Url;

const MAX_BATCH_ITEMS: usize = 2_000;
const MAX_HTML_BYTES: usize = 1_024 * 1_024;
const MAX_ICON_BYTES: usize = 512 * 1_024;
const INLINE_ICON_BYTES: usize = 16 * 1_024;
const MAX_REDIRECTS: usize = 4;
const MISSING_ICON_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Deserialize)]
pub struct ResolveBatchPayload {
    pub urls: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFavicon {
    pub origin: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

#[derive(Serialize)]
pub struct ResolveBatchResponse {
    pub items: Vec<ResolvedFavicon>,
}

#[derive(Clone)]
struct CachedIcon {
    bytes: Vec<u8>,
    content_type: String,
}

pub async fn resolve_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ResolveBatchPayload>,
) -> Response {
    if auth::authenticate_session(&state, &headers).await.is_none() {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    }
    if payload.urls.len() > MAX_BATCH_ITEMS {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "favicon_batch_too_large",
            "一次最多解析 2000 个网站图标",
        );
    }

    let mut origins = payload
        .urls
        .iter()
        .filter_map(|value| normalize_origin(value))
        .collect::<Vec<_>>();
    origins.sort();
    origins.dedup();

    let client = match build_client() {
        Ok(client) => client,
        Err(error) => {
            tracing::error!(?error, "favicon HTTP client creation failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "favicon_client_failed",
                "网站图标服务初始化失败",
            );
        }
    };
    let semaphore = Arc::new(Semaphore::new(32));
    let mut tasks = JoinSet::new();
    for origin in origins {
        let client = client.clone();
        let semaphore = semaphore.clone();
        let data_dir = state.data_dir.clone();
        tasks.spawn(async move {
            let _permit = semaphore.acquire_owned().await.ok()?;
            let key = cache_key(&origin);
            let cache_path = cache_path(&data_dir, &key);
            if let Some(icon) = read_cached_icon(&cache_path).await {
                return Some(resolved_favicon(origin, &key, &icon));
            }
            if missing_icon_is_fresh(&cache_path).await {
                return None;
            }
            let Some(icon) = discover_favicon(&client, &origin).await.ok().flatten() else {
                let _ = write_missing_marker(&cache_path).await;
                return None;
            };
            if write_cached_icon(&cache_path, &icon).await.is_err() {
                return None;
            }
            Some(resolved_favicon(origin, &key, &icon))
        });
    }

    let mut items = Vec::new();
    while let Some(result) = tasks.join_next().await {
        if let Ok(Some(item)) = result {
            items.push(item);
        }
    }
    items.sort_by(|left, right| left.origin.cmp(&right.origin));
    Json(ResolveBatchResponse { items }).into_response()
}

pub async fn serve_cached(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Response {
    if auth::authenticate_session(&state, &headers).await.is_none() {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    }
    if !is_valid_key(&key) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = cache_path(&state.data_dir, &key);
    let Some(icon) = read_cached_icon(&path).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mut response = icon.bytes.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&icon.content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=604800, immutable"),
    );
    response
}

fn build_client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(3))
        .redirect(redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                attempt.stop()
            } else if is_safe_remote_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .user_agent("WOTTY-Bookmark-Favicon/1.0")
        .build()
}

async fn discover_favicon(
    client: &Client,
    origin: &str,
) -> Result<Option<CachedIcon>, reqwest::Error> {
    let (page_url, mut candidates) = match client.get(origin).send().await {
        Ok(homepage) => {
            let page_url = homepage.url().clone();
            let html = read_limited(homepage, MAX_HTML_BYTES).await.unwrap_or_default();
            (page_url.clone(), parse_icon_links(&html, &page_url))
        }
        Err(_) => (Url::parse(origin).expect("origin was normalized before discovery"), Vec::new()),
    };
    for path in [
        "/favicon.ico",
        "/favicon.svg",
        "/favicon.png",
        "/favicon-32x32.png",
        "/favicon-16x16.png",
        "/apple-touch-icon.png",
        "/apple-touch-icon-precomposed.png",
    ] {
        if let Ok(url) = page_url.join(path) {
            candidates.push(url);
        }
    }
    let candidates = candidates
        .into_iter()
        .filter(|candidate| is_safe_remote_url(candidate))
        .map(|candidate| candidate.to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .take(20)
        .filter_map(|value| Url::parse(&value).ok())
        .collect::<Vec<_>>();
    let mut tasks = JoinSet::new();
    for candidate in candidates {
        let client = client.clone();
        tasks.spawn(async move { fetch_icon_candidate(&client, candidate).await });
    }
    while let Some(result) = tasks.join_next().await {
        if let Ok(Some(icon)) = result {
            tasks.abort_all();
            return Ok(Some(icon));
        }
    }
    Ok(None)
}

async fn fetch_icon_candidate(client: &Client, candidate: Url) -> Option<CachedIcon> {
    let response = client.get(candidate.clone()).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let declared_content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let bytes = read_limited(response, MAX_ICON_BYTES).await.ok()?;
    if bytes.is_empty() {
        return None;
    }
    let content_type = declared_content_type
        .as_deref()
        .and_then(normalize_image_content_type)
        .or_else(|| infer_image_content_type_from_bytes(&bytes))
        .or_else(|| {
            let declared_is_missing = declared_content_type.is_none();
            let declared_is_generic = declared_content_type
                .as_deref()
                .map(|value| value.split(';').next().unwrap_or(value).trim().eq_ignore_ascii_case("application/octet-stream"))
                .unwrap_or(false);
            (declared_is_missing || declared_is_generic).then(|| infer_image_content_type(&candidate)).flatten()
        })?;
    Some(CachedIcon { bytes, content_type })
}

async fn read_limited(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, reqwest::Error> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Ok(Vec::new());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Ok(Vec::new());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn parse_icon_links(html: &[u8], base: &Url) -> Vec<Url> {
    let text = String::from_utf8_lossy(html);
    let mut output = Vec::new();
    for tag in text
        .split('<')
        .filter_map(|part| part.split_once('>'))
        .map(|(tag, _)| tag)
    {
        let lower = tag.to_ascii_lowercase();
        if !lower.starts_with("link") && !lower.contains(" link") {
            continue;
        }
        let rel = attribute_value(tag, "rel")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !rel.split_whitespace().any(|value| {
            value == "icon"
                || value == "shortcut"
                || value.starts_with("apple-touch-icon")
                || value == "mask-icon"
        }) {
            continue;
        }
        let Some(href) = attribute_value(tag, "href") else {
            continue;
        };
        if let Ok(url) = base.join(&href) {
            output.push(url);
        }
    }
    output
}

fn attribute_value(tag: &str, name: &str) -> Option<String> {
    let bytes = tag.as_bytes();
    let name_bytes = name.as_bytes();
    let mut index = 0;
    while index + name_bytes.len() < bytes.len() {
        if !bytes[index..].starts_with(name_bytes)
            || index > 0 && bytes[index - 1].is_ascii_alphanumeric()
        {
            index += 1;
            continue;
        }
        let mut cursor = index + name_bytes.len();
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            index += 1;
            continue;
        }
        cursor += 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return None;
        }
        let quote = bytes[cursor];
        if quote == b'\'' || quote == b'"' {
            let start = cursor + 1;
            let end = bytes[start..].iter().position(|byte| *byte == quote)? + start;
            return Some(tag[start..end].to_string());
        }
        let start = cursor;
        let end = bytes[start..]
            .iter()
            .position(|byte| byte.is_ascii_whitespace())
            .map(|value| value + start)
            .unwrap_or(bytes.len());
        return Some(tag[start..end].trim_end_matches('/').to_string());
    }
    None
}

fn normalize_image_content_type(value: &str) -> Option<String> {
    let value = value.split(';').next()?.trim().to_ascii_lowercase();
    matches!(
        value.as_str(),
        "image/x-icon"
            | "image/vnd.microsoft.icon"
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp"
            | "image/svg+xml"
    )
    .then_some(value)
}

fn infer_image_content_type(url: &Url) -> Option<String> {
    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".ico") {
        Some("image/x-icon".to_owned())
    } else if path.ends_with(".svg") {
        Some("image/svg+xml".to_owned())
    } else if path.ends_with(".png") {
        Some("image/png".to_owned())
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        Some("image/jpeg".to_owned())
    } else if path.ends_with(".gif") {
        Some("image/gif".to_owned())
    } else if path.ends_with(".webp") {
        Some("image/webp".to_owned())
    } else {
        None
    }
}

fn infer_image_content_type_from_bytes(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png".to_owned())
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif".to_owned())
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg".to_owned())
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp".to_owned())
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        Some("image/x-icon".to_owned())
    } else {
        let text = String::from_utf8_lossy(bytes);
        let trimmed = text.trim_start_matches(['\u{feff}', ' ', '\t', '\r', '\n']);
        trimmed.contains("<svg").then_some("image/svg+xml".to_owned())
    }
}

fn normalize_origin(value: &str) -> Option<String> {
    let parsed = Url::parse(value).ok()?;
    if !is_safe_remote_url(&parsed) {
        return None;
    }
    Some(parsed.origin().ascii_serialization())
}

fn is_safe_remote_url(url: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host.ends_with(".local")
    {
        return false;
    }
    match url.host() {
        Some(url::Host::Ipv4(address)) => !is_private_ipv4(address),
        Some(url::Host::Ipv6(address)) => !is_private_ipv6(address),
        _ => true,
    }
}

fn is_private_ipv4(address: Ipv4Addr) -> bool {
    address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_broadcast()
        || address.is_unspecified()
        || address.octets()[0] == 100 && (64..=127).contains(&address.octets()[1])
        || address.octets()[0] == 169 && address.octets()[1] == 254
}

fn is_private_ipv6(address: Ipv6Addr) -> bool {
    address.is_loopback()
        || address.is_unspecified()
        || address.segments()[0] & 0xfe00 == 0xfc00
        || address.segments()[0] & 0xffc0 == 0xfe80
}

fn resolved_favicon(origin: String, key: &str, icon: &CachedIcon) -> ResolvedFavicon {
    let data_url = (icon.bytes.len() <= INLINE_ICON_BYTES).then(|| {
        format!(
            "data:{};base64,{}",
            icon.content_type,
            base64::engine::general_purpose::STANDARD.encode(&icon.bytes)
        )
    });
    ResolvedFavicon {
        origin,
        url: format!("/api/v1/library/favicons/{key}"),
        data_url,
    }
}

fn cache_key(origin: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(origin.as_bytes()))
}

fn cache_path(data_dir: &FilePath, key: &str) -> PathBuf {
    data_dir.join("favicon-cache").join(format!("{key}.bin"))
}

fn metadata_path(path: &FilePath) -> PathBuf {
    path.with_extension("meta")
}

fn is_valid_key(key: &str) -> bool {
    key.len() == 43
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

async fn write_cached_icon(path: &FilePath, icon: &CachedIcon) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temp, &icon.bytes).await?;
    fs::rename(&temp, path).await?;
    let _ = fs::remove_file(missing_marker_path(path)).await;
    fs::write(metadata_path(path), &icon.content_type).await
}

fn missing_marker_path(path: &FilePath) -> PathBuf {
    path.with_extension("missing")
}

async fn write_missing_marker(path: &FilePath) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(missing_marker_path(path), chrono::Utc::now().to_rfc3339()).await
}

async fn missing_icon_is_fresh(path: &FilePath) -> bool {
    let Ok(metadata) = fs::metadata(missing_marker_path(path)).await else {
        return false;
    };
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|age| age < MISSING_ICON_TTL)
}

async fn read_cached_icon(path: &FilePath) -> Option<CachedIcon> {
    let bytes = fs::read(path).await.ok()?;
    if bytes.len() > MAX_ICON_BYTES {
        return None;
    }
    let content_type = fs::read_to_string(metadata_path(path)).await.ok()?;
    let content_type = normalize_image_content_type(&content_type)?;
    Some(CachedIcon {
        bytes,
        content_type,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        attribute_value, is_private_ipv4, is_private_ipv6, is_safe_remote_url, normalize_origin,
        infer_image_content_type_from_bytes, parse_icon_links,
    };
    use std::net::{Ipv4Addr, Ipv6Addr};
    use url::Url;

    #[test]
    fn rejects_private_and_non_http_targets() {
        assert!(!is_safe_remote_url(
            &Url::parse("http://127.0.0.1").unwrap()
        ));
        assert!(!is_safe_remote_url(
            &Url::parse("http://localhost").unwrap()
        ));
        assert!(!is_safe_remote_url(
            &Url::parse("file:///tmp/icon").unwrap()
        ));
        assert!(is_private_ipv4(Ipv4Addr::new(10, 0, 0, 1)));
        assert!(is_private_ipv6(Ipv6Addr::LOCALHOST));
    }

    #[test]
    fn normalizes_bookmark_to_origin() {
        assert_eq!(
            normalize_origin("https://www.example.com/docs?q=1").as_deref(),
            Some("https://www.example.com")
        );
        assert_eq!(normalize_origin("chrome://settings"), None);
    }

    #[test]
    fn extracts_relative_and_absolute_icon_links() {
        let base = Url::parse("https://example.com/docs/page").unwrap();
        let html = br#"<html><link rel='shortcut icon' href='/assets/icon.png'><link rel="apple-touch-icon" href="https://cdn.example/icon.png"></html>"#;
        let links = parse_icon_links(html, &base);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].as_str(), "https://example.com/assets/icon.png");
        assert_eq!(
            attribute_value("link href=icon.png", "href").as_deref(),
            Some("icon.png")
        );
    }

    #[test]
    fn infers_image_type_when_servers_send_missing_or_wrong_mime() {
        assert_eq!(
            infer_image_content_type_from_bytes(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png".to_owned())
        );
        assert_eq!(
            infer_image_content_type_from_bytes(b"<?xml version=\"1.0\"?><svg></svg>"),
            Some("image/svg+xml".to_owned())
        );
        assert_eq!(infer_image_content_type_from_bytes(b"not an image"), None);
    }
}
