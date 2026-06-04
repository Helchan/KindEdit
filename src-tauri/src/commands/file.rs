use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::documents::TreeNode;
use crate::core::rope::TextBuffer;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct OpenFileResult {
    pub content: String,
    pub doc_type: String,
    pub tree: Option<Vec<TreeNode>>,
    pub is_large: bool,
}

#[tauri::command]
pub async fn open_file(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<OpenFileResult, String> {
    // Check if file exists
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    // Read file using TextBuffer for efficient large file handling
    let buffer = TextBuffer::from_file(&path).map_err(|e| e.to_string())?;
    let is_large = buffer.is_large();
    let content = buffer.text();

    // Detect document type
    let doc_type = state.doc_registry.detect(&path, &content);
    let type_id = doc_type.type_id().to_string();

    // Try to build tree
    let tree = doc_type.build_tree(&content);

    Ok(OpenFileResult {
        content,
        doc_type: type_id,
        tree,
        is_large,
    })
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // For large content, use TextBuffer for chunked writing
    if content.len() > crate::core::rope::LARGE_TEXT_THRESHOLD {
        let buffer = TextBuffer::from_content(&content);
        buffer.save_to_file(&path).map_err(|e| e.to_string())?;
    } else {
        fs::write(&path, &content).map_err(|e| e.to_string())?;
    }

    Ok(())
}
