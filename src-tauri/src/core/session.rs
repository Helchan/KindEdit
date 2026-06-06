use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;

use super::config::AppConfig;

/// Threshold for large text content (5MB).
/// Content larger than this is saved to a separate file.
const LARGE_CONTENT_THRESHOLD: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub tabs: Vec<TabSession>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSession {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default = "default_doc_type")]
    pub document_type: String,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub autosave_file: Option<String>,
}

fn default_doc_type() -> String {
    "text".to_string()
}

impl SessionData {
    /// Load session data from the tabs directory.
    /// Reads the session.json file and restores large text content from separate files.
    pub fn load() -> Self {
        let tabs_dir = AppConfig::tabs_dir();
        let session_path = tabs_dir.join("session.json");

        if !session_path.exists() {
            return Self::default();
        }

        match fs::read_to_string(&session_path) {
            Ok(content) => {
                let mut session: SessionData =
                    serde_json::from_str(&content).unwrap_or_default();

                // Restore large text content from autosave files
                for tab in &mut session.tabs {
                    if let Some(ref autosave_path) = tab.autosave_file {
                        let full_path = tabs_dir.join(autosave_path);
                        if full_path.exists() {
                            match fs::read_to_string(&full_path) {
                                Ok(file_content) => {
                                    tab.content = Some(file_content);
                                }
                                Err(_) => {
                                    // If we can't read the autosave file, leave content as None
                                }
                            }
                        }
                    }
                }

                session
            }
            Err(_) => Self::default(),
        }
    }

    /// Save session data to the tabs directory.
    /// Large text content (>=5MB) is saved to separate files.
    pub fn save(&self) -> Result<(), std::io::Error> {
        let tabs_dir = AppConfig::tabs_dir();
        fs::create_dir_all(&tabs_dir)?;

        // Prepare session data, separating large content into files
        let mut save_session = self.clone();
        let mut active_autosave_files = HashSet::new();

        for tab in &mut save_session.tabs {
            if let Some(ref content) = tab.content {
                if content.len() >= LARGE_CONTENT_THRESHOLD {
                    // Save large content to a separate file
                    let filename = format!("{}.txt", tab.id);
                    let file_path = tabs_dir.join(&filename);
                    fs::write(&file_path, content)?;
                    tab.autosave_file = Some(filename);
                    tab.content = None; // Don't store in JSON
                }
            }

            if let Some(ref autosave_file) = tab.autosave_file {
                active_autosave_files.insert(autosave_file.clone());
            }
        }

        if let Ok(entries) = fs::read_dir(&tabs_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.extension().is_some_and(|ext| ext == "txt") {
                    continue;
                }
                if let Some(filename) = path.file_name().and_then(|name| name.to_str()) {
                    if !active_autosave_files.contains(filename) {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }

        let session_path = tabs_dir.join("session.json");
        let json = serde_json::to_string_pretty(&save_session)
            .map_err(std::io::Error::other)?;
        fs::write(&session_path, json)
    }

    /// Clear all session data files from the tabs directory.
    pub fn clear() -> Result<(), std::io::Error> {
        let tabs_dir = AppConfig::tabs_dir();
        let session_path = tabs_dir.join("session.json");
        if session_path.exists() {
            fs::remove_file(&session_path)?;
        }
        // Remove autosave txt files
        if let Ok(entries) = fs::read_dir(&tabs_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|ext| ext == "txt") {
                    let _ = fs::remove_file(path);
                }
            }
        }
        Ok(())
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_tabs_dir() -> PathBuf {
        std::env::temp_dir().join("kindedit_test_session")
    }

    #[test]
    fn test_default_session() {
        let session = SessionData::default();
        assert!(session.tabs.is_empty());
        assert!(session.active_tab_id.is_none());
    }

    #[test]
    fn test_serialize_deserialize() {
        let session = SessionData {
            tabs: vec![
                TabSession {
                    id: "tab1".to_string(),
                    title: "File 1".to_string(),
                    file_path: Some("/tmp/file1.txt".to_string()),
                    document_type: "text".to_string(),
                    dirty: false,
                    content: Some("Hello, world!".to_string()),
                    autosave_file: None,
                },
                TabSession {
                    id: "tab2".to_string(),
                    title: "File 2".to_string(),
                    file_path: None,
                    document_type: "markdown".to_string(),
                    dirty: true,
                    content: Some("# Title".to_string()),
                    autosave_file: None,
                },
            ],
            active_tab_id: Some("tab1".to_string()),
        };

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: SessionData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.tabs.len(), 2);
        assert_eq!(deserialized.tabs[0].id, "tab1");
        assert_eq!(deserialized.tabs[1].document_type, "markdown");
        assert_eq!(deserialized.active_tab_id, Some("tab1".to_string()));
    }

    #[test]
    fn test_session_save_and_load_small_content() {
        let tabs_dir = test_tabs_dir();
        let _ = fs::remove_dir_all(&tabs_dir);
        fs::create_dir_all(&tabs_dir).unwrap();

        let session = SessionData {
            tabs: vec![TabSession {
                id: "small_tab".to_string(),
                title: "Small File".to_string(),
                file_path: None,
                document_type: "text".to_string(),
                dirty: false,
                content: Some("Small content here".to_string()),
                autosave_file: None,
            }],
            active_tab_id: Some("small_tab".to_string()),
        };

        // Save to temp dir manually for test isolation
        let json = serde_json::to_string_pretty(&session).unwrap();
        let session_path = tabs_dir.join("session.json");
        fs::write(&session_path, &json).unwrap();

        // Read back
        let loaded_content = fs::read_to_string(&session_path).unwrap();
        let loaded: SessionData = serde_json::from_str(&loaded_content).unwrap();
        assert_eq!(loaded.tabs.len(), 1);
        assert_eq!(
            loaded.tabs[0].content,
            Some("Small content here".to_string())
        );

        let _ = fs::remove_dir_all(&tabs_dir);
    }

    #[test]
    fn test_large_content_threshold() {
        // Verify the threshold constant
        assert_eq!(LARGE_CONTENT_THRESHOLD, 5 * 1024 * 1024);
    }
}
