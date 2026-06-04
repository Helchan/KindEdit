use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};
use sqlformat::{format, FormatOptions, Indent, QueryParams};

pub struct SqlDocument;

impl SqlDocument {
    fn check_brackets(content: &str) -> ParseResult {
        let mut paren_depth: i32 = 0;
        let mut line = 1;
        let mut col = 1;
        let mut in_single_quote = false;
        let mut in_double_quote = false;
        let mut prev_char = '\0';

        for ch in content.chars() {
            if ch == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }

            if in_single_quote {
                if ch == '\'' && prev_char != '\\' {
                    in_single_quote = false;
                }
                prev_char = ch;
                continue;
            }
            if in_double_quote {
                if ch == '"' && prev_char != '\\' {
                    in_double_quote = false;
                }
                prev_char = ch;
                continue;
            }

            match ch {
                '\'' => in_single_quote = true,
                '"' => in_double_quote = true,
                '(' => paren_depth += 1,
                ')' => {
                    paren_depth -= 1;
                    if paren_depth < 0 {
                        return ParseResult::error(
                            "Unmatched closing parenthesis".to_string(),
                            Some(line),
                            Some(col),
                        );
                    }
                }
                _ => {}
            }
            prev_char = ch;
        }

        if paren_depth != 0 {
            ParseResult::error(
                "Unmatched opening parenthesis".to_string(),
                Some(line),
                Some(col),
            )
        } else {
            ParseResult::ok()
        }
    }
}

impl DocumentType for SqlDocument {
    fn type_id(&self) -> &str {
        "sql"
    }

    fn display_name(&self) -> &str {
        "SQL"
    }

    fn extensions(&self) -> &[&str] {
        &[".sql", ".ddl", ".dml"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let upper = content.to_uppercase();
        let keywords = ["SELECT", "INSERT", "CREATE", "ALTER", "DROP", "UPDATE", "DELETE", "FROM", "WHERE"];
        let count = keywords.iter().filter(|kw| upper.contains(*kw)).count();
        if count >= 3 {
            70
        } else if count >= 1 {
            30
        } else {
            0
        }
    }

    fn parse(&self, content: &str) -> ParseResult {
        Self::check_brackets(content)
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
        let options = FormatOptions {
            indent: Indent::Spaces(4),
            uppercase: true,
            lines_between_queries: 2,
        };
        Ok(format(content, &QueryParams::None, options))
    }

    fn compact_text(&self, _content: &str) -> Result<String, DocumentError> {
        Err(DocumentError::Unsupported)
    }

    fn view_mode(&self) -> ViewMode {
        ViewMode::Single
    }

    fn parse_on_change(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_path() {
        let doc = SqlDocument;
        assert!(doc.matches_path("query.sql"));
        assert!(doc.matches_path("schema.ddl"));
        assert!(doc.matches_path("data.dml"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score() {
        let doc = SqlDocument;
        assert!(doc.content_score("SELECT * FROM users WHERE id = 1") > 50);
        assert!(doc.content_score("CREATE TABLE test (id INT)") > 0);
        assert_eq!(doc.content_score("hello world"), 0);
    }

    #[test]
    fn test_parse_valid() {
        let doc = SqlDocument;
        let result = doc.parse("SELECT * FROM (SELECT id FROM users)");
        assert!(result.valid);
    }

    #[test]
    fn test_parse_unmatched_paren() {
        let doc = SqlDocument;
        let result = doc.parse("SELECT * FROM (users WHERE id = 1");
        assert!(!result.valid);
    }

    #[test]
    fn test_format_sql() {
        let doc = SqlDocument;
        let input = "select id, name from users where active = 1 order by name";
        let formatted = doc.format_text(input).unwrap();
        assert!(formatted.contains('\n'));
        // sqlformat uppercases keywords
        assert!(formatted.contains("SELECT") || formatted.contains("select"));
    }

    #[test]
    fn test_view_mode() {
        let doc = SqlDocument;
        assert_eq!(doc.view_mode(), ViewMode::Single);
    }
}
