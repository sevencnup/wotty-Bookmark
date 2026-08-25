mod auth;
mod state;
mod webdav;

use axum::{
    routing::{any, delete, get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::{env, fs, net::SocketAddr};
use tokio::net::TcpListener;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use state::AppState;

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
        // Temporary development CORS. Replace with an origin allow-list before production.
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(bind_addr).await?;
    tracing::info!(%bind_addr, "bookmark-vault-api started");
    axum::serve(listener, app).await?;
    Ok(())
}
