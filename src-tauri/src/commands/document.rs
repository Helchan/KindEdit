use crate::documents::{ParseResult, TreeNode};
use crate::AppState;

#[tauri::command]
pub async fn parse_document(
    content: String,
    doc_type: String,
    state: tauri::State<'_, AppState>,
) -> Result<ParseResult, String> {
    let doc = state
        .doc_registry
        .get_by_id(&doc_type)
        .ok_or_else(|| format!("Unknown document type: {}", doc_type))?;
    Ok(doc.parse(&content))
}

#[tauri::command]
pub async fn format_text(
    content: String,
    doc_type: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let doc = state
        .doc_registry
        .get_by_id(&doc_type)
        .ok_or_else(|| format!("Unknown document type: {}", doc_type))?;

    if !doc.supports_format() {
        return Err("Format is not supported for this document type".to_string());
    }

    doc.format_text(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compact_text(
    content: String,
    doc_type: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let doc = state
        .doc_registry
        .get_by_id(&doc_type)
        .ok_or_else(|| format!("Unknown document type: {}", doc_type))?;

    if !doc.supports_compact() {
        return Err("Compact is not supported for this document type".to_string());
    }

    doc.compact_text(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn build_tree(
    content: String,
    doc_type: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Vec<TreeNode>>, String> {
    let doc = state
        .doc_registry
        .get_by_id(&doc_type)
        .ok_or_else(|| format!("Unknown document type: {}", doc_type))?;
    Ok(doc.build_tree(&content))
}

#[tauri::command]
pub async fn detect_type(
    path: String,
    content: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let doc = state.doc_registry.detect(&path, &content);
    Ok(doc.type_id().to_string())
}
