mod auth;
mod backup;
mod bookmarks;
mod devices;
mod favicon;
mod floccus_crypto;
mod floccus_secrets;
mod library;
mod state;
mod trash;
mod webdav;

use axum::{
    http::{header, HeaderName, Method},
    routing::{any, delete, get, patch, post},
    Router,
};
use sqlx::sqlite::SqlitePoolOptions;
use std::{env, fs, net::SocketAddr, sync::Arc, time::Duration};
use tokio::net::TcpListener;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use state::{AppState, AuthRateLimiter};

const APP_PASSWORD_BY_ID_ROUTE: &str = "/api/v1/app-passwords/:id";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "bookmark_vault_api=info,tower_http=info".into()),
        )
        .init();

    let bind_addr: SocketAddr = env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:26626".into())
        .parse()?;
    let data_dir = env::var("DATA_DIR").unwrap_or_else(|_| "./data".into());
    fs::create_dir_all(&data_dir)?;
    // Keep the favicon cache visible and writable even before the first successful
    // remote icon resolution. Individual files are created lazily by favicon.rs.
    fs::create_dir_all(std::path::Path::new(&data_dir).join("favicon-cache"))?;
    let database_url = match env::var("DATABASE_URL") {
        Ok(value) => value,
        Err(_) => {
            let database_path = env::current_dir()?
                .join(&data_dir)
                .join("bookmark-vault.sqlite");
            let database_path = database_path.to_string_lossy().replace('\\', "/");
            if cfg!(windows) {
                format!("sqlite:///{database_path}?mode=rwc")
            } else {
                format!("sqlite://{database_path}?mode=rwc")
            }
        }
    };

    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let master_key = floccus_crypto::MasterKey::load_or_create(std::path::Path::new(&data_dir))?;
    let state = AppState {
        db,
        data_dir: data_dir.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        auth_rate_limiter: Arc::new(AuthRateLimiter::default()),
        master_key: Arc::new(master_key),
    };

    let scheduler_db = state.db.clone();
    let scheduler_data_dir = state.data_dir.clone();
    tokio::spawn(backup::scheduler(scheduler_db, scheduler_data_dir));
    let app = app_router(state);

    let listener = TcpListener::bind(bind_addr).await?;
    tracing::info!(%bind_addr, "bookmark-vault-api started");
    axum::serve(listener, app).await?;
    Ok(())
}

fn app_router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(auth::health_live))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/me", get(auth::me))
        .route(
            "/api/v1/sidebar/pairing-codes",
            post(auth::create_sidebar_pairing),
        )
        .route(
            "/api/v1/sidebar/exchange",
            post(auth::exchange_sidebar_pairing),
        )
        .route(
            "/api/v1/app-passwords",
            get(auth::list_app_passwords).post(auth::create_app_password),
        )
        .route(
            "/api/v1/floccus/credentials",
            post(auth::create_floccus_credential),
        )
        .route(APP_PASSWORD_BY_ID_ROUTE, delete(auth::revoke_app_password))
        .route("/api/v1/storage/status", get(auth::storage_status))
        .route(
            "/api/v1/backups/settings",
            get(backup::get_settings).put(backup::update_settings),
        )
        .route("/api/v1/backups/runs", get(backup::list_runs))
        .route("/api/v1/backups/run", post(backup::run_now))
        .route("/api/v1/backups/:name/download", get(backup::download))
        .route("/api/v1/backups/:name/restore", post(backup::restore))
        .route(
            "/api/v1/storage/encryption",
            get(floccus_secrets::encryption_status),
        )
        .route(
            "/api/v1/storage/encryption/unlock",
            post(floccus_secrets::unlock),
        )
        .route(
            "/api/v1/storage/encryption/passphrase",
            delete(floccus_secrets::forget_passphrase),
        )
        .route("/api/v1/bookmarks", get(bookmarks::list_bookmarks))
        .route("/api/v1/library", get(library::list))
        .route("/api/v1/library/bookmarks", post(library::create_bookmark))
        .route("/api/v1/library/folders", post(library::create_folder))
        .route(
            "/api/v1/library/nodes/:id",
            patch(library::update_node).delete(library::delete_node),
        )
        .route("/api/v1/library/nodes/:id/move", post(library::move_node))
        .route("/api/v1/library/trash", get(library::list_trash))
        .route(
            "/api/v1/library/trash/:id/restore",
            post(library::restore_node),
        )
        .route("/api/v1/library/import", post(library::import_xbel))
        .route(
            "/api/v1/library/import-from-sync",
            post(library::import_from_sync),
        )
        .route("/api/v1/library/favicons", post(favicon::resolve_batch))
        .route("/api/v1/library/favicons/:key", get(favicon::serve_cached))
        .route("/api/v1/bookmarks/move", post(bookmarks::move_bookmark))
        .route(
            "/api/v1/bookmarks/move-batch",
            post(bookmarks::move_bookmarks_batch),
        )
        .route(
            "/api/v1/bookmarks/folders/move",
            post(bookmarks::move_folder),
        )
        .route(
            "/api/v1/bookmarks/trash",
            get(trash::list).post(trash::create),
        )
        .route("/api/v1/bookmarks/trash/batch", post(trash::create_batch))
        .route("/api/v1/bookmarks/trash/empty", post(trash::empty))
        .route("/api/v1/bookmarks/trash/:id", delete(trash::remove))
        .route("/api/v1/bookmarks/trash/:id/restore", post(trash::restore))
        .route("/api/v1/devices", get(devices::list))
        .route("/api/v1/devices/register", post(devices::register))
        .route("/api/v1/devices/:id/revoke", post(devices::revoke))
        .route("/api/v1/storage/export", get(webdav::export_file))
        .route("/api/v1/storage/import", post(webdav::import_file))
        .route(
            "/api/v1/storage/reset-sync-baseline",
            post(webdav::reset_sync_baseline),
        )
        .route("/api/v1/storage/versions", get(webdav::list_versions))
        .route(
            "/api/v1/storage/versions/cleanup",
            post(webdav::cleanup_versions),
        )
        .route(
            "/api/v1/storage/versions/:id/restore",
            post(webdav::restore_version),
        )
        .route("/dav/*path", any(webdav::handle))
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

fn cors_layer() -> CorsLayer {
    let configured_origins = env::var("CORS_ALLOWED_ORIGINS").unwrap_or_default();
    cors_layer_for_origins(&configured_origins)
}

fn cors_layer_for_origins(configured_origins: &str) -> CorsLayer {
    let allowed_origins = configured_origins
        .split(',')
        .filter_map(|origin| {
            let origin = origin.trim();
            if origin.is_empty() || origin == "*" {
                if origin == "*" {
                    tracing::warn!("ignoring wildcard CORS origin; use explicit origins");
                }
                return None;
            }
            match origin.parse() {
                Ok(value) => Some(value),
                Err(error) => {
                    tracing::warn!(%origin, ?error, "ignoring invalid CORS origin");
                    None
                }
            }
        })
        .collect::<Vec<_>>();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([
            Method::GET,
            Method::HEAD,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
            Method::from_bytes(b"PROPFIND").expect("valid WebDAV method"),
            Method::from_bytes(b"MOVE").expect("valid WebDAV method"),
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            HeaderName::from_static("depth"),
            HeaderName::from_static("destination"),
            HeaderName::from_static("overwrite"),
        ])
        .expose_headers([
            header::CONTENT_LENGTH,
            header::ETAG,
            header::LAST_MODIFIED,
            header::WWW_AUTHENTICATE,
        ])
        .max_age(Duration::from_secs(600))
}

#[cfg(test)]
mod tests {
    use super::{app_router, cors_layer_for_origins};
    use crate::state::{AppState, AuthRateLimiter};
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
    };
    use sqlx::sqlite::SqlitePoolOptions;
    use std::{path::PathBuf, sync::Arc};
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    #[test]
    fn empty_cors_configuration_does_not_enable_wildcard_access() {
        let _layer: CorsLayer = cors_layer_for_origins("");
    }

    #[test]
    fn cors_configuration_accepts_multiple_explicit_origins() {
        let _layer: CorsLayer = cors_layer_for_origins(
            "http://localhost:5173, chrome-extension://extension-id, invalid origin",
        );
    }

    #[tokio::test]
    async fn app_password_id_route_matches_axum_07_parameter_syntax() {
        let state = AppState {
            db: SqlitePoolOptions::new()
                .connect_lazy("sqlite::memory:")
                .expect("lazy database pool should be constructible"),
            data_dir: PathBuf::from("/tmp/bookmark-vault-route-test"),
            version: "test".into(),
            auth_rate_limiter: Arc::new(AuthRateLimiter::default()),
            master_key: Arc::new(crate::floccus_crypto::MasterKey::for_tests()),
        };
        let response = app_router(state)
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/v1/app-passwords/not-a-uuid")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
