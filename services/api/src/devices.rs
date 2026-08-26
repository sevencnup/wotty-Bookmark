use crate::{auth, state::AppState};
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceResponse {
    pub id: Uuid,
    pub client_id: String,
    pub name: String,
    pub device_type: String,
    pub user_agent_summary: String,
    pub last_seen_at: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDevicePayload {
    pub client_id: String,
    pub name: String,
    pub device_type: String,
}

pub async fn list(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let rows = sqlx::query(
        "SELECT id, client_id, name, device_type, user_agent_summary, last_seen_at, created_at, revoked_at
         FROM devices WHERE user_id = $1 ORDER BY revoked_at IS NOT NULL, last_seen_at DESC, id DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await;
    match rows {
        Ok(rows) => Json(rows.into_iter().map(device_from_row).collect::<Vec<_>>()).into_response(),
        Err(error) => {
            tracing::error!(?error, "list devices failed");
            auth::error(StatusCode::INTERNAL_SERVER_ERROR, "devices_list_failed", "设备列表读取失败")
        }
    }
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterDevicePayload>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let client_id = payload.client_id.trim();
    let name = payload.name.trim();
    let device_type = payload.device_type.trim();
    if client_id.is_empty() || client_id.len() > 160 || name.is_empty() || name.len() > 80 {
        return auth::error(StatusCode::BAD_REQUEST, "invalid_device", "设备标识或名称无效");
    }
    let device_type = if device_type.is_empty() { "browser" } else { device_type };
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let user_agent_summary = summarize_user_agent(user_agent);
    let id = Uuid::new_v4();
    let result = sqlx::query(
        "INSERT INTO devices (id, user_id, client_id, name, device_type, user_agent_summary)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, client_id) DO UPDATE SET
           name = excluded.name,
           device_type = excluded.device_type,
           user_agent_summary = excluded.user_agent_summary,
           last_seen_at = CURRENT_TIMESTAMP,
           revoked_at = NULL",
    )
    .bind(id)
    .bind(user.id)
    .bind(client_id)
    .bind(name)
    .bind(device_type)
    .bind(user_agent_summary)
    .execute(&state.db)
    .await;
    if let Err(error) = result {
        tracing::error!(?error, "register device failed");
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "device_register_failed", "设备登记失败");
    }
    let Some(row) = sqlx::query(
        "SELECT id, client_id, name, device_type, user_agent_summary, last_seen_at, created_at, revoked_at
         FROM devices WHERE user_id = $1 AND client_id = $2",
    )
    .bind(user.id)
    .bind(client_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten() else {
        return auth::error(StatusCode::INTERNAL_SERVER_ERROR, "device_register_failed", "设备登记失败");
    };
    let device_id: Uuid = row.get("id");
    if sqlx::query("UPDATE sessions SET device_id = $1 WHERE token_hash = $2")
        .bind(device_id)
        .bind(auth::token_hash_from_headers(&headers))
        .execute(&state.db)
        .await
        .is_err()
    {
        tracing::warn!(%device_id, "bind current session to device failed");
    }
    Json(device_from_row(row)).into_response()
}

pub async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let result = sqlx::query(
        "UPDATE devices SET revoked_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.db)
    .await;
    match result {
        Ok(result) if result.rows_affected() == 1 => {
            if sqlx::query("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE device_id = $1")
                .bind(id)
                .execute(&state.db)
                .await
                .is_err()
            {
                tracing::warn!(%id, "revoke device sessions failed");
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => auth::error(StatusCode::NOT_FOUND, "device_not_found", "设备不存在或已撤销"),
        Err(error) => {
            tracing::error!(?error, "revoke device failed");
            auth::error(StatusCode::INTERNAL_SERVER_ERROR, "device_revoke_failed", "设备撤销失败")
        }
    }
}

fn device_from_row(row: sqlx::sqlite::SqliteRow) -> DeviceResponse {
    DeviceResponse {
        id: row.get("id"),
        client_id: row.get("client_id"),
        name: row.get("name"),
        device_type: row.get("device_type"),
        user_agent_summary: row.get("user_agent_summary"),
        last_seen_at: row.get("last_seen_at"),
        created_at: row.get("created_at"),
        revoked_at: row.try_get("revoked_at").ok(),
    }
}

fn summarize_user_agent(user_agent: &str) -> String {
    let summary = user_agent
        .split_whitespace()
        .filter(|part| !part.starts_with('(') && !part.contains("Mozilla/") && !part.contains("AppleWebKit/"))
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");
    if summary.is_empty() { "未知浏览器".into() } else { summary.chars().take(120).collect() }
}

#[cfg(test)]
mod tests {
    use super::summarize_user_agent;

    #[test]
    fn summarizes_user_agent_without_full_browser_noise() {
        assert_eq!(summarize_user_agent("Mozilla/5.0 (Windows) Chrome/123.0.0.0"), "Chrome/123.0.0.0");
    }
}
