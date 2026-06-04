use crate::core::config::AppConfig;
use crate::core::session::SessionData;
use crate::core::platform::{detect_system_theme, SystemTheme};
use crate::AppState;

#[tauri::command]
pub async fn load_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub async fn save_config(config: AppConfig, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Update in-memory config
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    // Persist to disk
    current.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session() -> Result<SessionData, String> {
    Ok(SessionData::load())
}

#[tauri::command]
pub async fn save_session(session: SessionData) -> Result<(), String> {
    session.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_theme() -> String {
    match detect_system_theme() {
        SystemTheme::Light => "light".to_string(),
        SystemTheme::Dark => "dark".to_string(),
        SystemTheme::Unknown => "unknown".to_string(),
    }
}

#[tauri::command]
pub fn set_window_theme(window: tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    let theme = if dark {
        Some(tauri::Theme::Dark)
    } else {
        Some(tauri::Theme::Light)
    };
    window.set_theme(theme).map_err(|e| e.to_string())
}
