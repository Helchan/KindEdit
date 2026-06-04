use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct TextDocument;

impl DocumentType for TextDocument {
    fn type_id(&self) -> &str {
        "text"
    }

    fn display_name(&self) -> &str {
        "Plain Text"
    }

    fn extensions(&self) -> &[&str] {
        &[".txt", ".text"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, _content: &str) -> u8 {
        0
    }

    fn parse(&self, _content: &str) -> ParseResult {
        ParseResult::ok()
    }

    fn build_tree(&self, _content: &str) -> Option<Vec<TreeNode>> {
        None
    }

    fn supports_format(&self) -> bool {
        false
    }

    fn supports_compact(&self) -> bool {
        false
    }

    fn format_text(&self, _content: &str) -> Result<String, DocumentError> {
        Err(DocumentError::Unsupported)
    }

    fn compact_text(&self, _content: &str) -> Result<String, DocumentError> {
        Err(DocumentError::Unsupported)
    }

    fn view_mode(&self) -> ViewMode {
        ViewMode::Single
    }

    fn parse_on_change(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_path() {
        let doc = TextDocument;
        assert!(doc.matches_path("readme.txt"));
        assert!(doc.matches_path("file.text"));
        assert!(!doc.matches_path("file.json"));
    }

    #[test]
    fn test_content_score() {
        let doc = TextDocument;
        assert_eq!(doc.content_score("anything"), 0);
    }

    #[test]
    fn test_parse_always_valid() {
        let doc = TextDocument;
        assert!(doc.parse("any content").valid);
    }

    #[test]
    fn test_format_unsupported() {
        let doc = TextDocument;
        assert!(doc.format_text("text").is_err());
        assert!(doc.compact_text("text").is_err());
    }
}
