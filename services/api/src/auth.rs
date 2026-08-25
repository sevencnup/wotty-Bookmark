use crate::state::AppState;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::time::Duration;
use uuid::Uuid;

const LOGIN_RATE_LIMIT: u32 = 5;
const LOGIN_RATE_WINDOW: Duration = Duration::from_secs(15 * 60);
const WEBDAV_RATE_LIMIT: u32 = 20;
const WEBDAV_RATE_WINDOW: Duration = Duration::from_secs(15 * 60);

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: String,
}

pub async fn health_live(State(state): State<AppState>) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "ok",
            service: "bookmark-vault-api",
            version: state.version.to_string(),
        }),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialsPayload {
    pub login_identifier: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginPayload {
    pub login_identifier: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct CreateAppPasswordPayload {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: Uuid,
    pub login_identifier: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPasswordResponse {
    pub id: Uuid,
    pub name: String,
    pub secret: Option<String>,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<CredentialsPayload>,
) -> Response {
    if payload.login_identifier.trim().is_empty() || payload.password.len() < 12 {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_credentials",
            "用户名不能为空，密码至少需要 12 个字符",
        );
    }

    let password_hash = match hash_password(&payload.password) {
        Ok(value) => value,
        Err(_) => {
            return error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "password_hash_failed",
                "密码处理失败",
            )
        }
    };
    let user_id = Uuid::new_v4();
    let login_identifier = payload.login_identifier.trim().to_string();
    let result =
        sqlx::query("INSERT INTO users (id, login_identifier, password_hash) VALUES ($1, $2, $3)")
            .bind(user_id)
            .bind(&login_identifier)
            .bind(password_hash)
            .execute(&state.db)
            .await;

    if let Err(db_error) = result {
        if let sqlx::Error::Database(database_error) = &db_error {
            if database_error.constraint() == Some("users_login_identifier_key") {
                return error(StatusCode::CONFLICT, "identifier_exists", "用户名已存在");
            }
        }
        tracing::error!(?db_error, "register user failed");
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "register_failed",
            "注册失败",
        );
    }

    match create_session(&state, user_id).await {
        Ok(token) => (
            StatusCode::CREATED,
            Json(TokenResponse {
                token,
                user: UserResponse {
                    id: user_id,
                    login_identifier,
                },
            }),
        )
            .into_response(),
        Err(_) => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "session_failed",
            "会话创建失败",
        ),
    }
}

pub async fn login(State(state): State<AppState>, Json(payload): Json<LoginPayload>) -> Response {
    let login_identifier = payload.login_identifier.trim().to_owned();
    let rate_limit_key = format!("login:{login_identifier}");
    if let Err(retry_after) =
        state
            .auth_rate_limiter
            .try_acquire(&rate_limit_key, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW)
    {
        return rate_limited(retry_after);
    }

    let row = sqlx::query(
        "SELECT id, login_identifier, password_hash, status FROM users WHERE login_identifier = $1",
    )
    .bind(&login_identifier)
    .fetch_optional(&state.db)
    .await;
    let Some(row) = (match row {
        Ok(value) => value,
        Err(db_error) => {
            tracing::error!(?db_error, "login lookup failed");
            return error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "login_failed",
                "登录失败",
            );
        }
    }) else {
        return error(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            "用户名或密码错误",
        );
    };

    let user_id: Uuid = row.get("id");
    let login_identifier: String = row.get("login_identifier");
    let password_hash: String = row.get("password_hash");
    let status: String = row.get("status");
    let verified = PasswordHash::new(&password_hash)
        .ok()
        .map(|parsed| {
            Argon2::default()
                .verify_password(payload.password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false);
    if !verified || status != "active" {
        return error(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            "用户名或密码错误",
        );
    }

    state.auth_rate_limiter.reset(&rate_limit_key);

    match create_session(&state, user_id).await {
        Ok(token) => Json(TokenResponse {
            token,
            user: UserResponse {
                id: user_id,
                login_identifier,
            },
        })
        .into_response(),
        Err(_) => error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "session_failed",
            "会话创建失败",
        ),
    }
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(token) = bearer_token(&headers) else {
        return StatusCode::NO_CONTENT.into_response();
    };
    let _ = sqlx::query("UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1")
        .bind(hash_token(&token))
        .execute(&state.db)
        .await;
    StatusCode::NO_CONTENT.into_response()
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = authenticate_session(&state, &headers).await else {
        return error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    Json(UserResponse {
        id: user.id,
        login_identifier: user.login_identifier,
    })
    .into_response()
}

pub async fn list_app_passwords(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = authenticate_session(&state, &headers).await else {
        return error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let rows = sqlx::query(
        "SELECT id, name, last_used_at, expires_at, created_at FROM app_passwords WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await;
    match rows {
        Ok(rows) => {
            let items = rows
                .into_iter()
                .map(|row| AppPasswordResponse {
                    id: row.get("id"),
                    name: row.get("name"),
                    secret: None,
                    last_used_at: row
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("last_used_at")
                        .ok()
                        .map(|value| value.to_rfc3339()),
                    expires_at: row
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("expires_at")
                        .ok()
                        .map(|value| value.to_rfc3339()),
                    created_at: row
                        .get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .to_rfc3339(),
                })
                .collect::<Vec<_>>();
            Json(items).into_response()
        }
        Err(db_error) => {
            tracing::error!(?db_error, "list app passwords failed");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "list_failed",
                "应用密码读取失败",
            )
        }
    }
}

pub async fn create_app_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateAppPasswordPayload>,
) -> Response {
    let Some(user) = authenticate_session(&state, &headers).await else {
        return error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if payload.name.trim().is_empty() || payload.name.len() > 80 {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            "应用密码名称不能为空且不能超过 80 个字符",
        );
    }
    let secret = generate_secret();
    let id = Uuid::new_v4();
    let name = payload.name.trim().to_string();
    let result = sqlx::query(
        "INSERT INTO app_passwords (id, user_id, name, secret_hash) VALUES ($1, $2, $3, $4)",
    )
    .bind(id)
    .bind(user.id)
    .bind(&name)
    .bind(hash_token(&secret))
    .execute(&state.db)
    .await;
    if let Err(db_error) = result {
        tracing::error!(?db_error, "create app password failed");
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "create_failed",
            "应用密码创建失败",
        );
    }
    Json(AppPasswordResponse {
        id,
        name,
        secret: Some(secret),
        last_used_at: None,
        expires_at: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
    .into_response()
}

pub async fn revoke_app_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let Some(user) = authenticate_session(&state, &headers).await else {
        return error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let result = sqlx::query(
        "UPDATE app_passwords SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.db)
    .await;
    match result {
        Ok(result) if result.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => error(StatusCode::NOT_FOUND, "not_found", "应用密码不存在"),
        Err(db_error) => {
            tracing::error!(?db_error, "revoke app password failed");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "revoke_failed",
                "应用密码撤销失败",
            )
        }
    }
}

pub async fn storage_status(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = authenticate_session(&state, &headers).await else {
        return error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let row = sqlx::query(
        "SELECT COUNT(*)::BIGINT AS files,
                COALESCE(SUM(byte_size), 0)::BIGINT AS bytes,
                MAX(last_modified_at) AS last_modified_at
         FROM dav_files
         WHERE user_id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await;
    match row {
        Ok(row) => Json(json!({
            "files": row.get::<i64, _>("files"),
            "bytes": row.get::<i64, _>("bytes"),
            "lastModifiedAt": row
                .try_get::<chrono::DateTime<chrono::Utc>, _>("last_modified_at")
                .ok()
                .map(|value| value.to_rfc3339()),
            "maxFileBytes": 10 * 1024 * 1024,
        }))
        .into_response(),
        Err(db_error) => {
            tracing::error!(?db_error, "storage status lookup failed");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_status_failed",
                "存储状态读取失败",
            )
        }
    }
}

#[derive(Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub login_identifier: String,
    pub app_password_id: Option<Uuid>,
}

pub async fn authenticate_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Option<AuthenticatedUser> {
    let token = bearer_token(headers)?;
    sqlx::query("SELECT u.id, u.login_identifier FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.status = 'active'")
        .bind(hash_token(&token))
        .fetch_optional(&state.db)
        .await
        .ok()?
        .map(|row| AuthenticatedUser {
            id: row.get("id"),
            login_identifier: row.get("login_identifier"),
            app_password_id: None,
        })
}

pub async fn authenticate_webdav(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<AuthenticatedUser>, Duration> {
    let Some((login_identifier, secret)) = basic_credentials(headers) else {
        return Ok(None);
    };
    let rate_limit_key = format!("webdav:{login_identifier}");
    state
        .auth_rate_limiter
        .try_acquire(&rate_limit_key, WEBDAV_RATE_LIMIT, WEBDAV_RATE_WINDOW)?;

    let row = sqlx::query("SELECT u.id, u.login_identifier, ap.id AS app_password_id FROM app_passwords ap JOIN users u ON u.id = ap.user_id WHERE u.login_identifier = $1 AND ap.secret_hash = $2 AND ap.revoked_at IS NULL AND (ap.expires_at IS NULL OR ap.expires_at > NOW()) AND u.status = 'active'")
        .bind(login_identifier)
        .bind(hash_token(&secret))
        .fetch_optional(&state.db)
        .await
        .map_err(|error| {
            tracing::error!(?error, "WebDAV authentication lookup failed");
            error
        });
    let row = match row {
        Ok(row) => row,
        Err(_) => return Ok(None),
    };
    Ok(row.map(|row| {
        state.auth_rate_limiter.reset(&rate_limit_key);
        let app_password_id: Uuid = row.get("app_password_id");
        let db = state.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query("UPDATE app_passwords SET last_used_at = NOW() WHERE id = $1")
                .bind(app_password_id)
                .execute(&db)
                .await;
        });
        AuthenticatedUser {
            id: row.get("id"),
            login_identifier: row.get("login_identifier"),
            app_password_id: Some(app_password_id),
        }
    }))
}

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}

async fn create_session(state: &AppState, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = generate_secret();
    sqlx::query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')")
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(hash_token(&token))
        .execute(&state.db)
        .await?;
    Ok(token)
}

fn generate_secret() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("bv_{}", URL_SAFE_NO_PAD.encode(bytes))
}

fn hash_token(value: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    format!("{:x}", digest.finalize())
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("Bearer") || token.trim().is_empty() {
        return None;
    }
    Some(token.trim().to_string())
}

fn basic_credentials(headers: &HeaderMap) -> Option<(String, String)> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, encoded) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("Basic") || encoded.trim().is_empty() {
        return None;
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .ok()?;
    let credentials = String::from_utf8(decoded).ok()?;
    let (login_identifier, secret) = credentials.split_once(':')?;
    if login_identifier.is_empty() || secret.is_empty() {
        return None;
    }
    Some((login_identifier.to_owned(), secret.to_owned()))
}

pub fn error(status: StatusCode, code: &str, message: &str) -> Response {
    (status, Json(json!({ "code": code, "message": message }))).into_response()
}

pub fn unauthorized_basic() -> Response {
    let mut response = error(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "需要 WebDAV 应用密码",
    );
    response.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static("Basic realm=\"Bookmark Vault WebDAV\""),
    );
    response
}

pub fn rate_limited(retry_after: Duration) -> Response {
    let retry_after = retry_after.as_secs().max(1).to_string();
    let mut response = error(
        StatusCode::TOO_MANY_REQUESTS,
        "rate_limited",
        "请求过于频繁，请稍后再试",
    );
    response.headers_mut().insert(
        header::RETRY_AFTER,
        HeaderValue::from_str(&retry_after).expect("retry-after is numeric"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::{basic_credentials, bearer_token};
    use axum::http::{header, HeaderMap, HeaderValue};

    #[test]
    fn basic_credentials_accepts_case_insensitive_scheme_and_password_colons() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("bAsIc dXNlcjpzZWNyZXQ6cGFydA=="),
        );
        assert_eq!(
            basic_credentials(&headers),
            Some(("user".to_owned(), "secret:part".to_owned()))
        );
    }

    #[test]
    fn malformed_basic_credentials_are_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Basic bm9jbG9u"),
        );
        assert!(basic_credentials(&headers).is_none());
    }

    #[test]
    fn bearer_scheme_is_case_insensitive_and_trims_token() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("bEaReR token"),
        );
        assert_eq!(bearer_token(&headers), Some("token".to_owned()));
    }
}
