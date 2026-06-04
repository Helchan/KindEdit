use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct JavaScriptHighlighter;

const JS_KEYWORDS: &[&str] = &[
    "function", "const", "let", "var", "return", "if", "else", "for", "while",
    "do", "switch", "case", "break", "continue", "try", "catch", "finally",
    "throw", "new", "class", "extends", "import", "export", "from", "default",
    "async", "await", "yield", "typeof", "instanceof", "in", "of", "delete", "void",
    "this", "super", "static", "get", "set",
];

const JS_CONSTANTS: &[&str] = &["true", "false", "null", "undefined", "NaN", "Infinity"];

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

impl SyntaxHighlighter for JavaScriptHighlighter {
    fn type_id(&self) -> &str {
        "javascript"
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

            // Single-line comment
            if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'/' {
                let start = i;
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Comment, start, end: i });
                continue;
            }

            // Multi-line comment
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

            // Template string (backtick)
            if bytes[i] == b'`' {
                let start = i;
                i += 1;
                while i < len && bytes[i] != b'`' {
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

            // String (single or double quote)
            if bytes[i] == b'"' || bytes[i] == b'\'' {
                let quote = bytes[i];
                let start = i;
                i += 1;
                while i < len && bytes[i] != quote && bytes[i] != b'\n' {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
                if i < len && bytes[i] == quote {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::String, start, end: i });
                continue;
            }

            // Number
            if bytes[i].is_ascii_digit() || (bytes[i] == b'.' && i + 1 < len && bytes[i + 1].is_ascii_digit()) {
                let start = i;
                if bytes[i] == b'0' && i + 1 < len && matches!(bytes[i + 1], b'x' | b'X' | b'o' | b'O' | b'b' | b'B') {
                    i += 2;
                    while i < len && (bytes[i].is_ascii_hexdigit() || bytes[i] == b'_') {
                        i += 1;
                    }
                } else {
                    while i < len && (bytes[i].is_ascii_digit() || bytes[i] == b'.' || bytes[i] == b'_'
                        || bytes[i] == b'e' || bytes[i] == b'E') {
                        i += 1;
                    }
                    // BigInt suffix
                    if i < len && bytes[i] == b'n' {
                        i += 1;
                    }
                }
                tokens.push(SyntaxToken { kind: TokenKind::Number, start, end: i });
                continue;
            }

            // Operators (multi-char first)
            if i + 2 < len && ((&content[i..i + 3] == "===" || &content[i..i + 3] == "!==")
                || &content[i..i + 3] == ">>>") {
                tokens.push(SyntaxToken { kind: TokenKind::Operator, start: i, end: i + 3 });
                i += 3;
                continue;
            }
            if i + 1 < len && ((&content[i..i + 2] == "==" || &content[i..i + 2] == "!=")
                || &content[i..i + 2] == "&&" || &content[i..i + 2] == "||"
                || &content[i..i + 2] == "=>" || &content[i..i + 2] == "+="
                || &content[i..i + 2] == "-=" || &content[i..i + 2] == "*="
                || &content[i..i + 2] == "/=" || &content[i..i + 2] == ">="
                || &content[i..i + 2] == "<=" || &content[i..i + 2] == "**"
                || &content[i..i + 2] == "??" || &content[i..i + 2] == "?."
                || &content[i..i + 2] == "++" || &content[i..i + 2] == "--") {
                tokens.push(SyntaxToken { kind: TokenKind::Operator, start: i, end: i + 2 });
                i += 2;
                continue;
            }
            if matches!(bytes[i], b'=' | b'+' | b'-' | b'*' | b'/' | b'%' | b'<' | b'>' | b'!' | b'&' | b'|' | b'^' | b'~' | b'?') {
                // Avoid treating / after comment detection
                tokens.push(SyntaxToken { kind: TokenKind::Operator, start: i, end: i + 1 });
                i += 1;
                continue;
            }

            // Word (keyword, constant, or identifier)
            if bytes[i].is_ascii_alphabetic() || bytes[i] == b'_' || bytes[i] == b'$' {
                let start = i;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                let word = &content[start..i];
                if JS_CONSTANTS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start, end: i });
                } else if JS_KEYWORDS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Keyword, start, end: i });
                }
                continue;
            }

            // Punctuation
            if matches!(bytes[i], b'(' | b')' | b'[' | b']' | b'{' | b'}' | b';' | b',' | b':' | b'.') {
                tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                i += 1;
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
    fn test_js_keywords() {
        let hl = JavaScriptHighlighter;
        let input = "const x = function() { return 1; }";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 3); // const, function, return
    }

    #[test]
    fn test_js_constants() {
        let hl = JavaScriptHighlighter;
        let input = "let a = true; let b = null; let c = undefined;";
        let tokens = hl.tokenize(input);
        let constants: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Constant).collect();
        assert_eq!(constants.len(), 3);
    }

    #[test]
    fn test_js_strings() {
        let hl = JavaScriptHighlighter;
        let input = r#"const a = "hello"; const b = 'world'; const c = `tmpl`;"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 3);
    }

    #[test]
    fn test_js_comments() {
        let hl = JavaScriptHighlighter;
        let input = "// line comment\n/* block\ncomment */";
        let tokens = hl.tokenize(input);
        let comments: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Comment).collect();
        assert_eq!(comments.len(), 2);
    }

    #[test]
    fn test_js_operators() {
        let hl = JavaScriptHighlighter;
        let input = "a === b && c !== d || e => f";
        let tokens = hl.tokenize(input);
        let ops: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Operator).collect();
        assert!(ops.len() >= 4); // ===, &&, !==, ||, =>
    }

    #[test]
    fn test_js_arrow_function() {
        let hl = JavaScriptHighlighter;
        let input = "const fn = (x) => x + 1";
        let tokens = hl.tokenize(input);
        let arrow: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Operator && &input[t.start..t.end] == "=>").collect();
        assert_eq!(arrow.len(), 1);
    }

    #[test]
    fn test_js_escaped_string() {
        let hl = JavaScriptHighlighter;
        let input = r#"const s = "he said \"hi\"";"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 1);
    }

    #[test]
    fn test_js_keyword_boundary() {
        let hl = JavaScriptHighlighter;
        let input = "constant = 1; lethal = 2;";
        let tokens = hl.tokenize(input);
        // "const" should NOT be detected inside "constant"
        // "let" should NOT be detected inside "lethal"
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 0);
    }

    #[test]
    fn test_js_tokenize_range() {
        let hl = JavaScriptHighlighter;
        let input = "const x = 42;";
        let tokens = hl.tokenize_range(input, 0, 5);
        assert!(tokens.iter().all(|t| t.end <= 5));
    }
}
