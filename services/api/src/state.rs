use sqlx::PgPool;
use std::{path::PathBuf, sync::Arc};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub data_dir: PathBuf,
    pub version: Arc<str>,
}
