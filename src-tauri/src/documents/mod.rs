pub mod json_doc;
pub mod xml_doc;
pub mod markdown_doc;
pub mod yaml_doc;
pub mod properties_doc;
pub mod sql_doc;
pub mod java_doc;
pub mod python_doc;
pub mod javascript_doc;
pub mod text_doc;
pub mod log_doc;
pub mod pdf_doc;

use serde::{Deserialize, Serialize};

// 视图模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ViewMode {
    Single,       // 纯文本编辑
    SplitTree,    // 左树右编辑器（JSON/XML）
    SplitPreview, // 左预览右源码（Markdown）
}

// 树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub key: String,
    pub value: Option<String>,
    pub node_type: NodeType,
    pub path: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub children: Vec<TreeNode>,
    pub expanded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeType {
    Object,
    Array,
    String,
    Number,
    Boolean,
    Null,
    Element,   // XML element
    Attribute, // XML attribute
    Text,      // XML text content
}

// 解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub valid: bool,
    pub error_message: Option<String>,
    pub error_line: Option<usize>,
    pub error_column: Option<usize>,
}

impl ParseResult {
    pub fn ok() -> Self {
        Self {
            valid: true,
            error_message: None,
            error_line: None,
            error_column: None,
        }
    }

    pub fn error(message: String, line: Option<usize>, column: Option<usize>) -> Self {
        Self {
            valid: false,
            error_message: Some(message),
            error_line: line,
            error_column: column,
        }
    }
}

// 错误类型
#[derive(Debug, thiserror::Error)]
pub enum DocumentError {
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Format error: {0}")]
    FormatError(String),
    #[error("Unsupported operation")]
    Unsupported,
}

// 文档类型 Trait
pub trait DocumentType: Send + Sync {
    fn type_id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn extensions(&self) -> &[&str];
    fn matches_path(&self, path: &str) -> bool;
    fn content_score(&self, content: &str) -> u8;

    // 解析
    fn parse(&self, content: &str) -> ParseResult;
    fn build_tree(&self, content: &str) -> Option<Vec<TreeNode>>;

    // 格式化
    fn supports_format(&self) -> bool;
    fn supports_compact(&self) -> bool;
    fn format_text(&self, content: &str) -> Result<String, DocumentError>;
    fn compact_text(&self, content: &str) -> Result<String, DocumentError>;

    // 视图
    fn view_mode(&self) -> ViewMode;
    fn parse_on_change(&self) -> bool;
}

// 注册表
pub struct DocumentRegistry {
    types: Vec<Box<dyn DocumentType>>,
}

impl DocumentRegistry {
    pub fn new() -> Self {
        let types: Vec<Box<dyn DocumentType>> = vec![
            Box::new(json_doc::JsonDocument),
            Box::new(xml_doc::XmlDocument),
            Box::new(markdown_doc::MarkdownDocument),
            Box::new(yaml_doc::YamlDocument),
            Box::new(properties_doc::PropertiesDocument),
            Box::new(sql_doc::SqlDocument),
            Box::new(java_doc::JavaDocument),
            Box::new(python_doc::PythonDocument),
            Box::new(javascript_doc::JavaScriptDocument),
            Box::new(log_doc::LogDocument),
            Box::new(pdf_doc::PdfDocument),
            Box::new(text_doc::TextDocument), // text must be last (fallback)
        ];
        Self { types }
    }

    pub fn detect_by_path(&self, path: &str) -> Option<&dyn DocumentType> {
        self.types
            .iter()
            .find(|t| t.matches_path(path))
            .map(|t| t.as_ref())
    }

    pub fn detect_by_content(&self, content: &str) -> Option<&dyn DocumentType> {
        let mut best: Option<&dyn DocumentType> = None;
        let mut best_score: u8 = 0;
        for t in &self.types {
            let score = t.content_score(content);
            if score > best_score {
                best_score = score;
                best = Some(t.as_ref());
            }
        }
        if best_score > 0 {
            best
        } else {
            None
        }
    }

    pub fn detect(&self, path: &str, content: &str) -> &dyn DocumentType {
        if let Some(t) = self.detect_by_path(path) {
            return t;
        }
        if let Some(t) = self.detect_by_content(content) {
            return t;
        }
        // fallback to text
        self.types.last().unwrap().as_ref()
    }

    pub fn get_by_id(&self, type_id: &str) -> Option<&dyn DocumentType> {
        self.types
            .iter()
            .find(|t| t.type_id() == type_id)
            .map(|t| t.as_ref())
    }

    pub fn all_types(&self) -> &[Box<dyn DocumentType>] {
        &self.types
    }
}

impl Default for DocumentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_detect_by_path() {
        let registry = DocumentRegistry::new();
        let doc = registry.detect_by_path("test.json").unwrap();
        assert_eq!(doc.type_id(), "json");

        let doc = registry.detect_by_path("style.xml").unwrap();
        assert_eq!(doc.type_id(), "xml");

        let doc = registry.detect_by_path("readme.md").unwrap();
        assert_eq!(doc.type_id(), "markdown");

        let doc = registry.detect_by_path("book.pdf").unwrap();
        assert_eq!(doc.type_id(), "pdf");
    }

    #[test]
    fn test_registry_detect_by_content() {
        let registry = DocumentRegistry::new();
        let doc = registry.detect_by_content("{\"key\": \"value\"}").unwrap();
        assert_eq!(doc.type_id(), "json");
    }

    #[test]
    fn test_registry_fallback_to_text() {
        let registry = DocumentRegistry::new();
        let doc = registry.detect("unknown.xyz", "random content");
        assert_eq!(doc.type_id(), "text");
    }

    #[test]
    fn test_registry_get_by_id() {
        let registry = DocumentRegistry::new();
        assert!(registry.get_by_id("json").is_some());
        assert!(registry.get_by_id("xml").is_some());
        assert!(registry.get_by_id("nonexistent").is_none());
    }
}
