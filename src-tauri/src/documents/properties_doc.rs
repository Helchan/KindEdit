use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct PropertiesDocument;

impl PropertiesDocument {
    /// Check if a line is a valid properties line:
    /// - Empty line
    /// - Comment (starts with # or !)
    /// - Key=value or key: value or key (with no value)
    fn is_valid_line(line: &str) -> bool {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return true;
        }
        if trimmed.starts_with('#') || trimmed.starts_with('!') {
            return true;
        }
        // Key=value or key: value pattern
        if trimmed.contains('=') || trimmed.contains(": ") || trimmed.contains(':') {
            return true;
        }
        false
    }

    /// Parse a line into (key, value) if it's a key-value line
    fn parse_kv_line(line: &str) -> Option<(String, String)> {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
            return None;
        }
        // Try splitting by = first
        if let Some(pos) = trimmed.find('=') {
            let key = trimmed[..pos].trim().to_string();
            let value = trimmed[pos + 1..].trim().to_string();
            return Some((key, value));
        }
        // Try splitting by : (with space after)
        if let Some(pos) = trimmed.find(": ") {
            let key = trimmed[..pos].trim().to_string();
            let value = trimmed[pos + 2..].trim().to_string();
            return Some((key, value));
        }
        // Try splitting by : (without space)
        if let Some(pos) = trimmed.find(':') {
            let key = trimmed[..pos].trim().to_string();
            let value = trimmed[pos + 1..].trim().to_string();
            return Some((key, value));
        }
        None
    }
}

impl DocumentType for PropertiesDocument {
    fn type_id(&self) -> &str {
        "properties"
    }

    fn display_name(&self) -> &str {
        "Properties"
    }

    fn extensions(&self) -> &[&str] {
        &[".properties", ".env", ".ini", ".cfg"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let lines: Vec<&str> = content.lines().take(30).collect();
        if lines.is_empty() {
            return 0;
        }
        let kv_count = lines.iter().filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with('#')
                && !trimmed.starts_with('!')
                && trimmed.contains('=')
        }).count();
        if kv_count >= 3 {
            60
        } else {
            0
        }
    }

    fn parse(&self, content: &str) -> ParseResult {
        for (i, line) in content.lines().enumerate() {
            if !Self::is_valid_line(line) {
                return ParseResult::error(
                    format!("Invalid line: {}", line.trim()),
                    Some(i + 1),
                    Some(1),
                );
            }
        }
        ParseResult::ok()
    }

    fn build_tree(&self, _content: &str) -> Option<Vec<TreeNode>> {
        None
    }

    fn supports_format(&self) -> bool {
        true
    }

    fn supports_compact(&self) -> bool {
        false
    }

    fn format_text(&self, content: &str) -> Result<String, DocumentError> {
        // Parse the content, sort key-value pairs alphabetically,
        // keeping comments attached to the key below them.
        let lines: Vec<&str> = content.lines().collect();
        let mut entries: Vec<(Vec<String>, String, String)> = Vec::new(); // (comments, key, full_line)
        let mut pending_comments: Vec<String> = Vec::new();
        let mut header_comments: Vec<String> = Vec::new();
        let mut has_seen_kv = false;

        for line in &lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                if !has_seen_kv {
                    header_comments.push(String::new());
                } else {
                    pending_comments.push(String::new());
                }
            } else if trimmed.starts_with('#') || trimmed.starts_with('!') {
                if !has_seen_kv {
                    header_comments.push(line.to_string());
                } else {
                    pending_comments.push(line.to_string());
                }
            } else if let Some((key, _)) = Self::parse_kv_line(line) {
                has_seen_kv = true;
                let comments = std::mem::take(&mut pending_comments);
                entries.push((comments, key, line.to_string()));
            } else {
                // Invalid line - just keep it
                has_seen_kv = true;
                let comments = std::mem::take(&mut pending_comments);
                entries.push((comments, line.to_string(), line.to_string()));
            }
        }

        // Sort entries by key
        entries.sort_by_key(|a| a.1.to_lowercase());

        // Rebuild the file
        let mut result = String::new();

        // Header comments first
        for comment in &header_comments {
            result.push_str(comment);
            result.push('\n');
        }

        // Then sorted entries with their comments
        for (comments, _, line) in &entries {
            for comment in comments {
                result.push_str(comment);
                result.push('\n');
            }
            result.push_str(line);
            result.push('\n');
        }

        // Append any trailing pending comments
        for comment in &pending_comments {
            result.push_str(comment);
            result.push('\n');
        }

        Ok(result)
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
        let doc = PropertiesDocument;
        assert!(doc.matches_path("app.properties"));
        assert!(doc.matches_path(".env"));
        assert!(doc.matches_path("config.ini"));
        assert!(doc.matches_path("settings.cfg"));
        assert!(!doc.matches_path("file.json"));
        assert!(!doc.matches_path("file.yaml"));
    }

    #[test]
    fn test_content_score_with_kv_pattern() {
        let doc = PropertiesDocument;
        let content = "db.host=localhost\ndb.port=5432\ndb.name=mydb\n";
        assert!(doc.content_score(content) >= 60);
    }

    #[test]
    fn test_content_score_no_match() {
        let doc = PropertiesDocument;
        assert_eq!(doc.content_score("hello world"), 0);
        assert_eq!(doc.content_score("some random text\nwithout keys"), 0);
    }

    #[test]
    fn test_parse_valid_equals() {
        let doc = PropertiesDocument;
        let content = "key1=value1\nkey2=value2\n";
        let result = doc.parse(content);
        assert!(result.valid);
    }

    #[test]
    fn test_parse_valid_colon() {
        let doc = PropertiesDocument;
        let content = "key1: value1\nkey2: value2\n";
        let result = doc.parse(content);
        assert!(result.valid);
    }

    #[test]
    fn test_parse_valid_comments_and_empty() {
        let doc = PropertiesDocument;
        let content = "# This is a comment\n! Another comment\n\nkey=value\n";
        let result = doc.parse(content);
        assert!(result.valid);
    }

    #[test]
    fn test_parse_invalid_line() {
        let doc = PropertiesDocument;
        let content = "key=value\nthis line has no separator or comment marker and no equals\n";
        let result = doc.parse(content);
        assert!(!result.valid);
        assert!(result.error_message.is_some());
        assert_eq!(result.error_line, Some(2));
    }

    #[test]
    fn test_format_sorts_by_key() {
        let doc = PropertiesDocument;
        let content = "zebra=z\napple=a\nmango=m\n";
        let formatted = doc.format_text(content).unwrap();
        let lines: Vec<&str> = formatted.lines().collect();
        assert_eq!(lines[0], "apple=a");
        assert_eq!(lines[1], "mango=m");
        assert_eq!(lines[2], "zebra=z");
    }

    #[test]
    fn test_format_preserves_comments_above_keys() {
        let doc = PropertiesDocument;
        let content = "# Database config\ndb.host=localhost\n# App name\napp.name=myapp\n";
        let formatted = doc.format_text(content).unwrap();
        // app.name should come before db.host alphabetically
        assert!(formatted.find("app.name").unwrap() < formatted.find("db.host").unwrap());
        // The comment "# App name" should be right before app.name
        assert!(formatted.find("# App name").unwrap() < formatted.find("app.name").unwrap());
    }

    #[test]
    fn test_compact_unsupported() {
        let doc = PropertiesDocument;
        assert!(doc.compact_text("key=value").is_err());
    }

    #[test]
    fn test_build_tree_returns_none() {
        let doc = PropertiesDocument;
        assert!(doc.build_tree("key=value").is_none());
    }

    #[test]
    fn test_view_mode() {
        let doc = PropertiesDocument;
        assert_eq!(doc.view_mode(), ViewMode::Single);
    }

    #[test]
    fn test_parse_on_change() {
        let doc = PropertiesDocument;
        assert!(!doc.parse_on_change());
    }
}
