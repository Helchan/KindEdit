pub mod commands;
pub mod core;
pub mod documents;
pub mod syntax;

use std::sync::Mutex;
use documents::DocumentRegistry;
use syntax::SyntaxRegistry;

pub struct AppState {
    pub doc_registry: DocumentRegistry,
    pub syntax_registry: SyntaxRegistry,
    pub config: Mutex<core::config::AppConfig>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            doc_registry: DocumentRegistry::new(),
            syntax_registry: SyntaxRegistry::new(),
            config: Mutex::new(core::config::AppConfig::load()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::file::open_file,
            commands::file::save_file,
            commands::document::parse_document,
            commands::document::format_text,
            commands::document::compact_text,
            commands::document::build_tree,
            commands::document::detect_type,
            commands::pdf::open_pdf_file,
            commands::pdf::save_pdf_file,
            commands::config::load_config,
            commands::config::save_config,
            commands::config::get_session,
            commands::config::save_session,
            commands::config::get_system_theme,
            commands::config::set_window_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
