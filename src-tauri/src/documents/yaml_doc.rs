use super::{DocumentError, DocumentType, NodeType, ParseResult, TreeNode, ViewMode};
use serde_yaml::Value;

pub struct YamlDocument;

impl YamlDocument {
    fn truncate_value(s: &str, max_len: usize) -> String {
        if s.len() > max_len {
            format!("{}...", &s[..max_len])
        } else {
            s.to_string()
        }
    }

    fn value_to_tree(key: String, value: &Value, path: String) -> TreeNode {
        match value {
            Value::Mapping(map) => {
                let mut children = Vec::new();
                for (k, v) in map {
                    let key_str = match k {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => format!("{:?}", k),
                    };
                    let child_path = if path.is_empty() {
                        key_str.clone()
                    } else {
                        format!("{}.{}", path, key_str)
                    };
                    children.push(Self::value_to_tree(key_str, v, child_path));
                }
                TreeNode {
                    key,
                    value: None,
                    node_type: NodeType::Object,
                    path,
                    start_offset: 0,
                    end_offset: 0,
                    children,
                    expanded: true,
                }
            }
            Value::Sequence(seq) => {
                let mut children = Vec::new();
                for (i, v) in seq.iter().enumerate() {
                    let child_key = format!("[{}]", i);
                    let child_path = format!("{}[{}]", path, i);
                    children.push(Self::value_to_tree(child_key, v, child_path));
                }
                TreeNode {
                    key,
                    value: None,
                    node_type: NodeType::Array,
                    path,
                    start_offset: 0,
                    end_offset: 0,
                    children,
                    expanded: true,
                }
            }
            Value::String(s) => TreeNode {
                key,
                value: Some(Self::truncate_value(s, 50)),
                node_type: NodeType::String,
                path,
                start_offset: 0,
                end_offset: 0,
                children: Vec::new(),
                expanded: false,
            },
            Value::Number(n) => TreeNode {
                key,
                value: Some(n.to_string()),
                node_type: NodeType::Number,
                path,
                start_offset: 0,
                end_offset: 0,
                children: Vec::new(),
                expanded: false,
            },
            Value::Bool(b) => TreeNode {
                key,
                value: Some(b.to_string()),
                node_type: NodeType::Boolean,
                path,
                start_offset: 0,
                end_offset: 0,
                children: Vec::new(),
                expanded: false,
            },
            Value::Null => TreeNode {
                key,
                value: Some("null".to_string()),
                node_type: NodeType::Null,
                path,
                start_offset: 0,
                end_offset: 0,
                children: Vec::new(),
                expanded: false,
            },
            Value::Tagged(tagged) => {
                Self::value_to_tree(key, &tagged.value, path)
            }
        }
    }
}

impl DocumentType for YamlDocument {
    fn type_id(&self) -> &str {
        "yaml"
    }

    fn display_name(&self) -> &str {
        "YAML"
    }

    fn extensions(&self) -> &[&str] {
        &[".yml", ".yaml"]
    }

    fn matches_path(&self, path: &str) -> bool {
        let lower = path.to_lowercase();
        self.extensions().iter().any(|ext| lower.ends_with(ext))
    }

    fn content_score(&self, content: &str) -> u8 {
        let trimmed = content.trim_start();
        // JSON is valid YAML, but JSON-looking content should be classified as JSON.
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            return 0;
        }
        // Check for YAML document start marker
        if trimmed.starts_with("---") {
            return 70;
        }
        // Check for key: value pattern across multiple lines
        let lines: Vec<&str> = content.lines().take(20).collect();
        let kv_count = lines.iter().filter(|line| {
            let l = line.trim();
            !l.is_empty() && !l.starts_with('#') && l.contains(": ")
        }).count();
        if kv_count >= 3 {
            50
        } else {
            0
        }
    }

    fn parse(&self, content: &str) -> ParseResult {
        match serde_yaml::from_str::<Value>(content) {
            Ok(_) => ParseResult::ok(),
            Err(e) => {
                let location = e.location();
                ParseResult::error(
                    e.to_string(),
                    location.as_ref().map(|l| l.line()),
                    location.as_ref().map(|l| l.column()),
                )
            }
        }
    }

    fn build_tree(&self, content: &str) -> Option<Vec<TreeNode>> {
        let value: Value = serde_yaml::from_str(content).ok()?;
        let root = Self::value_to_tree("Root".to_string(), &value, "$".to_string());
        Some(vec![root])
    }

    fn supports_format(&self) -> bool {
        true
    }

    fn supports_compact(&self) -> bool {
        false
    }

    fn format_text(&self, content: &str) -> Result<String, DocumentError> {
        let value: Value = serde_yaml::from_str(content)
            .map_err(|e| DocumentError::ParseError(e.to_string()))?;
        serde_yaml::to_string(&value)
            .map_err(|e| DocumentError::FormatError(e.to_string()))
    }

    fn compact_text(&self, _content: &str) -> Result<String, DocumentError> {
        Err(DocumentError::Unsupported)
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
        let doc = YamlDocument;
        assert!(doc.matches_path("config.yml"));
        assert!(doc.matches_path("docker-compose.yaml"));
        assert!(doc.matches_path("CONFIG.YAML"));
        assert!(!doc.matches_path("file.json"));
        assert!(!doc.matches_path("file.txt"));
    }

    #[test]
    fn test_content_score_with_document_marker() {
        let doc = YamlDocument;
        let content = "---\nname: test\nversion: 1.0\n";
        assert!(doc.content_score(content) >= 70);
    }

    #[test]
    fn test_content_score_with_kv_pattern() {
        let doc = YamlDocument;
        let content = "name: test\nversion: 1.0\nauthor: someone\ndescription: hello\n";
        assert!(doc.content_score(content) >= 50);
    }

    #[test]
    fn test_content_score_no_match() {
        let doc = YamlDocument;
        assert_eq!(doc.content_score("hello world"), 0);
        assert_eq!(doc.content_score("just some text"), 0);
    }

    #[test]
    fn test_parse_valid_simple_map() {
        let doc = YamlDocument;
        let content = "name: test\nversion: 1.0\n";
        let result = doc.parse(content);
        assert!(result.valid);
        assert!(result.error_message.is_none());
    }

    #[test]
    fn test_parse_valid_nested() {
        let doc = YamlDocument;
        let content = "server:\n  host: localhost\n  port: 8080\n";
        let result = doc.parse(content);
        assert!(result.valid);
    }

    #[test]
    fn test_parse_valid_array() {
        let doc = YamlDocument;
        let content = "items:\n  - apple\n  - banana\n  - cherry\n";
        let result = doc.parse(content);
        assert!(result.valid);
    }

    #[test]
    fn test_parse_invalid_yaml() {
        let doc = YamlDocument;
        let content = "key: value\n  bad indent: here\n invalid: yaml";
        let result = doc.parse(content);
        assert!(!result.valid);
        assert!(result.error_message.is_some());
    }

    #[test]
    fn test_format_yaml() {
        let doc = YamlDocument;
        let content = "{name: test, version: 1}";
        let formatted = doc.format_text(content).unwrap();
        assert!(formatted.contains("name:"));
        assert!(formatted.contains("version:"));
    }

    #[test]
    fn test_compact_unsupported() {
        let doc = YamlDocument;
        assert!(doc.compact_text("name: test").is_err());
    }

    #[test]
    fn test_build_tree_simple_map() {
        let doc = YamlDocument;
        let content = "name: hello\ncount: 42\n";
        let tree = doc.build_tree(content).unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].node_type, NodeType::Object);
        assert_eq!(tree[0].children.len(), 2);

        let name_node = &tree[0].children[0];
        assert_eq!(name_node.key, "name");
        assert_eq!(name_node.value, Some("hello".to_string()));
        assert_eq!(name_node.node_type, NodeType::String);

        let count_node = &tree[0].children[1];
        assert_eq!(count_node.key, "count");
        assert_eq!(count_node.node_type, NodeType::Number);
    }

    #[test]
    fn test_build_tree_nested() {
        let doc = YamlDocument;
        let content = "server:\n  host: localhost\n  port: 8080\n";
        let tree = doc.build_tree(content).unwrap();
        assert_eq!(tree[0].node_type, NodeType::Object);

        let server_node = &tree[0].children[0];
        assert_eq!(server_node.key, "server");
        assert_eq!(server_node.node_type, NodeType::Object);
        assert_eq!(server_node.children.len(), 2);
        assert_eq!(server_node.path, "$.server");
    }

    #[test]
    fn test_build_tree_array() {
        let doc = YamlDocument;
        let content = "items:\n  - apple\n  - banana\n";
        let tree = doc.build_tree(content).unwrap();
        let items_node = &tree[0].children[0];
        assert_eq!(items_node.key, "items");
        assert_eq!(items_node.node_type, NodeType::Array);
        assert_eq!(items_node.children.len(), 2);
        assert_eq!(items_node.children[0].key, "[0]");
        assert_eq!(items_node.children[0].value, Some("apple".to_string()));
    }

    #[test]
    fn test_build_tree_truncation() {
        let doc = YamlDocument;
        let long_str = "a".repeat(100);
        let content = format!("key: {}\n", long_str);
        let tree = doc.build_tree(&content).unwrap();
        let child = &tree[0].children[0];
        assert_eq!(child.node_type, NodeType::String);
        let val = child.value.as_ref().unwrap();
        assert!(val.ends_with("..."));
        assert!(val.len() <= 53); // 50 + "..."
    }

    #[test]
    fn test_build_tree_boolean_null() {
        let doc = YamlDocument;
        let content = "enabled: true\nvalue: null\n";
        let tree = doc.build_tree(content).unwrap();
        let enabled = &tree[0].children[0];
        assert_eq!(enabled.node_type, NodeType::Boolean);
        assert_eq!(enabled.value, Some("true".to_string()));

        let null_node = &tree[0].children[1];
        assert_eq!(null_node.node_type, NodeType::Null);
        assert_eq!(null_node.value, Some("null".to_string()));
    }

    #[test]
    fn test_view_mode() {
        let doc = YamlDocument;
        assert_eq!(doc.view_mode(), ViewMode::SplitTree);
    }

    #[test]
    fn test_parse_on_change() {
        let doc = YamlDocument;
        assert!(doc.parse_on_change());
    }
}
