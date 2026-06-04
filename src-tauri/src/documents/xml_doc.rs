use super::{DocumentError, DocumentType, NodeType, ParseResult, TreeNode, ViewMode};
use quick_xml::events::Event;
use quick_xml::Reader;

fn buf_pos_as_usize(reader: &Reader<&[u8]>) -> usize {
    reader.buffer_position() as usize
}

pub struct XmlDocument;

impl XmlDocument {
    fn build_xml_tree(content: &str) -> Option<Vec<TreeNode>> {
        let mut reader = Reader::from_str(content);
        let mut nodes: Vec<TreeNode> = Vec::new();
        let mut stack: Vec<TreeNode> = Vec::new();
        let mut path_stack: Vec<String> = Vec::new();
        let mut buf = Vec::new();

        loop {
            let offset = buf_pos_as_usize(&reader);
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let current_path = if path_stack.is_empty() {
                        format!("/{}", name)
                    } else {
                        format!("{}/{}", path_stack.last().unwrap(), name)
                    };

                    let mut children = Vec::new();

                    // Add attributes as child nodes
                    for attr in e.attributes().flatten() {
                        let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let attr_value = String::from_utf8_lossy(&attr.value).to_string();
                        children.push(TreeNode {
                            key: format!("@{}", attr_name),
                            value: Some(attr_value),
                            node_type: NodeType::Attribute,
                            path: format!("{}/@{}", current_path, attr_name),
                            start_offset: offset,
                            end_offset: offset,
                            children: Vec::new(),
                            expanded: false,
                        });
                    }

                    let node = TreeNode {
                        key: name.clone(),
                        value: None,
                        node_type: NodeType::Element,
                        path: current_path.clone(),
                        start_offset: offset,
                        end_offset: offset,
                        children,
                        expanded: true,
                    };

                    path_stack.push(current_path);
                    stack.push(node);
                }
                Ok(Event::End(_)) => {
                    let end_offset = buf_pos_as_usize(&reader);
                    path_stack.pop();
                    if let Some(mut node) = stack.pop() {
                        node.end_offset = end_offset;
                        if let Some(parent) = stack.last_mut() {
                            parent.children.push(node);
                        } else {
                            nodes.push(node);
                        }
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let current_path = if path_stack.is_empty() {
                        format!("/{}", name)
                    } else {
                        format!("{}/{}", path_stack.last().unwrap(), name)
                    };

                    let mut children = Vec::new();
                    for attr in e.attributes().flatten() {
                        let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let attr_value = String::from_utf8_lossy(&attr.value).to_string();
                        children.push(TreeNode {
                            key: format!("@{}", attr_name),
                            value: Some(attr_value),
                            node_type: NodeType::Attribute,
                            path: format!("{}/@{}", current_path, attr_name),
                            start_offset: offset,
                            end_offset: offset,
                            children: Vec::new(),
                            expanded: false,
                        });
                    }

                    let end_offset = buf_pos_as_usize(&reader);
                    let node = TreeNode {
                        key: name,
                        value: None,
                        node_type: NodeType::Element,
                        path: current_path,
                        start_offset: offset,
                        end_offset,
                        children,
                        expanded: true,
                    };

                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(node);
                    } else {
                        nodes.push(node);
                    }
                }
                Ok(Event::Text(ref e)) => {
                    let text = e.unescape().unwrap_or_default().trim().to_string();
                    if !text.is_empty() {
                        let current_path = path_stack.last().cloned().unwrap_or_default();
                        let text_node = TreeNode {
                            key: "#text".to_string(),
                            value: Some(if text.len() > 50 {
                                format!("{}...", &text[..50])
                            } else {
                                text
                            }),
                            node_type: NodeType::Text,
                            path: format!("{}/text()", current_path),
                            start_offset: offset,
                            end_offset: buf_pos_as_usize(&reader),
                            children: Vec::new(),
                            expanded: false,
                        };
                        if let Some(parent) = stack.last_mut() {
                            parent.children.push(text_node);
                        } else {
                            nodes.push(text_node);
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => return None,
                _ => {}
            }
            buf.clear();
        }

        if nodes.is_empty() {
            None
        } else {
            Some(nodes)
        }
    }

    fn format_xml_content(content: &str, indent_str: &str) -> Result<String, DocumentError> {
        let mut reader = Reader::from_str(content);
        let mut writer = Vec::new();
        let mut buf = Vec::new();
        let mut depth: usize = 0;
        let mut last_was_start = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    if !writer.is_empty() || last_was_start {
                        writer.push(b'\n');
                    }
                    let indent = indent_str.repeat(depth);
                    writer.extend_from_slice(indent.as_bytes());
                    writer.push(b'<');
                    writer.extend_from_slice(e.name().as_ref());
                    for attr in e.attributes().flatten() {
                        writer.push(b' ');
                        writer.extend_from_slice(attr.key.as_ref());
                        writer.extend_from_slice(b"=\"");
                        writer.extend_from_slice(&attr.value);
                        writer.push(b'"');
                    }
                    writer.push(b'>');
                    depth += 1;
                    last_was_start = true;
                }
                Ok(Event::End(ref e)) => {
                    depth = depth.saturating_sub(1);
                    if !last_was_start {
                        writer.push(b'\n');
                        let indent = indent_str.repeat(depth);
                        writer.extend_from_slice(indent.as_bytes());
                    }
                    writer.extend_from_slice(b"</");
                    writer.extend_from_slice(e.name().as_ref());
                    writer.push(b'>');
                    last_was_start = false;
                }
                Ok(Event::Empty(ref e)) => {
                    if !writer.is_empty() {
                        writer.push(b'\n');
                    }
                    let indent = indent_str.repeat(depth);
                    writer.extend_from_slice(indent.as_bytes());
                    writer.push(b'<');
                    writer.extend_from_slice(e.name().as_ref());
                    for attr in e.attributes().flatten() {
                        writer.push(b' ');
                        writer.extend_from_slice(attr.key.as_ref());
                        writer.extend_from_slice(b"=\"");
                        writer.extend_from_slice(&attr.value);
                        writer.push(b'"');
                    }
                    writer.extend_from_slice(b"/>");
                    last_was_start = false;
                }
                Ok(Event::Text(ref e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        writer.extend_from_slice(trimmed.as_bytes());
                    }
                    last_was_start = false;
                }
                Ok(Event::Decl(_)) => {
                    if !writer.is_empty() {
                        writer.push(b'\n');
                    }
                    writer.extend_from_slice(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
                    last_was_start = false;
                }
                Ok(Event::Comment(ref e)) => {
                    if !writer.is_empty() {
                        writer.push(b'\n');
                    }
                    let indent = indent_str.repeat(depth);
                    writer.extend_from_slice(indent.as_bytes());
                    writer.extend_from_slice(b"<!--");
                    writer.extend_from_slice(e.as_ref());
                    writer.extend_from_slice(b"-->");
                    last_was_start = false;
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(DocumentError::FormatError(e.to_string())),
                _ => {}
            }
            buf.clear();
        }

        String::from_utf8(writer).map_err(|e| DocumentError::FormatError(e.to_string()))
    }
}

impl DocumentType for XmlDocument {
    fn type_id(&self) -> &str {
        "xml"
    }

    fn display_name(&self) -> &str {
        "XML"
    }

    fn extensions(&self) -> &[&str] {
        &[".xml", ".xsl", ".xslt", ".svg", ".xhtml", ".plist"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let trimmed = content.trim_start();
        if trimmed.starts_with("<?xml") {
            90
        } else if trimmed.starts_with('<') && !trimmed.starts_with("<!DOCTYPE html") {
            40
        } else {
            0
        }
    }

    fn parse(&self, content: &str) -> ParseResult {
        let mut reader = Reader::from_str(content);
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Eof) => return ParseResult::ok(),
                Err(e) => {
                    let pos = reader.buffer_position() as usize;
                    // Estimate line/col from byte offset
                    let (line, col) = offset_to_line_col(content, pos);
                    return ParseResult::error(e.to_string(), Some(line), Some(col));
                }
                _ => {}
            }
            buf.clear();
        }
    }

    fn build_tree(&self, content: &str) -> Option<Vec<TreeNode>> {
        Self::build_xml_tree(content)
    }

    fn supports_format(&self) -> bool {
        true
    }

    fn supports_compact(&self) -> bool {
        true
    }

    fn format_text(&self, content: &str) -> Result<String, DocumentError> {
        Self::format_xml_content(content, "  ")
    }

    fn compact_text(&self, content: &str) -> Result<String, DocumentError> {
        // Remove whitespace between tags
        let mut reader = Reader::from_str(content);
        let mut writer = Vec::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    writer.push(b'<');
                    writer.extend_from_slice(e.name().as_ref());
                    for attr in e.attributes().flatten() {
                        writer.push(b' ');
                        writer.extend_from_slice(attr.key.as_ref());
                        writer.extend_from_slice(b"=\"");
                        writer.extend_from_slice(&attr.value);
                        writer.push(b'"');
                    }
                    writer.push(b'>');
                }
                Ok(Event::End(ref e)) => {
                    writer.extend_from_slice(b"</");
                    writer.extend_from_slice(e.name().as_ref());
                    writer.push(b'>');
                }
                Ok(Event::Empty(ref e)) => {
                    writer.push(b'<');
                    writer.extend_from_slice(e.name().as_ref());
                    for attr in e.attributes().flatten() {
                        writer.push(b' ');
                        writer.extend_from_slice(attr.key.as_ref());
                        writer.extend_from_slice(b"=\"");
                        writer.extend_from_slice(&attr.value);
                        writer.push(b'"');
                    }
                    writer.extend_from_slice(b"/>");
                }
                Ok(Event::Text(ref e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        writer.extend_from_slice(trimmed.as_bytes());
                    }
                }
                Ok(Event::Decl(_)) => {
                    writer.extend_from_slice(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(DocumentError::FormatError(e.to_string())),
                _ => {}
            }
            buf.clear();
        }

        String::from_utf8(writer).map_err(|e| DocumentError::FormatError(e.to_string()))
    }

    fn view_mode(&self) -> ViewMode {
        ViewMode::SplitTree
    }

    fn parse_on_change(&self) -> bool {
        true
    }
}

fn offset_to_line_col(content: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for (i, ch) in content.chars().enumerate() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_path() {
        let doc = XmlDocument;
        assert!(doc.matches_path("config.xml"));
        assert!(doc.matches_path("style.xsl"));
        assert!(doc.matches_path("image.svg"));
        assert!(!doc.matches_path("file.json"));
    }

    #[test]
    fn test_content_score() {
        let doc = XmlDocument;
        assert!(doc.content_score("<?xml version=\"1.0\"?>") > 50);
        assert!(doc.content_score("<root><child/></root>") > 0);
        assert_eq!(doc.content_score("hello world"), 0);
    }

    #[test]
    fn test_parse_valid_xml() {
        let doc = XmlDocument;
        let result = doc.parse("<root><child>text</child></root>");
        assert!(result.valid);
    }

    #[test]
    fn test_parse_invalid_xml() {
        let doc = XmlDocument;
        let result = doc.parse("<root><child></root>");
        assert!(!result.valid);
        assert!(result.error_message.is_some());
    }

    #[test]
    fn test_format_xml() {
        let doc = XmlDocument;
        let input = "<root><child>text</child><other>val</other></root>";
        let formatted = doc.format_text(input).unwrap();
        assert!(formatted.contains('\n'));
    }

    #[test]
    fn test_compact_xml() {
        let doc = XmlDocument;
        let input = "<root>\n  <child>text</child>\n  <other>val</other>\n</root>";
        let compacted = doc.compact_text(input).unwrap();
        assert!(!compacted.contains('\n'));
    }

    #[test]
    fn test_build_tree() {
        let doc = XmlDocument;
        let input = "<root><child attr=\"val\">text</child></root>";
        let tree = doc.build_tree(input).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].key, "root");
        assert_eq!(tree[0].node_type, NodeType::Element);
        assert!(!tree[0].children.is_empty());
    }

    #[test]
    fn test_view_mode() {
        let doc = XmlDocument;
        assert_eq!(doc.view_mode(), ViewMode::SplitTree);
    }
}
