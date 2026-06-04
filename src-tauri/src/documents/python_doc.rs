use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct PythonDocument;

impl DocumentType for PythonDocument {
    fn type_id(&self) -> &str {
        "python"
    }

    fn display_name(&self) -> &str {
        "Python"
    }

    fn extensions(&self) -> &[&str] {
        &[".py", ".pyw", ".pyi"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let keywords = ["def ", "class ", "import ", "from ", "if __name__"];
        let count = keywords.iter().filter(|kw| content.contains(*kw)).count();
        if count >= 3 {
            70
        } else if count >= 1 {
            30
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
        let doc = PythonDocument;
        assert!(doc.matches_path("script.py"));
        assert!(doc.matches_path("app.pyw"));
        assert!(doc.matches_path("types.pyi"));
        assert!(!doc.matches_path("file.java"));
    }

    #[test]
    fn test_content_score() {
        let doc = PythonDocument;
        let python_code = "import os\nfrom sys import path\ndef main():\n    pass";
        assert!(doc.content_score(python_code) > 50);
        assert_eq!(doc.content_score("hello world"), 0);
    }

    #[test]
    fn test_parse_always_valid() {
        let doc = PythonDocument;
        assert!(doc.parse("def foo():\n    return 42").valid);
    }
}
