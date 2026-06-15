use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct PdfDocument;

impl DocumentType for PdfDocument {
    fn type_id(&self) -> &str {
        "pdf"
    }

    fn display_name(&self) -> &str {
        "PDF"
    }

    fn extensions(&self) -> &[&str] {
        &[".pdf"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        if content.as_bytes().starts_with(b"%PDF-") {
            100
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
        let doc = PdfDocument;
        assert!(doc.matches_path("file.pdf"));
        assert!(doc.matches_path("FILE.PDF"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score() {
        let doc = PdfDocument;
        assert_eq!(doc.content_score("%PDF-1.7"), 100);
        assert_eq!(doc.content_score("plain text"), 0);
    }
}
