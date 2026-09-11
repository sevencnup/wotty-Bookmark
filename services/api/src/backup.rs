use crate::{auth, state::AppState};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Local, NaiveTime, TimeZone, Utc};
use flate2::{write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};
use tar::Builder;
use tokio::{fs, sync::Mutex};

const MAX_RETENTION: i64 = 100;
static BACKUP_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub enabled: bool,
    pub daily_time: String,
    pub retention_count: i64,
    pub last_started_at: Option<String>,
    pub last_finished_at: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub next_run_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRun {
    pub id: String,
    pub backup_name: String,
    pub byte_size: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBackupSettings {
    pub enabled: bool,
    pub daily_time: String,
    pub retention_count: i64,
}

pub async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match load_settings(&state.db).await {
        Ok(settings) => Json(settings).into_response(),
        Err(error) => internal_error(error, "备份设置读取失败"),
    }
}

pub async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UpdateBackupSettings>,
) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    if !valid_time(&input.daily_time) {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_backup_time",
            "备份时间必须使用 HH:MM 格式",
        );
    }
    if !(1..=MAX_RETENTION).contains(&input.retention_count) {
        return auth::error(
            StatusCode::BAD_REQUEST,
            "invalid_retention",
            "保留份数必须在 1 到 100 之间",
        );
    }
    let result = sqlx::query(
        "UPDATE backup_settings SET enabled = $1, daily_time = $2, retention_count = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    )
    .bind(input.enabled)
    .bind(&input.daily_time)
    .bind(input.retention_count)
    .execute(&state.db)
    .await;
    match result {
        Ok(_) => match load_settings(&state.db).await {
            Ok(settings) => Json(settings).into_response(),
            Err(error) => internal_error(error, "备份设置读取失败"),
        },
        Err(error) => internal_error(error, "备份设置保存失败"),
    }
}

pub async fn list_runs(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match load_runs(&state.db).await {
        Ok(runs) => Json(runs).into_response(),
        Err(error) => internal_error(error, "备份记录读取失败"),
    }
}

pub async fn run_now(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    match run_backup(&state.db, &state.data_dir).await {
        Ok(run) => Json(run).into_response(),
        Err(error) => internal_error(error, "备份执行失败"),
    }
}

pub async fn download(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let Some(path) = backup_path(&state.data_dir, &name) else {
        return auth::error(StatusCode::BAD_REQUEST, "invalid_backup", "备份名称无效");
    };
    if !path.is_dir() {
        return auth::error(StatusCode::NOT_FOUND, "backup_not_found", "备份不存在");
    }
    match archive_backup(path, name.clone()).await {
        Ok(bytes) => {
            let mut response = axum::body::Body::from(bytes).into_response();
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("application/gzip"),
            );
            response.headers_mut().insert(
                header::CONTENT_DISPOSITION,
                header::HeaderValue::from_str(&format!("attachment; filename=\"{name}.tar.gz\""))
                    .unwrap(),
            );
            response
        }
        Err(error) => internal_error(error, "备份归档失败"),
    }
}

pub async fn restore(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Response {
    let Some(_) = auth::authenticate_session(&state, &headers).await else {
        return auth::error(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录");
    };
    let Some(path) = backup_path(&state.data_dir, &name) else {
        return auth::error(StatusCode::BAD_REQUEST, "invalid_backup", "备份名称无效");
    };
    if !is_complete_backup(&path).await {
        return auth::error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_backup",
            "备份结构不完整，无法还原",
        );
    }
    let guard = BACKUP_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    let protection = match run_backup_locked(&state.db, &state.data_dir, false).await {
        Ok(run) => run,
        Err(error) => {
            drop(guard);
            return internal_error(error, "还原前保护当前数据失败");
        }
    };
    let result = restore_from_directory(&state.db, &state.data_dir, &path).await;
    if let Err(error) = result {
        let protection_path = state.data_dir.join("backups").join(&protection.backup_name);
        if let Err(rollback_error) =
            restore_from_directory(&state.db, &state.data_dir, &protection_path).await
        {
            tracing::error!(?rollback_error, "backup restore rollback failed");
            drop(guard);
            return auth::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "backup_restore_rollback_failed",
                "还原失败且自动回滚失败，请立即使用保护备份恢复",
            );
        }
        tracing::error!(?error, "backup restore failed and was rolled back");
        drop(guard);
        return auth::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "backup_restore_failed",
            "还原失败，当前数据已恢复",
        );
    }
    let _ = sqlx::query(
        "INSERT INTO backup_runs (id, backup_name, byte_size, status, created_at, completed_at) VALUES ($1, $2, $3, 'success', $4, $5) ON CONFLICT(id) DO UPDATE SET backup_name = excluded.backup_name, byte_size = excluded.byte_size, status = excluded.status, created_at = excluded.created_at, completed_at = excluded.completed_at, error_message = NULL",
    )
    .bind(&protection.id)
    .bind(&protection.backup_name)
    .bind(protection.byte_size)
    .bind(&protection.created_at)
    .bind(&protection.completed_at)
    .execute(&state.db)
    .await;
    drop(guard);
    let _ = enforce_retention(&state.db, &state.data_dir).await;
    Json(serde_json::json!({
        "restored": true,
        "restartRequired": true,
        "protectionBackup": protection.backup_name,
    }))
    .into_response()
}

fn backup_path(data_dir: &Path, name: &str) -> Option<PathBuf> {
    if !name.starts_with("backup-")
        || name.len() > 100
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return None;
    }
    Some(data_dir.join("backups").join(name))
}

async fn archive_backup(path: PathBuf, name: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let mut bytes = Vec::new();
        {
            let encoder = GzEncoder::new(&mut bytes, Compression::default());
            let mut builder = Builder::new(encoder);
            builder
                .append_dir_all(&name, &path)
                .map_err(|error| error.to_string())?;
            let encoder = builder.into_inner().map_err(|error| error.to_string())?;
            encoder.finish().map_err(|error| error.to_string())?;
        }
        Ok(bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn is_complete_backup(path: &Path) -> bool {
    if !path.join("bookmark-vault.sqlite").is_file() || !path.join("data").is_dir() {
        return false;
    }
    let database = path.join("bookmark-vault.sqlite");
    let database_url = if cfg!(windows) {
        format!(
            "sqlite:///{}?mode=ro",
            database.to_string_lossy().replace('\\', "/")
        )
    } else {
        format!("sqlite://{}?mode=ro", database.to_string_lossy())
    };
    let Ok(pool) = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
    else {
        return false;
    };
    let valid = sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .is_ok_and(|value| value == "ok");
    pool.close().await;
    valid
}

async fn restore_from_directory(
    db: &SqlitePool,
    data_dir: &Path,
    backup_dir: &Path,
) -> Result<(), String> {
    restore_database(db, &backup_dir.join("bookmark-vault.sqlite")).await?;
    restore_data_tree(data_dir, &backup_dir.join("data")).await
}

async fn restore_database(db: &SqlitePool, backup_path: &Path) -> Result<(), String> {
    let backup = backup_path.to_string_lossy().replace('\\', "/");
    let mut connection = db.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("ATTACH DATABASE ? AS restore_db")
        .bind(&backup)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    let tables = sqlx::query("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .fetch_all(&mut *connection).await.map_err(|error| error.to_string())?;
    for row in tables {
        let name: String = row.get("name");
        let escaped = name.replace('\"', "\"\"");
        sqlx::query(&format!("DELETE FROM main.\"{escaped}\""))
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM restore_db.sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(&name)
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
        if exists > 0 {
            sqlx::query(&format!(
                "INSERT INTO main.\"{escaped}\" SELECT * FROM restore_db.\"{escaped}\""
            ))
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
    }
    sqlx::query("DETACH DATABASE restore_db")
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn restore_data_tree(data_dir: &Path, source: &Path) -> Result<(), String> {
    let target = data_dir.to_path_buf();
    let source = source.to_path_buf();
    tokio::task::spawn_blocking(move || {
        for entry in std::fs::read_dir(&target).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path
                .file_name()
                .is_some_and(|name| name == "backups" || name == "bookmark-vault.sqlite")
            {
                continue;
            }
            if path.is_dir() {
                std::fs::remove_dir_all(path).map_err(|error| error.to_string())?;
            } else {
                std::fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        copy_tree_sync(&source, &target, &source.join("__never__"))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

pub async fn scheduler(db: SqlitePool, data_dir: PathBuf) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        let Ok(settings) = load_settings(&db).await else {
            continue;
        };
        if !settings.enabled || settings.daily_time != Local::now().format("%H:%M").to_string() {
            continue;
        }
        if settings.last_status.as_deref() == Some("running") {
            continue;
        }
        if settings.last_status.as_deref() == Some("success")
            && settings
                .last_finished_at
                .as_deref()
                .is_some_and(finished_today)
        {
            continue;
        }
        if let Err(error) = run_backup(&db, &data_dir).await {
            tracing::error!(?error, "scheduled backup failed");
        }
    }
}

fn finished_today(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|parsed| parsed.with_timezone(&Local).date_naive() == Local::now().date_naive())
        .unwrap_or(false)
}

pub async fn load_settings(db: &SqlitePool) -> Result<BackupSettings, sqlx::Error> {
    let row = sqlx::query("SELECT enabled, daily_time, retention_count, last_started_at, last_finished_at, last_status, last_error FROM backup_settings WHERE id = 1")
        .fetch_one(db).await?;
    let daily_time: String = row.get("daily_time");
    Ok(BackupSettings {
        enabled: row.get::<i64, _>("enabled") != 0,
        daily_time: daily_time.clone(),
        retention_count: row.get("retention_count"),
        last_started_at: row.try_get("last_started_at").ok(),
        last_finished_at: row.try_get("last_finished_at").ok(),
        last_status: row.try_get("last_status").ok(),
        last_error: row.try_get("last_error").ok(),
        next_run_at: if row.get::<i64, _>("enabled") != 0 {
            Some(next_run(&daily_time))
        } else {
            None
        },
    })
}

async fn load_runs(db: &SqlitePool) -> Result<Vec<BackupRun>, sqlx::Error> {
    let rows = sqlx::query("SELECT id, backup_name, byte_size, status, error_message, created_at, completed_at FROM backup_runs ORDER BY created_at DESC LIMIT 50")
        .fetch_all(db).await?;
    Ok(rows
        .into_iter()
        .map(|row| BackupRun {
            id: row.get("id"),
            backup_name: row.get("backup_name"),
            byte_size: row.get("byte_size"),
            status: row.get("status"),
            error_message: row.try_get("error_message").ok(),
            created_at: row.get("created_at"),
            completed_at: row.try_get("completed_at").ok(),
        })
        .collect())
}

pub async fn run_backup(db: &SqlitePool, data_dir: &Path) -> Result<BackupRun, String> {
    let guard = BACKUP_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    let result = run_backup_locked(db, data_dir, true).await;
    drop(guard);
    result
}

async fn run_backup_locked(
    db: &SqlitePool,
    data_dir: &Path,
    apply_retention: bool,
) -> Result<BackupRun, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let backup_name = format!("backup-{stamp}-{}", &run_id[..8]);
    let backup_dir = data_dir.join("backups").join(&backup_name);
    let started = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO backup_runs (id, backup_name, status, created_at) VALUES ($1, $2, 'running', CURRENT_TIMESTAMP)")
        .bind(&run_id).bind(&backup_name).execute(db).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE backup_settings SET last_started_at = $1, last_status = 'running', last_error = NULL WHERE id = 1")
        .bind(&started).execute(db).await.map_err(|e| e.to_string())?;
    let result = create_backup(db, data_dir, &backup_dir).await;
    let finished = Utc::now().to_rfc3339();
    match result {
        Ok(byte_size) => {
            if apply_retention {
                let _ = enforce_retention(db, data_dir).await;
            }
            sqlx::query("UPDATE backup_runs SET status = 'success', byte_size = $1, completed_at = $2 WHERE id = $3")
                .bind(byte_size).bind(&finished).bind(&run_id).execute(db).await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE backup_settings SET last_finished_at = $1, last_status = 'success', last_error = NULL WHERE id = 1")
                .bind(&finished).execute(db).await.map_err(|e| e.to_string())?;
            Ok(BackupRun {
                id: run_id,
                backup_name,
                byte_size,
                status: "success".into(),
                error_message: None,
                created_at: started,
                completed_at: Some(finished),
            })
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&backup_dir).await;
            let _ = sqlx::query("UPDATE backup_runs SET status = 'failed', error_message = $1, completed_at = $2 WHERE id = $3").bind(&error).bind(&finished).bind(&run_id).execute(db).await;
            let _ = sqlx::query("UPDATE backup_settings SET last_finished_at = $1, last_status = 'failed', last_error = $2 WHERE id = 1").bind(&finished).bind(&error).execute(db).await;
            Err(error)
        }
    }
}

async fn create_backup(db: &SqlitePool, data_dir: &Path, backup_dir: &Path) -> Result<i64, String> {
    fs::create_dir_all(backup_dir.join("data"))
        .await
        .map_err(|e| e.to_string())?;
    let database_path = backup_dir.join("bookmark-vault.sqlite");
    let escaped = database_path.to_string_lossy().replace('\'', "\'\'");
    sqlx::query(&format!("VACUUM INTO '{}'", escaped))
        .execute(db)
        .await
        .map_err(|e| format!("database snapshot failed: {e}"))?;
    let source = data_dir.to_path_buf();
    let target = backup_dir.join("data");
    let excluded = data_dir.join("backups");
    tokio::task::spawn_blocking(move || copy_tree_sync(&source, &target, &excluded))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let size_path = backup_dir.to_path_buf();
    tokio::task::spawn_blocking(move || directory_size_sync(&size_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn copy_tree_sync(source: &Path, target: &Path, excluded: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        if path == excluded
            || path
                .file_name()
                .is_some_and(|name| name == "bookmark-vault.sqlite")
        {
            continue;
        }
        let destination = target.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree_sync(&path, &destination, excluded)?;
        } else if kind.is_file() {
            std::fs::copy(&path, &destination)?;
        }
    }
    Ok(())
}

fn directory_size_sync(path: &Path) -> std::io::Result<i64> {
    let mut total = 0_i64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            total += directory_size_sync(&entry.path())?;
        } else if kind.is_file() {
            total += entry.metadata()?.len() as i64;
        }
    }
    Ok(total)
}

async fn enforce_retention(db: &SqlitePool, data_dir: &Path) -> Result<(), String> {
    let retention = load_settings(db)
        .await
        .map_err(|e| e.to_string())?
        .retention_count;
    let root = data_dir.join("backups");
    let mut names = Vec::new();
    let mut entries = fs::read_dir(&root).await.map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        if entry.file_type().await.map_err(|e| e.to_string())?.is_dir() {
            names.push((
                entry.file_name().to_string_lossy().to_string(),
                entry.path(),
            ));
        }
    }
    names.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in names.into_iter().skip(retention as usize) {
        fs::remove_dir_all(path).await.map_err(|e| e.to_string())?;
    }
    sqlx::query("DELETE FROM backup_runs WHERE id NOT IN (SELECT id FROM backup_runs ORDER BY created_at DESC LIMIT $1)").bind(retention).execute(db).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn valid_time(value: &str) -> bool {
    let mut parts = value.split(':');
    let (Some(hour), Some(minute), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    hour.len() == 2
        && minute.len() == 2
        && hour.parse::<u32>().is_ok_and(|v| v < 24)
        && minute.parse::<u32>().is_ok_and(|v| v < 60)
}

fn next_run(time: &str) -> String {
    let now = Local::now();
    let Ok(parsed_time) = NaiveTime::parse_from_str(time, "%H:%M") else {
        return time.to_owned();
    };
    let date = now.date_naive();
    let candidate = Local
        .from_local_datetime(&date.and_time(parsed_time))
        .single();
    let value = candidate.filter(|value| *value > now).unwrap_or_else(|| {
        let tomorrow = date + chrono::Duration::days(1);
        Local
            .from_local_datetime(&tomorrow.and_time(parsed_time))
            .single()
            .unwrap_or(now)
    });
    value.to_rfc3339()
}

fn internal_error(error: impl std::fmt::Debug, message: &str) -> Response {
    tracing::error!(?error, "{message}");
    auth::error(StatusCode::INTERNAL_SERVER_ERROR, "backup_failed", message)
}

#[cfg(test)]
mod tests {
    use super::{run_backup, valid_time};
    use sqlx::sqlite::SqlitePoolOptions;
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    #[test]
    fn validates_daily_time_format() {
        assert!(valid_time("00:00"));
        assert!(valid_time("23:59"));
        assert!(!valid_time("3:00"));
        assert!(!valid_time("24:00"));
        assert!(!valid_time("12:60"));
    }

    #[tokio::test]
    async fn creates_database_and_data_snapshot() {
        let root =
            std::env::temp_dir().join(format!("bookmark-vault-backup-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test data directory");
        let database_path = root.join("source.sqlite");
        let database_url = format!(
            "sqlite://{}?mode=rwc",
            database_path.to_string_lossy().replace('\\', "/")
        );
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("file database");
        sqlx::migrate!("../../migrations")
            .run(&db)
            .await
            .expect("migrations");
        fs::write(root.join("server-master.key"), b"test-master-key").expect("test key");
        let result = run_backup(&db, &root).await.expect("backup succeeds");
        let backup_dir: PathBuf = root.join("backups").join(result.backup_name);
        assert!(backup_dir.join("bookmark-vault.sqlite").is_file());
        assert_eq!(
            fs::read(backup_dir.join("data/server-master.key")).expect("copied key"),
            b"test-master-key"
        );
        assert_eq!(result.status, "success");
        let _ = fs::remove_dir_all(root);
    }
}
