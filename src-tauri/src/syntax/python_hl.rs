use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct PythonHighlighter;

const PYTHON_KEYWORDS: &[&str] = &[
    "def", "class", "import", "from", "return", "if", "elif", "else", "for",
    "while", "try", "except", "finally", "with", "as", "pass", "break",
    "continue", "yield", "lambda", "and", "or", "not", "in", "is", "global",
    "nonlocal", "assert", "raise", "del", "async", "await",
];

const PYTHON_CONSTANTS: &[&str] = &["True", "False", "None"];

const PYTHON_BUILTINS: &[&str] = &[
    "print", "len", "range", "type", "str", "int", "float", "list", "dict",
    "set", "tuple", "isinstance", "enumerate", "zip", "map", "filter", "sorted",
    "reversed", "open", "super", "property", "staticmethod", "classmethod",
];

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl SyntaxHighlighter for PythonHighlighter {
    fn type_id(&self) -> &str {
        "python"
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

            // Comment
            if bytes[i] == b'#' {
                let start = i;
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Comment, start, end: i });
                continue;
            }

            // Decorator
            if bytes[i] == b'@' {
                let start = i;
                i += 1;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                // Handle dotted decorators like @app.route
                while i < len && bytes[i] == b'.' {
                    i += 1;
                    while i < len && is_word_char(bytes[i]) {
                        i += 1;
                    }
                }
                tokens.push(SyntaxToken { kind: TokenKind::Type, start, end: i });
                continue;
            }

            // Triple-quoted strings
            if i + 2 < len && ((bytes[i] == b'"' && bytes[i + 1] == b'"' && bytes[i + 2] == b'"')
                || (bytes[i] == b'\'' && bytes[i + 1] == b'\'' && bytes[i + 2] == b'\''))
            {
                let quote = bytes[i];
                let start = i;
                i += 3;
                while i + 2 < len && !(bytes[i] == quote && bytes[i + 1] == quote && bytes[i + 2] == quote) {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
                if i + 2 < len {
                    i += 3;
                } else {
                    i = len;
                }
                tokens.push(SyntaxToken { kind: TokenKind::String, start, end: i });
                continue;
            }

            // f-string prefix
            if (bytes[i] == b'f' || bytes[i] == b'r' || bytes[i] == b'b')
                && i + 1 < len
                && (bytes[i + 1] == b'"' || bytes[i + 1] == b'\'')
            {
                let start = i;
                i += 1;
                let quote = bytes[i];
                i += 1;
                while i < len && bytes[i] != quote {
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
                while i < len && bytes[i] != quote {
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
                // Handle 0x, 0o, 0b prefixes
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
                    // Handle j for complex numbers
                    if i < len && bytes[i] == b'j' {
                        i += 1;
                    }
                }
                tokens.push(SyntaxToken { kind: TokenKind::Number, start, end: i });
                continue;
            }

            // Word
            if bytes[i].is_ascii_alphabetic() || bytes[i] == b'_' {
                let start = i;
                while i < len && is_word_char(bytes[i]) {
                    i += 1;
                }
                let word = &content[start..i];
                if PYTHON_CONSTANTS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start, end: i });
                } else if PYTHON_KEYWORDS.contains(&word) {
                    tokens.push(SyntaxToken { kind: TokenKind::Keyword, start, end: i });
                } else if PYTHON_BUILTINS.contains(&word) {
                    // Check if followed by '(' to confirm it's used as a function
                    let mut j = i;
                    while j < len && bytes[j].is_ascii_whitespace() {
                        j += 1;
                    }
                    if j < len && bytes[j] == b'(' {
                        tokens.push(SyntaxToken { kind: TokenKind::Function, start, end: i });
                    }
                }
                continue;
            }

            // Punctuation
            if matches!(bytes[i], b'(' | b')' | b'[' | b']' | b'{' | b'}' | b':' | b',' | b';' | b'.') {
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
    fn test_python_keywords() {
        let hl = PythonHighlighter;
        let input = "def hello():\n    return 42";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 2);
        assert_eq!(&input[keywords[0].start..keywords[0].end], "def");
        assert_eq!(&input[keywords[1].start..keywords[1].end], "return");
    }

    #[test]
    fn test_python_constants() {
        let hl = PythonHighlighter;
        let input = "x = True\ny = False\nz = None";
        let tokens = hl.tokenize(input);
        let constants: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Constant).collect();
        assert_eq!(constants.len(), 3);
    }

    #[test]
    fn test_python_string_types() {
        let hl = PythonHighlighter;
        let input = r#"a = "hello"
b = 'world'
c = """multi
line"""
"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 3);
    }

    #[test]
    fn test_python_comment() {
        let hl = PythonHighlighter;
        let input = "x = 1  # this is a comment";
        let tokens = hl.tokenize(input);
        let comments: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Comment).collect();
        assert_eq!(comments.len(), 1);
        assert!(input[comments[0].start..comments[0].end].starts_with('#'));
    }

    #[test]
    fn test_python_decorator() {
        let hl = PythonHighlighter;
        let input = "@staticmethod\ndef foo(): pass";
        let tokens = hl.tokenize(input);
        let types: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Type).collect();
        assert_eq!(types.len(), 1);
        assert_eq!(&input[types[0].start..types[0].end], "@staticmethod");
    }

    #[test]
    fn test_python_builtin_function() {
        let hl = PythonHighlighter;
        let input = "print(len(x))";
        let tokens = hl.tokenize(input);
        let funcs: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Function).collect();
        assert_eq!(funcs.len(), 2);
    }

    #[test]
    fn test_python_keyword_boundary() {
        let hl = PythonHighlighter;
        let input = "format = 1";
        let tokens = hl.tokenize(input);
        // "for" should NOT be detected as keyword inside "format"
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 0);
    }

    #[test]
    fn test_python_tokenize_range() {
        let hl = PythonHighlighter;
        let input = "def foo():\n    pass";
        let tokens = hl.tokenize_range(input, 0, 3);
        assert!(tokens.iter().all(|t| t.end <= 3));
    }
}
