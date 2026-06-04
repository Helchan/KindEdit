pub mod config;
pub mod platform;
pub mod rope;
pub mod session;

// Re-export key types for convenient access
pub use config::{AppConfig, TabMeta};
pub use platform::{detect_system_theme, get_config_dir, get_modifier_key, SystemTheme};
pub use rope::{TextBuffer, CHUNK_SIZE, HUGE_FILE_THRESHOLD, LARGE_TEXT_THRESHOLD, SYNTAX_RENDER_LIMIT};
pub use session::{SessionData, TabSession};
