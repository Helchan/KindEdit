use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct LogDocument;

impl DocumentType for LogDocument {
    fn type_id(&self) -> &str {
        "log"
    }

    fn display_name(&self) -> &str {
        "Log"
    }

    fn extensions(&self) -> &[&str] {
        &[".log"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        // Check for common date/time patterns: YYYY-MM-DD, HH:MM:SS, or ISO timestamps
        let has_date = content.contains('-') && content.contains(':');
        let patterns = [
            "INFO", "WARN", "ERROR", "DEBUG", "TRACE", "FATAL",
        ];
        let has_level = patterns.iter().any(|p| content.contains(p));

        if has_date && has_level {
            60
        } else if has_level {
            30
        } else if has_date && content.lines().count() > 3 {
            20
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
        let doc = LogDocument;
        assert!(doc.matches_path("app.log"));
        assert!(doc.matches_path("error.log"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score() {
        let doc = LogDocument;
        let log_content = "2024-01-15 10:30:45 INFO Starting application\n2024-01-15 10:30:46 ERROR Connection failed";
        assert!(doc.content_score(log_content) > 0);
        assert_eq!(doc.content_score("plain text without patterns"), 0);
    }

    #[test]
    fn test_parse_always_valid() {
        let doc = LogDocument;
        assert!(doc.parse("any log content").valid);
    }
}
