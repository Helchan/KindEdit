use super::{DocumentError, DocumentType, NodeType, ParseResult, TreeNode, ViewMode};
use serde_json::Value;

pub struct JsonDocument;

impl JsonDocument {
    fn truncate_value(s: &str, max_len: usize) -> String {
        if s.len() > max_len {
            format!("{}...", &s[..max_len])
        } else {
            s.to_string()
        }
    }

    fn value_to_tree(key: String, value: &Value, path: String, content: &str, search_start: usize) -> TreeNode {
        let (start_offset, end_offset) = Self::find_value_offsets(content, &key, &path, search_start);

        match value {
            Value::Object(map) => {
                let mut children = Vec::new();
                let mut child_search = start_offset + 1;
                for (k, v) in map {
                    let child_path = if path.is_empty() {
                        format!("$.{}", k)
                    } else {
                        format!("{}.{}", path, k)
                    };
                    let child = Self::value_to_tree(k.clone(), v, child_path, content, child_search);
                    child_search = child.end_offset;
                    children.push(child);
                }
                TreeNode {
                    key,
                    value: None,
                    node_type: NodeType::Object,
                    path,
                    start_offset,
                    end_offset,
                    children,
                    expanded: true,
                }
            }
            Value::Array(arr) => {
                let mut children = Vec::new();
                let mut child_search = start_offset + 1;
                for (i, v) in arr.iter().enumerate() {
                    let child_path = format!("{}[{}]", path, i);
                    let child_key = format!("[{}]", i);
                    let child = Self::value_to_tree(child_key, v, child_path, content, child_search);
                    child_search = child.end_offset;
                    children.push(child);
                }
                TreeNode {
                    key,
                    value: None,
                    node_type: NodeType::Array,
                    path,
                    start_offset,
                    end_offset,
                    children,
                    expanded: true,
                }
            }
            Value::String(s) => TreeNode {
                key,
                value: Some(Self::truncate_value(s, 50)),
                node_type: NodeType::String,
                path,
                start_offset,
                end_offset,
                children: Vec::new(),
                expanded: false,
            },
            Value::Number(n) => TreeNode {
                key,
                value: Some(n.to_string()),
                node_type: NodeType::Number,
                path,
                start_offset,
                end_offset,
                children: Vec::new(),
                expanded: false,
            },
            Value::Bool(b) => TreeNode {
                key,
                value: Some(b.to_string()),
                node_type: NodeType::Boolean,
                path,
                start_offset,
                end_offset,
                children: Vec::new(),
                expanded: false,
            },
            Value::Null => TreeNode {
                key,
                value: Some("null".to_string()),
                node_type: NodeType::Null,
                path,
                start_offset,
                end_offset,
                children: Vec::new(),
                expanded: false,
            },
        }
    }

    fn find_value_offsets(content: &str, key: &str, path: &str, search_start: usize) -> (usize, usize) {
        let bytes = content.as_bytes();
        let len = bytes.len();
        let start = search_start.min(len);

        // For root path, find the first { or [
        if path == "$" {
            for i in start..len {
                if bytes[i] == b'{' || bytes[i] == b'[' {
                    let end = Self::find_matching_end(bytes, i);
                    return (i, end);
                }
            }
            return (0, len);
        }

        // For object keys, find "key": value
        if !key.starts_with('[') {
            let search_key = format!("\"{}\"", key);
            if let Some(pos) = content[start..].find(&search_key) {
                let abs_pos = start + pos;
                // Find the colon after the key
                let after_key = abs_pos + search_key.len();
                for i in after_key..len {
                    if bytes[i] == b':' {
                        // Find start of value
                        for j in (i + 1)..len {
                            if !bytes[j].is_ascii_whitespace() {
                                let end = Self::find_value_end(bytes, j);
                                return (abs_pos, end);
                            }
                        }
                        break;
                    }
                }
                return (abs_pos, abs_pos + search_key.len());
            }
        } else {
            // Array element - find next value from search_start
            for i in start..len {
                if !bytes[i].is_ascii_whitespace() && bytes[i] != b',' && bytes[i] != b'[' {
                    let end = Self::find_value_end(bytes, i);
                    return (i, end);
                }
            }
        }

        (start, start)
    }

    fn find_value_end(bytes: &[u8], start: usize) -> usize {
        if start >= bytes.len() {
            return start;
        }
        match bytes[start] {
            b'{' | b'[' => Self::find_matching_end(bytes, start),
            b'"' => {
                let mut i = start + 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' {
                        i += 2;
                    } else if bytes[i] == b'"' {
                        return i + 1;
                    } else {
                        i += 1;
                    }
                }
                bytes.len()
            }
            _ => {
                // number, bool, null
                let mut i = start;
                while i < bytes.len() && !matches!(bytes[i], b',' | b'}' | b']' | b'\n' | b'\r' | b' ' | b'\t') {
                    i += 1;
                }
                i
            }
        }
    }

    fn find_matching_end(bytes: &[u8], start: usize) -> usize {
        let open = bytes[start];
        let close = if open == b'{' { b'}' } else { b']' };
        let mut depth = 0;
        let mut in_string = false;
        let mut i = start;
        while i < bytes.len() {
            if in_string {
                if bytes[i] == b'\\' {
                    i += 1;
                } else if bytes[i] == b'"' {
                    in_string = false;
                }
            } else {
                match bytes[i] {
                    b'"' => in_string = true,
                    b if b == open => depth += 1,
                    b if b == close => {
                        depth -= 1;
                        if depth == 0 {
                            return i + 1;
                        }
                    }
                    _ => {}
                }
            }
            i += 1;
        }
        bytes.len()
    }
}

impl DocumentType for JsonDocument {
    fn type_id(&self) -> &str {
        "json"
    }

    fn display_name(&self) -> &str {
        "JSON"
    }

    fn extensions(&self) -> &[&str] {
        &[".json", ".jsonc"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let trimmed = content.trim_start();
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            // Validate it's actually JSON
            if serde_json::from_str::<Value>(content).is_ok() {
                80
            } else {
                30
            }
        } else {
            0
        }
    }

    fn parse(&self, content: &str) -> ParseResult {
        match serde_json::from_str::<Value>(content) {
            Ok(_) => ParseResult::ok(),
            Err(e) => ParseResult::error(
                e.to_string(),
                Some(e.line()),
                Some(e.column()),
            ),
        }
    }

    fn build_tree(&self, content: &str) -> Option<Vec<TreeNode>> {
        let value: Value = serde_json::from_str(content).ok()?;
        let root = Self::value_to_tree("Root".to_string(), &value, "$".to_string(), content, 0);
        Some(vec![root])
    }

    fn supports_format(&self) -> bool {
        true
    }

    fn supports_compact(&self) -> bool {
        true
    }

    fn format_text(&self, content: &str) -> Result<String, DocumentError> {
        let value: Value = serde_json::from_str(content)
            .map_err(|e| DocumentError::ParseError(e.to_string()))?;
        serde_json::to_string_pretty(&value)
            .map_err(|e| DocumentError::FormatError(e.to_string()))
    }

    fn compact_text(&self, content: &str) -> Result<String, DocumentError> {
        let value: Value = serde_json::from_str(content)
            .map_err(|e| DocumentError::ParseError(e.to_string()))?;
        serde_json::to_string(&value)
            .map_err(|e| DocumentError::FormatError(e.to_string()))
    }

    fn view_mode(&self) -> ViewMode {
        ViewMode::SplitTree
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
        let doc = JsonDocument;
        assert!(doc.matches_path("config.json"));
        assert!(doc.matches_path("tsconfig.jsonc"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score() {
        let doc = JsonDocument;
        assert!(doc.content_score("{\"key\": \"value\"}") > 50);
        assert!(doc.content_score("[1, 2, 3]") > 50);
        assert_eq!(doc.content_score("hello world"), 0);
    }

    #[test]
    fn test_parse_valid_json() {
        let doc = JsonDocument;
        let result = doc.parse("{\"name\": \"test\", \"value\": 42}");
        assert!(result.valid);
        assert!(result.error_message.is_none());
    }

    #[test]
    fn test_parse_invalid_json() {
        let doc = JsonDocument;
        let result = doc.parse("{invalid json}");
        assert!(!result.valid);
        assert!(result.error_message.is_some());
        assert!(result.error_line.is_some());
    }

    #[test]
    fn test_format_json() {
        let doc = JsonDocument;
        let input = "{\"a\":1,\"b\":2}";
        let formatted = doc.format_text(input).unwrap();
        assert!(formatted.contains('\n'));
        assert!(formatted.contains("  "));
    }

    #[test]
    fn test_compact_json() {
        let doc = JsonDocument;
        let input = "{\n  \"a\": 1,\n  \"b\": 2\n}";
        let compacted = doc.compact_text(input).unwrap();
        assert!(!compacted.contains('\n'));
        assert!(compacted.contains("\"a\":1") || compacted.contains("\"a\": 1") || compacted.contains("\"a\":"));
    }

    #[test]
    fn test_build_tree_object() {
        let doc = JsonDocument;
        let input = "{\"name\": \"hello\", \"count\": 42}";
        let tree = doc.build_tree(input).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].node_type, NodeType::Object);
        assert_eq!(tree[0].children.len(), 2);
    }

    #[test]
    fn test_build_tree_array() {
        let doc = JsonDocument;
        let input = "[1, 2, 3]";
        let tree = doc.build_tree(input).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].node_type, NodeType::Array);
        assert_eq!(tree[0].children.len(), 3);
    }

    #[test]
    fn test_build_tree_truncation() {
        let doc = JsonDocument;
        let long_str = "a".repeat(100);
        let input = format!("{{\"key\": \"{}\"}}", long_str);
        let tree = doc.build_tree(&input).unwrap();
        let child = &tree[0].children[0];
        assert_eq!(child.node_type, NodeType::String);
        let val = child.value.as_ref().unwrap();
        assert!(val.ends_with("..."));
        assert!(val.len() <= 54); // 50 + "..."
    }

    #[test]
    fn test_view_mode() {
        let doc = JsonDocument;
        assert_eq!(doc.view_mode(), ViewMode::SplitTree);
    }
}
