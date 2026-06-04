use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct JsonHighlighter;

impl SyntaxHighlighter for JsonHighlighter {
    fn type_id(&self) -> &str {
        "json"
    }

    fn tokenize(&self, content: &str) -> Vec<SyntaxToken> {
        let bytes = content.as_bytes();
        let len = bytes.len();
        let mut tokens = Vec::new();
        let mut i = 0;

        while i < len {
            match bytes[i] {
                b'"' => {
                    let start = i;
                    i += 1;
                    while i < len && bytes[i] != b'"' {
                        if bytes[i] == b'\\' {
                            i += 1; // skip escaped char
                        }
                        i += 1;
                    }
                    if i < len {
                        i += 1; // closing quote
                    }
                    // Determine if this is a property key (followed by colon)
                    let mut j = i;
                    while j < len && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'\n' || bytes[j] == b'\r') {
                        j += 1;
                    }
                    let kind = if j < len && bytes[j] == b':' {
                        TokenKind::Property
                    } else {
                        TokenKind::String
                    };
                    tokens.push(SyntaxToken { kind, start, end: i });
                }
                b't' if i + 4 <= len && &content[i..i + 4] == "true" => {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start: i, end: i + 4 });
                    i += 4;
                }
                b'f' if i + 5 <= len && &content[i..i + 5] == "false" => {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start: i, end: i + 5 });
                    i += 5;
                }
                b'n' if i + 4 <= len && &content[i..i + 4] == "null" => {
                    tokens.push(SyntaxToken { kind: TokenKind::Constant, start: i, end: i + 4 });
                    i += 4;
                }
                b'0'..=b'9' | b'-' if (bytes[i] != b'-' || (i + 1 < len && bytes[i + 1].is_ascii_digit())) => {
                    let start = i;
                    if bytes[i] == b'-' {
                        i += 1;
                    }
                    while i < len && (bytes[i].is_ascii_digit() || bytes[i] == b'.' || bytes[i] == b'e' || bytes[i] == b'E' || bytes[i] == b'+' || bytes[i] == b'-') {
                        i += 1;
                    }
                    tokens.push(SyntaxToken { kind: TokenKind::Number, start, end: i });
                }
                b'{' | b'}' | b'[' | b']' | b':' | b',' => {
                    tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                    i += 1;
                }
                _ => {
                    i += 1;
                }
            }
        }
        tokens
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_property_and_string() {
        let hl = JsonHighlighter;
        let input = r#"{"name": "hello"}"#;
        let tokens = hl.tokenize(input);

        let prop = tokens.iter().find(|t| t.kind == TokenKind::Property).unwrap();
        assert_eq!(&input[prop.start..prop.end], "\"name\"");

        let s = tokens.iter().find(|t| t.kind == TokenKind::String).unwrap();
        assert_eq!(&input[s.start..s.end], "\"hello\"");
    }

    #[test]
    fn test_json_constants() {
        let hl = JsonHighlighter;
        let input = r#"{"a": true, "b": false, "c": null}"#;
        let tokens = hl.tokenize(input);
        let constants: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Constant).collect();
        assert_eq!(constants.len(), 3);
    }

    #[test]
    fn test_json_number() {
        let hl = JsonHighlighter;
        let input = r#"{"val": 42, "neg": -3.14}"#;
        let tokens = hl.tokenize(input);
        let numbers: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Number).collect();
        assert_eq!(numbers.len(), 2);
        assert_eq!(&input[numbers[0].start..numbers[0].end], "42");
        assert_eq!(&input[numbers[1].start..numbers[1].end], "-3.14");
    }

    #[test]
    fn test_json_escaped_string() {
        let hl = JsonHighlighter;
        let input = r#"{"msg": "he said \"hi\""}"#;
        let tokens = hl.tokenize(input);
        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 1);
        assert_eq!(&input[strings[0].start..strings[0].end], r#""he said \"hi\"""#);
    }

    #[test]
    fn test_json_tokenize_range() {
        let hl = JsonHighlighter;
        let input = r#"{"a": 1, "b": 2}"#;
        let tokens = hl.tokenize_range(input, 0, 8);
        // Only tokens in [0, 8) range
        assert!(tokens.iter().all(|t| t.start < 8 && t.end <= 8));
    }
}
