use ropey::Rope;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Write};

/// 5MB - threshold for "large" text
pub const LARGE_TEXT_THRESHOLD: usize = 5 * 1024 * 1024;
/// 20MB - threshold for "huge" files
pub const HUGE_FILE_THRESHOLD: usize = 20 * 1024 * 1024;
/// 500KB - limit for syntax highlighting render
pub const SYNTAX_RENDER_LIMIT: usize = 500 * 1024;
/// 256KB - chunk size for reading/writing large files
pub const CHUNK_SIZE: usize = 256 * 1024;

/// A text buffer backed by a rope data structure for efficient
/// editing of large files.
pub struct TextBuffer {
    rope: Rope,
    file_path: Option<String>,
}

impl TextBuffer {
    /// Create a new empty text buffer.
    pub fn new() -> Self {
        Self {
            rope: Rope::new(),
            file_path: None,
        }
    }

    /// Create a text buffer from a string.
    pub fn from_content(content: &str) -> Self {
        Self {
            rope: Rope::from_str(content),
            file_path: None,
        }
    }

    /// Create a text buffer by reading from a file.
    /// Uses buffered reading for efficient large file handling.
    pub fn from_file(path: &str) -> Result<Self, io::Error> {
        let file = File::open(path)?;
        let reader = BufReader::with_capacity(CHUNK_SIZE, file);
        let rope = Rope::from_reader(reader)
            .map_err(io::Error::other)?;
        Ok(Self {
            rope,
            file_path: Some(path.to_string()),
        })
    }

    /// Get the total byte length of the buffer content.
    pub fn len_bytes(&self) -> usize {
        self.rope.len_bytes()
    }

    /// Get the total character count.
    pub fn len_chars(&self) -> usize {
        self.rope.len_chars()
    }

    /// Get the total number of lines.
    pub fn len_lines(&self) -> usize {
        self.rope.len_lines()
    }

    /// Check if the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.rope.len_bytes() == 0
    }

    /// Check if the content exceeds the large text threshold (5MB).
    pub fn is_large(&self) -> bool {
        self.rope.len_bytes() > LARGE_TEXT_THRESHOLD
    }

    /// Check if the content exceeds the huge file threshold (20MB).
    pub fn is_huge(&self) -> bool {
        self.rope.len_bytes() > HUGE_FILE_THRESHOLD
    }

    /// Get the full text content as a String.
    /// Warning: For large files, this allocates a lot of memory.
    pub fn text(&self) -> String {
        self.rope.to_string()
    }

    /// Get a specific line by index (0-based).
    /// Returns None if the index is out of bounds.
    pub fn line(&self, idx: usize) -> Option<String> {
        if idx >= self.rope.len_lines() {
            return None;
        }
        Some(self.rope.line(idx).to_string())
    }

    /// Get a range of lines [start, end) (0-based).
    pub fn lines_range(&self, start: usize, end: usize) -> Vec<String> {
        let actual_end = end.min(self.rope.len_lines());
        let actual_start = start.min(actual_end);
        (actual_start..actual_end)
            .map(|i| self.rope.line(i).to_string())
            .collect()
    }

    /// Get a byte-range slice of the content.
    pub fn slice(&self, start_byte: usize, end_byte: usize) -> String {
        let len = self.rope.len_bytes();
        let actual_start = start_byte.min(len);
        let actual_end = end_byte.min(len);
        if actual_start >= actual_end {
            return String::new();
        }
        // Convert byte offsets to char offsets for ropey
        let start_char = self.rope.byte_to_char(actual_start);
        let end_char = self.rope.byte_to_char(actual_end);
        self.rope.slice(start_char..end_char).to_string()
    }

    /// Insert text at the given char offset.
    pub fn insert(&mut self, char_offset: usize, text: &str) {
        let offset = char_offset.min(self.rope.len_chars());
        self.rope.insert(offset, text);
    }

    /// Delete characters in the range [start, end) (char offsets).
    pub fn delete(&mut self, start: usize, end: usize) {
        let len = self.rope.len_chars();
        let actual_start = start.min(len);
        let actual_end = end.min(len);
        if actual_start < actual_end {
            self.rope.remove(actual_start..actual_end);
        }
    }

    /// Replace characters in the range [start, end) with new text (char offsets).
    pub fn replace(&mut self, start: usize, end: usize, text: &str) {
        self.delete(start, end);
        let insert_pos = start.min(self.rope.len_chars());
        self.rope.insert(insert_pos, text);
    }

    /// Save the buffer content to a file.
    /// Uses buffered writing with chunks for large files.
    pub fn save_to_file(&self, path: &str) -> Result<(), io::Error> {
        let file = File::create(path)?;
        let mut writer = BufWriter::with_capacity(CHUNK_SIZE, file);

        for chunk in self.rope.chunks() {
            writer.write_all(chunk.as_bytes())?;
        }
        writer.flush()?;
        Ok(())
    }

    /// Get the file path associated with this buffer, if any.
    pub fn file_path(&self) -> Option<&str> {
        self.file_path.as_deref()
    }

    /// Set the file path for this buffer.
    pub fn set_file_path(&mut self, path: Option<String>) {
        self.file_path = path;
    }
}

impl Default for TextBuffer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_new_buffer() {
        let buf = TextBuffer::new();
        assert_eq!(buf.len_bytes(), 0);
        assert_eq!(buf.len_chars(), 0);
        assert!(buf.is_empty());
        assert!(!buf.is_large());
        assert!(!buf.is_huge());
    }

    #[test]
    fn test_from_str() {
        let buf = TextBuffer::from_content("Hello, world!\nSecond line\n");
        assert_eq!(buf.len_lines(), 3); // ropey counts trailing newline as empty line
        assert_eq!(buf.text(), "Hello, world!\nSecond line\n");
        assert!(!buf.is_empty());
    }

    #[test]
    fn test_line_access() {
        let buf = TextBuffer::from_content("Line 1\nLine 2\nLine 3\n");
        assert_eq!(buf.line(0), Some("Line 1\n".to_string()));
        assert_eq!(buf.line(1), Some("Line 2\n".to_string()));
        assert_eq!(buf.line(2), Some("Line 3\n".to_string()));
        assert_eq!(buf.line(10), None);
    }

    #[test]
    fn test_lines_range() {
        let buf = TextBuffer::from_content("A\nB\nC\nD\nE\n");
        let lines = buf.lines_range(1, 4);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "B\n");
        assert_eq!(lines[1], "C\n");
        assert_eq!(lines[2], "D\n");
    }

    #[test]
    fn test_lines_range_bounds() {
        let buf = TextBuffer::from_content("A\nB\n");
        let lines = buf.lines_range(0, 100);
        assert_eq!(lines.len(), buf.len_lines());

        let empty = buf.lines_range(100, 200);
        assert!(empty.is_empty());
    }

    #[test]
    fn test_insert() {
        let mut buf = TextBuffer::from_content("Hello World");
        buf.insert(5, ",");
        assert_eq!(buf.text(), "Hello, World");
    }

    #[test]
    fn test_delete() {
        let mut buf = TextBuffer::from_content("Hello, World");
        buf.delete(5, 7); // Remove ", "
        assert_eq!(buf.text(), "HelloWorld");
    }

    #[test]
    fn test_replace() {
        let mut buf = TextBuffer::from_content("Hello, World");
        buf.replace(7, 12, "Rust");
        assert_eq!(buf.text(), "Hello, Rust");
    }

    #[test]
    fn test_save_and_load_file() {
        let temp_path = std::env::temp_dir()
            .join("kindedit_test_rope.txt");
        let path_str = temp_path.to_str().unwrap();

        let buf = TextBuffer::from_content("Test content\nLine 2\n");
        buf.save_to_file(path_str).unwrap();

        let loaded = TextBuffer::from_file(path_str).unwrap();
        assert_eq!(loaded.text(), "Test content\nLine 2\n");
        assert_eq!(loaded.file_path(), Some(path_str));

        let _ = fs::remove_file(&temp_path);
    }

    #[test]
    fn test_size_thresholds() {
        assert_eq!(LARGE_TEXT_THRESHOLD, 5 * 1024 * 1024);
        assert_eq!(HUGE_FILE_THRESHOLD, 20 * 1024 * 1024);
        assert_eq!(SYNTAX_RENDER_LIMIT, 500 * 1024);
        assert_eq!(CHUNK_SIZE, 256 * 1024);
    }

    #[test]
    fn test_slice() {
        let buf = TextBuffer::from_content("Hello, World!");
        // "Hello" is 5 bytes
        let s = buf.slice(0, 5);
        assert_eq!(s, "Hello");
    }

    #[test]
    fn test_empty_operations() {
        let mut buf = TextBuffer::new();
        assert_eq!(buf.text(), "");
        buf.insert(0, "abc");
        assert_eq!(buf.text(), "abc");
        buf.delete(0, 3);
        assert_eq!(buf.text(), "");
    }

    #[test]
    fn test_is_large_is_huge() {
        // Small content
        let buf = TextBuffer::from_content("small");
        assert!(!buf.is_large());
        assert!(!buf.is_huge());
    }
}
