use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct SqlHighlighter;

const SQL_KEYWORDS: &[&str] = &[
    "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER",
    "DROP", "JOIN", "ON", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS", "SET",
    "VALUES", "INTO", "TABLE", "INDEX", "PRIMARY", "KEY", "FOREIGN", "REFERENCES",
    "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "UNION", "DISTINCT",
    "EXISTS", "BETWEEN", "LIKE", "CASE", "WHEN", "THEN", "ELSE", "END", "COUNT",
    "SUM", "AVG", "MIN", "MAX", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS",
    "ASC", "DESC", "ALL", "ANY", "SOME", "TOP", "WITH", "RECURSIVE",
];

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl SyntaxHighlighter for SqlHighlighter {
    fn type_id(&self) -> &str {
        "sql"
    }

    fn tokenize(&self, content: &str) -> Vec<SyntaxToken> {
        let bytes = content.as_bytes();
        let len = bytes.len();
        let mut tokens = Vec::new();
        let mut i = 0;

        while i < len {
            // Skip whitespace
            if bytes[i].is_ascii_whitespace() {
                i += 1;
                continue;
            }

            // Single-line comment --
            if i + 1 < len && bytes[i] == b'-' && bytes[i + 1] == b'-' {
                let start = i;
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Comment, start, end: i });
                continue;
            }

            // Multi-line comment /* */
            if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
                let start = i;
                i += 2;
                while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                if i + 1 < len {
                    i += 2;
                } else {
                    i = len;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Comment, start, end: i });
                continue;
            }

            // String (single quote)
            if bytes[i] == b'\'' {
                let start = i;
                i += 1;
                while i < len && bytes[i] != b'\'' {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
                if i < len {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::String, start, end: i });
                continue;
            }

            // Number
            if bytes[i].is_ascii_digit() || (bytes[i] == b'.' && i + 1 < len && bytes[i + 1].is_ascii_digit()) {
                let start = i;
                while i < len && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Number, start, end: i });
                continue;
            }

            // Operators
            if matches!(bytes[i], b'=' | b'<' | b'>' | b'!') {
                let start = i;
                i += 1;
                if i < len && (bytes[i] == b'=' || bytes[i] == b'>') {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Operator, start, end: i });
                continue;
            }

            // Punctuation
            if matches!(bytes[i], b'(' | b')' | b',' | b';' | b'.') {
                tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                i += 1;
                continue;
            }

            // Word (keyword or identifier)
            if bytes[i].is_ascii_alphabetic() || bytes[i] == b'_' {
                let start = i;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                let word = &content[start..i];
                let upper = word.to_uppercase();
                if SQL_KEYWORDS.contains(&upper.as_str()) {
                    tokens.push(SyntaxToken { kind: TokenKind::Keyword, start, end: i });
                }
                continue;
            }

            i += 1;
        }
        tokens
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_keywords() {
        let hl = SqlHighlighter;
        let input = "SELECT name FROM users WHERE id = 1";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 3);
        assert_eq!(&input[keywords[0].start..keywords[0].end], "SELECT");
        assert_eq!(&input[keywords[1].start..keywords[1].end], "FROM");
        assert_eq!(&input[keywords[2].start..keywords[2].end], "WHERE");
    }

    #[test]
    fn test_sql_case_insensitive() {
        let hl = SqlHighlighter;
        let input = "select * from users";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 2); // select, from
    }

    #[test]
    fn test_sql_string() {
        let hl = SqlHighlighter;
        let input = "WHERE name = 'hello world'";
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 1);
        assert_eq!(&input[strings[0].start..strings[0].end], "'hello world'");
    }

    #[test]
    fn test_sql_comments() {
        let hl = SqlHighlighter;
        let input = "-- this is a comment\nSELECT 1 /* inline */";
        let tokens = hl.tokenize(input);
        let comments: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Comment).collect();
        assert_eq!(comments.len(), 2);
    }

    #[test]
    fn test_sql_number_and_operator() {
        let hl = SqlHighlighter;
        let input = "WHERE id >= 42";
        let tokens = hl.tokenize(input);
        let nums: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Number).collect();
        assert_eq!(nums.len(), 1);
        assert_eq!(&input[nums[0].start..nums[0].end], "42");
        let ops: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Operator).collect();
        assert_eq!(ops.len(), 1);
        assert_eq!(&input[ops[0].start..ops[0].end], ">=");
    }

    #[test]
    fn test_sql_tokenize_range() {
        let hl = SqlHighlighter;
        let input = "SELECT id FROM users";
        let tokens = hl.tokenize_range(input, 0, 9);
        assert!(tokens.iter().all(|t| t.end <= 9));
    }
}
