use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use super::platform::get_config_dir;

// Default value functions for serde
fn default_font_size() -> u8 {
    10
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_true() -> bool {
    true
}

fn default_doc_type() -> String {
    "text".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_font_size")]
    pub tree_font_size: u8,
    #[serde(default = "default_font_size")]
    pub text_font_size: u8,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_true")]
    pub sync_display: bool,
    #[serde(default = "default_true")]
    pub sql_uppercase_keywords: bool,
    #[serde(default)]
    pub tabs: Vec<TabMeta>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub autosave_path: Option<String>,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default = "default_doc_type")]
    pub document_type: String,
    #[serde(default)]
    pub document_type_locked: bool,
    #[serde(default)]
    pub large_content: bool,
    #[serde(default = "default_true")]
    pub content_loaded: bool,
    #[serde(default)]
    pub content_size: usize,
}

impl AppConfig {
    /// Load configuration from the settings file.
    /// Returns default config if the file doesn't exist or can't be parsed.
    pub fn load() -> Self {
        let config_path = Self::config_dir().join("settings.json");
        if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_default()
                }
                Err(_) => Self::default(),
            }
        } else {
            Self::default()
        }
    }

    /// Save the configuration to the settings file.
    /// Creates the config directory if it doesn't exist.
    pub fn save(&self) -> Result<(), std::io::Error> {
        let config_dir = Self::config_dir();
        fs::create_dir_all(&config_dir)?;

        let config_path = config_dir.join("settings.json");
        let content = serde_json::to_string_pretty(self)
            .map_err(std::io::Error::other)?;
        fs::write(&config_path, content)
    }

    /// Get the configuration directory path.
    pub fn config_dir() -> PathBuf {
        get_config_dir()
    }

    /// Get the tabs auto-save directory path.
    /// Creates the directory if it doesn't exist.
    pub fn tabs_dir() -> PathBuf {
        let dir = Self::config_dir().join("tabs");
        let _ = fs::create_dir_all(&dir);
        dir
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            tree_font_size: default_font_size(),
            text_font_size: default_font_size(),
            theme: default_theme(),
            sync_display: true,
            sql_uppercase_keywords: true,
            tabs: Vec::new(),
            active_tab_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.tree_font_size, 10);
        assert_eq!(config.text_font_size, 10);
        assert_eq!(config.theme, "system");
        assert!(config.sync_display);
        assert!(config.sql_uppercase_keywords);
        assert!(config.tabs.is_empty());
        assert!(config.active_tab_id.is_none());
    }

    #[test]
    fn test_serialize_deserialize() {
        let config = AppConfig {
            tree_font_size: 14,
            text_font_size: 16,
            theme: "dark".to_string(),
            sync_display: false,
            sql_uppercase_keywords: false,
            tabs: vec![TabMeta {
                id: "tab1".to_string(),
                title: "Test Tab".to_string(),
                file_path: Some("/tmp/test.txt".to_string()),
                autosave_path: None,
                dirty: true,
                document_type: "text".to_string(),
                document_type_locked: false,
                large_content: false,
                content_loaded: true,
                content_size: 100,
            }],
            active_tab_id: Some("tab1".to_string()),
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.tree_font_size, 14);
        assert_eq!(deserialized.text_font_size, 16);
        assert_eq!(deserialized.theme, "dark");
        assert!(!deserialized.sync_display);
        assert!(!deserialized.sql_uppercase_keywords);
        assert_eq!(deserialized.tabs.len(), 1);
        assert_eq!(deserialized.tabs[0].id, "tab1");
        assert_eq!(deserialized.active_tab_id, Some("tab1".to_string()));
    }

    #[test]
    fn test_deserialize_with_defaults() {
        let json = r#"{}"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.tree_font_size, 10);
        assert_eq!(config.text_font_size, 10);
        assert_eq!(config.theme, "system");
        assert!(config.sync_display);
    }

    #[test]
    fn test_config_dir_path() {
        let dir = AppConfig::config_dir();
        assert!(dir.ends_with("KindEdit"));
    }

    #[test]
    fn test_tabs_dir_path() {
        let dir = AppConfig::tabs_dir();
        assert!(dir.ends_with("tabs"));
    }

    #[test]
    fn test_save_and_load() {
        // Use a temporary directory for testing
        let temp_dir = std::env::temp_dir().join("kindedit_test_config");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let config_path = temp_dir.join("settings.json");
        let config = AppConfig {
            tree_font_size: 12,
            text_font_size: 14,
            ..AppConfig::default()
        };

        // Save manually to temp location
        let content = serde_json::to_string_pretty(&config).unwrap();
        fs::write(&config_path, &content).unwrap();

        // Read back
        let loaded_content = fs::read_to_string(&config_path).unwrap();
        let loaded: AppConfig = serde_json::from_str(&loaded_content).unwrap();
        assert_eq!(loaded.tree_font_size, 12);
        assert_eq!(loaded.text_font_size, 14);

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
