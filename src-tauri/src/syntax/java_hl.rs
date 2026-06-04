use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct JavaHighlighter;

const JAVA_KEYWORDS: &[&str] = &[
    "public", "private", "protected", "class", "interface", "extends", "implements",
    "import", "package", "return", "void", "int", "long", "double", "float",
    "boolean", "char", "byte", "short", "new", "if", "else", "for", "while",
    "do", "switch", "case", "break", "continue", "try", "catch", "finally",
    "throw", "throws", "static", "final", "abstract", "synchronized", "this",
    "super", "enum", "instanceof", "default", "transient", "volatile",
];

const JAVA_CONSTANTS: &[&str] = &["true", "false", "null"];

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl SyntaxHighlighter for JavaHighlighter {
    fn type_id(&self) -> &str {
        "java"
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

            // Annotation
            if bytes[i] == b'@' {
                let start = i;
                i += 1;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Type, start, end: i });
                continue;
            }

            // String (double quote)
            if bytes[i] == b'"' {
                let start = i;
                i += 1;
                while i < len && bytes[i] != b'"' {
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

            // Char (single quote)
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
                while i < len && (bytes[i].is_ascii_digit() || bytes[i] == b'.' || bytes[i] == b'x'
                    || bytes[i] == b'X' || bytes[i] == b'L' || bytes[i] == b'l'
                    || bytes[i] == b'f' || bytes[i] == b'F' || bytes[i] == b'd'
                    || bytes[i] == b'D' || bytes[i] == b'_'
                    || (bytes[i] >= b'a' && bytes[i] <= b'f')
                    || (bytes[i] >= b'A' && bytes[i] <= b'F')) {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Number, start, end: i });
                continue;
            }

            // Word (keyword, constant, or identifier)
            if bytes[i].is_ascii_alphabetic() || bytes[i] == b'_' {
                let start = i;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                let word = &content[start..i];
                if JAVA_CONSTANTS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start, end: i });
                } else if JAVA_KEYWORDS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Keyword, start, end: i });
                } else if word.starts_with(|c: char| c.is_uppercase()) {
                    tokens.push(SyntaxToken { kind: TokenKind::Type, start, end: i });
                }
                continue;
            }

            // Punctuation
            if matches!(bytes[i], b'{' | b'}' | b'(' | b')' | b'[' | b']' | b';' | b',' | b'.') {
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
    fn test_java_keywords() {
        let hl = JavaHighlighter;
        let input = "public class Main extends Object {}";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert!(keywords.len() >= 3);
        assert_eq!(&input[keywords[0].start..keywords[0].end], "public");
        assert_eq!(&input[keywords[1].start..keywords[1].end], "class");
        assert_eq!(&input[keywords[2].start..keywords[2].end], "extends");
    }

    #[test]
    fn test_java_constants() {
        let hl = JavaHighlighter;
        let input = "boolean a = true; Object b = null;";
        let tokens = hl.tokenize(input);
        let constants: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Constant).collect();
        assert_eq!(constants.len(), 2);
    }

    #[test]
    fn test_java_string_and_char() {
        let hl = JavaHighlighter;
        let input = r#"String s = "hello"; char c = 'x';"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 2);
    }

    #[test]
    fn test_java_annotation() {
        let hl = JavaHighlighter;
        let input = "@Override\npublic void run() {}";
        let tokens = hl.tokenize(input);
        let types: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Type && &input[t.start..t.end] == "@Override").collect();
        assert_eq!(types.len(), 1);
    }

    #[test]
    fn test_java_comments() {
        let hl = JavaHighlighter;
        let input = "// single line\n/* multi\nline */";
        let tokens = hl.tokenize(input);
        let comments: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Comment).collect();
        assert_eq!(comments.len(), 2);
    }

    #[test]
    fn test_java_escaped_string() {
        let hl = JavaHighlighter;
        let input = r#"String s = "he said \"hi\"";"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 1);
        assert_eq!(&input[strings[0].start..strings[0].end], r#""he said \"hi\"""#);
    }

    #[test]
    fn test_java_tokenize_range() {
        let hl = JavaHighlighter;
        let input = "public class Foo {}";
        let tokens = hl.tokenize_range(input, 0, 6);
        assert!(tokens.iter().all(|t| t.end <= 6));
    }
}
