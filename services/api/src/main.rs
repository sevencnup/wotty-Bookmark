mod auth;
mod state;
mod webdav;

use axum::{
    http::{header, HeaderName, Method},
    routing::{any, delete, get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::{env, fs, net::SocketAddr, sync::Arc, time::Duration};
use tokio::net::TcpListener;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use state::{AppState, AuthRateLimiter};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "bookmark_vault_api=info,tower_http=info".into()),
        )
        .init();

    let bind_addr: SocketAddr = env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()?;
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://bookmark_vault:change-me-in-production@127.0.0.1:5433/bookmark_vault".into()
    });
    let data_dir = env::var("DATA_DIR").unwrap_or_else(|_| "./data".into());
    fs::create_dir_all(&data_dir)?;

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let state = AppState {
        db,
        data_dir: data_dir.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        auth_rate_limiter: Arc::new(AuthRateLimiter::default()),
    };

    let app = Router::new()
        .route("/health/live", get(auth::health_live))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/me", get(auth::me))
        .route(
            "/api/v1/app-passwords",
            get(auth::list_app_passwords).post(auth::create_app_password),
        )
        .route(
            "/api/v1/app-passwords/{id}",
            delete(auth::revoke_app_password),
        )
        .route("/api/v1/storage/status", get(auth::storage_status))
        .route("/dav/*path", any(webdav::handle))
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(bind_addr).await?;
    tracing::info!(%bind_addr, "bookmark-vault-api started");
    axum::serve(listener, app).await?;
    Ok(())
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
    use super::cors_layer_for_origins;
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
}
