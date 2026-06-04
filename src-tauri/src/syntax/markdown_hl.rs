use super::{SyntaxHighlighter, SyntaxToken, TokenKind};

pub struct MarkdownHighlighter;

impl SyntaxHighlighter for MarkdownHighlighter {
    fn type_id(&self) -> &str {
        "markdown"
    }

    fn tokenize(&self, content: &str) -> Vec<SyntaxToken> {
        let mut tokens = Vec::new();
        let mut i = 0;
        let bytes = content.as_bytes();
        let len = bytes.len();
        let mut in_code_block = false;
        let mut code_block_start = 0;

        while i < len {
            // Line start detection
            let line_start = i;

            // Find end of line
            let mut line_end = i;
            while line_end < len && bytes[line_end] != b'\n' {
                line_end += 1;
            }

            let line = &content[line_start..line_end];

            // Code block fences
            if line.trim_start().starts_with("```") {
                if !in_code_block {
                    in_code_block = true;
                    code_block_start = line_start;
                } else {
                    in_code_block = false;
                    let end = if line_end < len { line_end + 1 } else { line_end };
                    tokens.push(SyntaxToken {
                        kind: TokenKind::CodeBlock,
                        start: code_block_start,
                        end,
                    });
                }
                i = if line_end < len { line_end + 1 } else { line_end };
                continue;
            }

            if in_code_block {
                i = if line_end < len { line_end + 1 } else { line_end };
                continue;
            }

            // Heading
            if line.starts_with('#') {
                let mut h_end = 0;
                while h_end < line.len() && line.as_bytes()[h_end] == b'#' {
                    h_end += 1;
                }
                if h_end <= 6 && (h_end >= line.len() || line.as_bytes()[h_end] == b' ') {
                    tokens.push(SyntaxToken {
                        kind: TokenKind::Heading,
                        start: line_start,
                        end: line_end,
                    });
                    i = if line_end < len { line_end + 1 } else { line_end };
                    continue;
                }
            }

            // List markers
            let trimmed = line.trim_start();
            let leading_ws = line.len() - trimmed.len();
            if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                let marker_start = line_start + leading_ws;
                tokens.push(SyntaxToken {
                    kind: TokenKind::ListMarker,
                    start: marker_start,
                    end: marker_start + 2,
                });
            } else if !trimmed.is_empty() && trimmed.as_bytes()[0].is_ascii_digit() {
                // Numbered list: "1. ", "12. "
                let mut d = 0;
                while d < trimmed.len() && trimmed.as_bytes()[d].is_ascii_digit() {
                    d += 1;
                }
                if d < trimmed.len() && d + 2 <= trimmed.len() && &trimmed[d..d + 2] == ". " {
                    let marker_start = line_start + leading_ws;
                    tokens.push(SyntaxToken {
                        kind: TokenKind::ListMarker,
                        start: marker_start,
                        end: marker_start + d + 2,
                    });
                }
            }

            // Inline elements: links and bold/italic
            let mut j = line_start;
            while j < line_end {
                if bytes[j] == b'[' {
                    // Potential link: [text](url)
                    let link_start = j;
                    j += 1;
                    while j < line_end && bytes[j] != b']' {
                        j += 1;
                    }
                    if j < line_end {
                        j += 1; // skip ]
                        if j < line_end && bytes[j] == b'(' {
                            j += 1;
                            while j < line_end && bytes[j] != b')' {
                                j += 1;
                            }
                            if j < line_end {
                                j += 1; // skip )
                                tokens.push(SyntaxToken {
                                    kind: TokenKind::Link,
                                    start: link_start,
                                    end: j,
                                });
                            }
                        }
                    }
                } else if bytes[j] == b'*' && j + 1 < line_end && bytes[j + 1] == b'*' {
                    // Bold **text**
                    let bold_start = j;
                    j += 2;
                    while j + 1 < line_end && !(bytes[j] == b'*' && bytes[j + 1] == b'*') {
                        j += 1;
                    }
                    if j + 1 < line_end {
                        j += 2;
                        tokens.push(SyntaxToken {
                            kind: TokenKind::Keyword,
                            start: bold_start,
                            end: j,
                        });
                    }
                } else if bytes[j] == b'*' && (j + 1 >= line_end || bytes[j + 1] != b'*') {
                    // Italic *text*
                    let italic_start = j;
                    j += 1;
                    while j < line_end && bytes[j] != b'*' {
                        j += 1;
                    }
                    if j < line_end {
                        j += 1;
                        tokens.push(SyntaxToken {
                            kind: TokenKind::Keyword,
                            start: italic_start,
                            end: j,
                        });
                    }
                } else {
                    j += 1;
                }
            }

            i = if line_end < len { line_end + 1 } else { line_end };
        }

        // Handle unclosed code block
        if in_code_block {
            tokens.push(SyntaxToken {
                kind: TokenKind::CodeBlock,
                start: code_block_start,
                end: len,
            });
        }

        tokens
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_md_heading() {
        let hl = MarkdownHighlighter;
        let input = "# Hello\n## World";
        let tokens = hl.tokenize(input);
        let headings: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Heading).collect();
        assert_eq!(headings.len(), 2);
        assert_eq!(&input[headings[0].start..headings[0].end], "# Hello");
        assert_eq!(&input[headings[1].start..headings[1].end], "## World");
    }

    #[test]
    fn test_md_link() {
        let hl = MarkdownHighlighter;
        let input = "Click [here](https://example.com) for more";
        let tokens = hl.tokenize(input);
        let links: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Link).collect();
        assert_eq!(links.len(), 1);
        assert_eq!(&input[links[0].start..links[0].end], "[here](https://example.com)");
    }

    #[test]
    fn test_md_code_block() {
        let hl = MarkdownHighlighter;
        let input = "text\n```rust\nfn main() {}\n```\nmore";
        let tokens = hl.tokenize(input);
        let blocks: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::CodeBlock).collect();
        assert_eq!(blocks.len(), 1);
    }

    #[test]
    fn test_md_list() {
        let hl = MarkdownHighlighter;
        let input = "- item1\n* item2\n1. item3";
        let tokens = hl.tokenize(input);
        let markers: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::ListMarker).collect();
        assert_eq!(markers.len(), 3);
    }

    #[test]
    fn test_md_bold_italic() {
        let hl = MarkdownHighlighter;
        let input = "This is **bold** and *italic*";
        let tokens = hl.tokenize(input);
        let keywords: Vec<_> = tokens.iter().filter(|t| t.kind == TokenKind::Keyword).collect();
        assert_eq!(keywords.len(), 2);
    }

    #[test]
    fn test_md_tokenize_range() {
        let hl = MarkdownHighlighter;
        let input = "# Hello\n## World";
        let tokens = hl.tokenize_range(input, 0, 7);
        assert!(tokens.iter().all(|t| t.end <= 7));
    }
}
