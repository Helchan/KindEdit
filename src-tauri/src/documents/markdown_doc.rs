use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct MarkdownDocument;

impl DocumentType for MarkdownDocument {
    fn type_id(&self) -> &str {
        "markdown"
    }

    fn display_name(&self) -> &str {
        "Markdown"
    }

    fn extensions(&self) -> &[&str] {
        &[".md", ".markdown", ".mdown", ".mkd"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let trimmed = content.trim_start();
        if trimmed.starts_with('#') || trimmed.starts_with("---") {
            60
        } else {
            0
        }
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
        ViewMode::SplitPreview
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
        let doc = MarkdownDocument;
        assert!(doc.matches_path("README.md"));
        assert!(doc.matches_path("doc.markdown"));
        assert!(doc.matches_path("notes.mdown"));
        assert!(doc.matches_path("file.mkd"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score() {
        let doc = MarkdownDocument;
        assert!(doc.content_score("# Title") > 0);
        assert!(doc.content_score("---\ntitle: test\n---") > 0);
        assert_eq!(doc.content_score("plain text"), 0);
    }

    #[test]
    fn test_parse_always_valid() {
        let doc = MarkdownDocument;
        assert!(doc.parse("# anything\n**bold**").valid);
    }

    #[test]
    fn test_view_mode() {
        let doc = MarkdownDocument;
        assert_eq!(doc.view_mode(), ViewMode::SplitPreview);
    }
}
