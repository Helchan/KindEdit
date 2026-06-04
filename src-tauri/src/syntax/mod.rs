pub mod json_hl;
pub mod xml_hl;
pub mod markdown_hl;
pub mod sql_hl;
pub mod java_hl;
pub mod python_hl;
pub mod javascript_hl;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TokenKind {
    Keyword,
    String,
    Number,
    Comment,
    Punctuation,
    Operator,
    Type,
    Function,
    Variable,
    Tag,
    Attribute,
    Property,
    Constant,
    Heading,
    Link,
    CodeBlock,
    ListMarker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyntaxToken {
    pub kind: TokenKind,
    pub start: usize,
    pub end: usize,
}

pub trait SyntaxHighlighter: Send + Sync {
    fn type_id(&self) -> &str;
    fn tokenize(&self, content: &str) -> Vec<SyntaxToken>;
    fn tokenize_range(&self, content: &str, start_byte: usize, end_byte: usize) -> Vec<SyntaxToken> {
        self.tokenize(content)
            .into_iter()
            .filter(|t| t.end > start_byte && t.start < end_byte)
            .map(|t| SyntaxToken {
                kind: t.kind,
                start: t.start.max(start_byte),
                end: t.end.min(end_byte),
            })
            .collect()
    }
}

pub struct SyntaxRegistry {
    highlighters: Vec<Box<dyn SyntaxHighlighter>>,
}

impl SyntaxRegistry {
    pub fn new() -> Self {
        let highlighters: Vec<Box<dyn SyntaxHighlighter>> = vec![
            Box::new(json_hl::JsonHighlighter),
            Box::new(xml_hl::XmlHighlighter),
            Box::new(markdown_hl::MarkdownHighlighter),
            Box::new(sql_hl::SqlHighlighter),
            Box::new(java_hl::JavaHighlighter),
            Box::new(python_hl::PythonHighlighter),
            Box::new(javascript_hl::JavaScriptHighlighter),
        ];
        Self { highlighters }
    }

    pub fn get_by_id(&self, type_id: &str) -> Option<&dyn SyntaxHighlighter> {
        self.highlighters
            .iter()
            .find(|h| h.type_id() == type_id)
            .map(|h| h.as_ref())
    }
}

impl Default for SyntaxRegistry {
    fn default() -> Self {
        Self::new()
    }
}
