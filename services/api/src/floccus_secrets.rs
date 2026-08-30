use crate::{
    auth,
    bookmarks::{parse_xbel, replace_index, XbelDocument},
    floccus_crypto::{
        decrypt_floccus, encrypt_floccus, is_floccus_encrypted, CryptoError, MasterKey,
        SealedPassphrase,
    },
    state::AppState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

#[derive(Debug)]
pub enum SyncFileError {
    Crypto(CryptoError),
    Xbel(crate::bookmarks::XbelError),
    Database(sqlx::Error),
}

impl std::fmt::Display for SyncFileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Crypto(error) => error.fmt(formatter),
            Self::Xbel(error) => error.fmt(formatter),
            Self::Database(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for SyncFileError {}

impl From<CryptoError> for SyncFileError {
    fn from(error: CryptoError) -> Self {
        Self::Crypto(error)
    }
}

impl From<crate::bookmarks::XbelError> for SyncFileError {
    fn from(error: crate::bookmarks::XbelError) -> Self {
        Self::Xbel(error)
    }
}

impl From<sqlx::Error> for SyncFileError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

pub async fn has_passphrase(db: &SqlitePool, user_id: Uuid) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM floccus_secrets WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(db)
            .await?
            > 0,
    )
}

pub async fn has_verified_index(db: &SqlitePool, user_id: Uuid) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM bookmark_sync_state WHERE user_id = $1 AND source_identity_ready = 1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?
        > 0)
}

pub async fn load_passphrase(
    state: &AppState,
    user_id: Uuid,
) -> Result<Option<String>, SyncFileError> {
    let row = sqlx::query(
        "SELECT key_version, nonce, encrypted_passphrase FROM floccus_secrets WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let sealed = SealedPassphrase {
        key_version: row.get("key_version"),
        nonce: row.get("nonce"),
        ciphertext: row.get("encrypted_passphrase"),
    };
    Ok(Some(state.master_key.open_passphrase(user_id, &sealed)?))
}

pub async fn save_passphrase(
    state: &AppState,
    user_id: Uuid,
    passphrase: &str,
) -> Result<(), SyncFileError> {
    let sealed = state.master_key.seal_passphrase(user_id, passphrase)?;
    sqlx::query(
        "INSERT INTO floccus_secrets (user_id, key_version, nonce, encrypted_passphrase, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           key_version = excluded.key_version,
           nonce = excluded.nonce,
           encrypted_passphrase = excluded.encrypted_passphrase,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user_id)
    .bind(sealed.key_version)
    .bind(sealed.nonce)
    .bind(sealed.ciphertext)
    .execute(&state.db)
    .await?;
    Ok(())
}

pub async fn remove_passphrase(state: &AppState, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM floccus_secrets WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

pub async fn parse_sync_file(
    state: &AppState,
    user_id: Uuid,
    bytes: &[u8],
) -> Result<Option<XbelDocument>, SyncFileError> {
    if !is_floccus_encrypted(bytes) {
        return Ok(Some(parse_xbel(bytes)?));
    }
    let Some(passphrase) = load_passphrase(state, user_id).await? else {
        return Ok(None);
    };
    let plaintext = decrypt_floccus(bytes, &passphrase)?;
    Ok(Some(parse_xbel(&plaintext)?))
}

pub async fn parse_sync_file_with_passphrase(
    bytes: &[u8],
    passphrase: &str,
) -> Result<XbelDocument, SyncFileError> {
    let plaintext = decrypt_floccus(bytes, passphrase)?;
    Ok(parse_xbel(&plaintext)?)
}

pub async fn encode_sync_file(
    state: &AppState,
    user_id: Uuid,
    plaintext: &[u8],
    encrypted: bool,
) -> Result<Vec<u8>, SyncFileError> {
    if !encrypted {
        return Ok(plaintext.to_vec());
    }
    let passphrase = load_passphrase(state, user_id)
        .await?
        .ok_or(CryptoError::AuthenticationFailed)?;
    Ok(encrypt_floccus(plaintext, &passphrase)?)
}

pub async fn clear_index(db: &SqlitePool, user_id: Uuid) -> Result<(), sqlx::Error> {
    let mut transaction = db.begin().await?;
    sqlx::query("DELETE FROM bookmark_nodes WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM bookmark_sync_state WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EncryptionStatus {
    encrypted_file: bool,
    passphrase_stored: bool,
    unlocked: bool,
    zero_knowledge: bool,
}

#[derive(Deserialize)]
pub struct UnlockPayload {
    passphrase: String,
}

pub async fn encryption_status(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let path = state
        .data_dir
        .join(user.id.to_string())
        .join("bookmarks.xbel");
    let bytes = tokio::fs::read(path).await.ok();
    let encrypted_file = bytes.as_deref().is_some_and(is_floccus_encrypted);
    let passphrase_stored = match has_passphrase(&state.db, user.id).await {
        Ok(value) => value,
        Err(error) => {
            tracing::error!(?error, "load Floccus encryption status failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "encryption_status_failed",
                "加密状态读取失败",
            );
        }
    };
    let unlocked = if encrypted_file && passphrase_stored {
        has_verified_index(&state.db, user.id)
            .await
            .unwrap_or(false)
    } else {
        !encrypted_file
    };
    Json(EncryptionStatus {
        encrypted_file,
        passphrase_stored,
        unlocked,
        zero_knowledge: !passphrase_stored,
    })
    .into_response()
}

pub async fn unlock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UnlockPayload>,
) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if payload.passphrase.is_empty() || payload.passphrase.len() > 4096 {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_passphrase",
            "请输入有效的 Floccus passphrase",
        );
    }
    let path = state
        .data_dir
        .join(user.id.to_string())
        .join("bookmarks.xbel");
    let bytes = match tokio::fs::read(path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return auth::error(
                StatusCode::CONFLICT,
                "sync_file_missing",
                "请先让 Floccus 完成一次加密同步",
            )
        }
        Err(error) => {
            tracing::error!(?error, "read encrypted sync file for unlock failed");
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "unlock_failed",
                "同步文件读取失败",
            );
        }
    };
    if !is_floccus_encrypted(&bytes) {
        return auth::error(
            StatusCode::CONFLICT,
            "sync_file_not_encrypted",
            "当前同步文件未启用 Floccus 加密，无需解锁",
        );
    }
    let parsed =
        match parse_sync_file_with_passphrase(&bytes, &payload.passphrase).await {
            Ok(parsed) if parsed.has_complete_floccus_identity() => parsed,
            Ok(_) => {
                return auth::error(
                    StatusCode::CONFLICT,
                    "floccus_identity_required",
                    "文件已解密，但缺少完整的 Floccus 节点身份；请先完成一次浏览器同步",
                )
            }
            Err(SyncFileError::Crypto(CryptoError::AuthenticationFailed)) => return auth::error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_passphrase",
                "无法解密：新向导请填写生成的 Floccus 专用密码；旧配置请填写原来的加密 Passphrase",
            ),
            Err(SyncFileError::Crypto(CryptoError::InvalidPayload)) => {
                return auth::error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "encrypted_file_invalid",
                    "同步文件的 Floccus 加密结构不完整或已损坏",
                )
            }
            Err(SyncFileError::Xbel(_)) => {
                return auth::error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "decrypted_xbel_invalid",
                    "Passphrase 已通过验证，但解密后的 XBEL 无法建立书签索引",
                )
            }
            Err(SyncFileError::Database(error)) => {
                tracing::error!(?error, "unlock Floccus file database operation failed");
                return auth::error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "unlock_failed",
                    "加密书签解锁失败",
                );
            }
            Err(SyncFileError::Crypto(error @ CryptoError::InvalidConfiguration(_)))
            | Err(SyncFileError::Crypto(error @ CryptoError::Io(_))) => {
                tracing::error!(?error, "unlock Floccus file crypto configuration failed");
                return auth::error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "unlock_failed",
                    "服务器加密配置不可用，请检查主密钥文件",
                );
            }
        };
    if let Err(error) = save_passphrase(&state, user.id, &payload.passphrase).await {
        tracing::error!(?error, "save protected Floccus passphrase failed");
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "unlock_failed",
            "passphrase 安全保存失败",
        );
    }
    if let Err(error) = replace_index(&state.db, user.id, &parsed).await {
        tracing::error!(?error, "index unlocked Floccus file failed");
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "unlock_failed",
            "书签索引建立失败",
        );
    }
    Json(serde_json::json!({ "unlocked": true })).into_response()
}

pub async fn forget_passphrase(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if let Err(error) = remove_passphrase(&state, user.id).await {
        tracing::error!(?error, "remove protected Floccus passphrase failed");
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "forget_passphrase_failed",
            "移除 passphrase 失败",
        );
    }
    let path = state
        .data_dir
        .join(user.id.to_string())
        .join("bookmarks.xbel");
    if tokio::fs::read(path)
        .await
        .ok()
        .as_deref()
        .is_some_and(is_floccus_encrypted)
    {
        if let Err(error) = clear_index(&state.db, user.id).await {
            tracing::error!(
                ?error,
                "clear index after forgetting Floccus passphrase failed"
            );
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "forget_passphrase_failed",
                "书签索引清理失败",
            );
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

#[allow(dead_code)]
fn _assert_master_key_is_send_sync(_: &MasterKey) {}

#[cfg(test)]
mod tests {
    use super::{parse_sync_file_with_passphrase, SyncFileError};
    use crate::floccus_crypto::{encrypt_floccus, CryptoError};

    #[tokio::test]
    async fn distinguishes_wrong_passphrase_from_invalid_decrypted_xbel() {
        let encrypted = encrypt_floccus(b"not an XBEL document", "correct passphrase")
            .expect("encrypt diagnostic payload");

        assert!(matches!(
            parse_sync_file_with_passphrase(&encrypted, "wrong passphrase").await,
            Err(SyncFileError::Crypto(CryptoError::AuthenticationFailed))
        ));
        assert!(matches!(
            parse_sync_file_with_passphrase(&encrypted, "correct passphrase").await,
            Err(SyncFileError::Xbel(_))
        ));
    }
}
