use super::{DocumentError, DocumentType, ParseResult, TreeNode, ViewMode};

pub struct JavaDocument;

impl JavaDocument {
    fn check_brackets(content: &str) -> ParseResult {
        let mut brace_depth: i32 = 0;
        let mut paren_depth: i32 = 0;
        let mut bracket_depth: i32 = 0;
        let mut line = 1;
        let mut col = 1;
        let mut in_single_quote = false;
        let mut in_double_quote = false;
        let mut in_line_comment = false;
        let mut in_block_comment = false;
        let mut prev_char = '\0';

        for ch in content.chars() {
            if ch == '\n' {
                line += 1;
                col = 1;
                in_line_comment = false;
                prev_char = ch;
                continue;
            } else {
                col += 1;
            }

            if in_line_comment {
                prev_char = ch;
                continue;
            }
            if in_block_comment {
                if prev_char == '*' && ch == '/' {
                    in_block_comment = false;
                }
                prev_char = ch;
                continue;
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

            if prev_char == '/' && ch == '/' {
                in_line_comment = true;
                prev_char = ch;
                continue;
            }
            if prev_char == '/' && ch == '*' {
                in_block_comment = true;
                prev_char = ch;
                continue;
            }

            match ch {
                '\'' => in_single_quote = true,
                '"' => in_double_quote = true,
                '{' => brace_depth += 1,
                '}' => {
                    brace_depth -= 1;
                    if brace_depth < 0 {
                        return ParseResult::error("Unmatched '}'".to_string(), Some(line), Some(col));
                    }
                }
                '(' => paren_depth += 1,
                ')' => {
                    paren_depth -= 1;
                    if paren_depth < 0 {
                        return ParseResult::error("Unmatched ')'".to_string(), Some(line), Some(col));
                    }
                }
                '[' => bracket_depth += 1,
                ']' => {
                    bracket_depth -= 1;
                    if bracket_depth < 0 {
                        return ParseResult::error("Unmatched ']'".to_string(), Some(line), Some(col));
                    }
                }
                _ => {}
            }
            prev_char = ch;
        }

        if brace_depth != 0 {
            ParseResult::error("Unmatched '{'".to_string(), Some(line), Some(col))
        } else if paren_depth != 0 {
            ParseResult::error("Unmatched '('".to_string(), Some(line), Some(col))
        } else if bracket_depth != 0 {
            ParseResult::error("Unmatched '['".to_string(), Some(line), Some(col))
        } else {
            ParseResult::ok()
        }
    }
}

impl DocumentType for JavaDocument {
    fn type_id(&self) -> &str {
        "java"
    }

    fn display_name(&self) -> &str {
        "Java"
    }

    fn extensions(&self) -> &[&str] {
        &[".java"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let keywords = ["class ", "public ", "private ", "protected ", "import ", "package "];
        let count = keywords.iter().filter(|kw| content.contains(*kw)).count();
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
        let doc = JavaDocument;
        assert!(doc.matches_path("Main.java"));
        assert!(!doc.matches_path("main.py"));
    }

    #[test]
    fn test_content_score() {
        let doc = JavaDocument;
        let java_code = "package com.example;\nimport java.util.List;\npublic class Main {}";
        assert!(doc.content_score(java_code) > 50);
        assert_eq!(doc.content_score("hello world"), 0);
    }

    #[test]
    fn test_parse_valid() {
        let doc = JavaDocument;
        let code = "public class Main { void test() { if (true) { } } }";
        assert!(doc.parse(code).valid);
    }

    #[test]
    fn test_parse_unmatched() {
        let doc = JavaDocument;
        let code = "public class Main { void test() { if (true) { }";
        assert!(!doc.parse(code).valid);
    }
}
