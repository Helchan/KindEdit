use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct XmlHighlighter;

impl SyntaxHighlighter for XmlHighlighter {
    fn type_id(&self) -> &str {
        "xml"
    }

    fn tokenize(&self, content: &str) -> Vec<SyntaxToken> {
        let bytes = content.as_bytes();
        let len = bytes.len();
        let mut tokens = Vec::new();
        let mut i = 0;

        while i < len {
            if i + 4 <= len && &content[i..i + 4] == "<!--" {
                // Comment
                let start = i;
                i += 4;
                while i + 3 <= len && &content[i..i + 3] != "-->" {
                    i += 1;
                }
                if i + 3 <= len {
                    i += 3;
                } else {
                    i = len;
                }
                tokens.push(SyntaxToken { kind: TokenKind::Comment, start, end: i });
            } else if bytes[i] == b'<' {
                // Tag start
                tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                i += 1;

                // Handle closing tag slash
                if i < len && bytes[i] == b'/' {
                    tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                    i += 1;
                }
                // Handle ? for processing instructions
                if i < len && bytes[i] == b'?' {
                    i += 1;
                }

                // Tag name
                let tag_start = i;
                while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b':' || bytes[i] == b'-' || bytes[i] == b'_' || bytes[i] == b'.') {
                    i += 1;
                }
                if i > tag_start {
                    tokens.push(SyntaxToken { kind: TokenKind::Tag, start: tag_start, end: i });
                }

                // Inside tag: attributes
                while i < len && bytes[i] != b'>' {
                    // Skip whitespace
                    while i < len && bytes[i].is_ascii_whitespace() {
                        i += 1;
                    }
                    if i >= len || bytes[i] == b'>' {
                        break;
                    }

                    // Self-closing or end
                    if bytes[i] == b'/' {
                        tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                        i += 1;
                        continue;
                    }
                    if bytes[i] == b'?' {
                        i += 1;
                        continue;
                    }

                    // = sign
                    if bytes[i] == b'=' {
                        tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                        i += 1;
                        continue;
                    }

                    // Attribute value (quoted)
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

                    // Attribute name
                    let attr_start = i;
                    while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b':' || bytes[i] == b'-' || bytes[i] == b'_') {
                        i += 1;
                    }
                    if i > attr_start {
                        tokens.push(SyntaxToken { kind: TokenKind::Attribute, start: attr_start, end: i });
                    } else {
                        i += 1; // skip unknown char
                    }
                }

                // Closing >
                if i < len && bytes[i] == b'>' {
                    tokens.push(SyntaxToken { kind: TokenKind::Punctuation, start: i, end: i + 1 });
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
        tokens
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xml_tag_and_attributes() {
        let hl = XmlHighlighter;
        let input = r#"<div class="main">hello</div>"#;
        let tokens = hl.tokenize(input);

        let tags: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Tag).collect();
        assert_eq!(tags.len(), 2);
        assert_eq!(&input[tags[0].start..tags[0].end], "div");
        assert_eq!(&input[tags[1].start..tags[1].end], "div");

        let attrs: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Attribute).collect();
        assert_eq!(attrs.len(), 1);
        assert_eq!(&input[attrs[0].start..attrs[0].end], "class");

        let strings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::String).collect();
        assert_eq!(strings.len(), 1);
        assert_eq!(&input[strings[0].start..strings[0].end], "\"main\"");
    }

    #[test]
    fn test_xml_comment() {
        let hl = XmlHighlighter;
        let input = "<!-- this is a comment --><root/>";
        let tokens = hl.tokenize(input);
        let comments: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Comment).collect();
        assert_eq!(comments.len(), 1);
        assert_eq!(&input[comments[0].start..comments[0].end], "<!-- this is a comment -->");
    }

    #[test]
    fn test_xml_self_closing() {
        let hl = XmlHighlighter;
        let input = r#"<br/>"#;
        let tokens = hl.tokenize(input);
        let tags: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Tag).collect();
        assert_eq!(tags.len(), 1);
        assert_eq!(&input[tags[0].start..tags[0].end], "br");
    }

    #[test]
    fn test_xml_tokenize_range() {
        let hl = XmlHighlighter;
        let input = "<a><b>text</b></a>";
        let tokens = hl.tokenize_range(input, 0, 6);
        assert!(tokens.iter().all(|t| t.end <= 6));
    }
}
