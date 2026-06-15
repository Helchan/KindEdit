use std::collections::HashMap;
use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use lopdf::{dictionary, Dictionary, Document, LoadOptions, Object, ObjectId, StringFormat};
use serde::{Deserialize, Serialize};

const PASSWORD_REQUIRED: &str = "PDF_PASSWORD_REQUIRED";
const PASSWORD_INVALID: &str = "PDF_PASSWORD_INVALID";
const KIND_EDIT_ANNOT_PREFIX: &str = "KindEdit:";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotation {
    pub id: String,
    pub page_number: u32,
    pub annotation_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: String,
    pub opacity: f64,
    pub line_width: f64,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub points: Vec<PdfPoint>,
    #[serde(default)]
    pub fabric_json: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOutlineNode {
    pub id: String,
    pub title: String,
    pub page_number: u32,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub children: Vec<PdfOutlineNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOpenResult {
    pub data_base64: String,
    pub page_count: usize,
    pub encrypted: bool,
    pub annotations: Vec<PdfAnnotation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSaveResult {
    pub page_count: usize,
    pub annotations: Vec<PdfAnnotation>,
}

#[tauri::command]
pub async fn open_pdf_file(
    path: String,
    password: Option<String>,
) -> Result<PdfOpenResult, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let document = load_pdf_document(&bytes, password.as_deref())?;
    let encrypted = document.was_encrypted() || document.is_encrypted();
    let page_count = document.get_pages().len();
    let annotations = read_kindedit_annotations(&document);

    Ok(PdfOpenResult {
        data_base64: STANDARD.encode(bytes),
        page_count,
        encrypted,
        annotations,
    })
}

#[tauri::command]
pub async fn save_pdf_file(
    path: String,
    password: Option<String>,
    outline: Vec<PdfOutlineNode>,
    annotations: Vec<PdfAnnotation>,
) -> Result<PdfSaveResult, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mut document = load_pdf_document(&bytes, password.as_deref())?;
    replace_outline(&mut document, &outline)?;
    replace_kindedit_annotations(&mut document, &annotations)?;

    if let Some(encryption_state) = document.encryption_state.clone() {
        document.encrypt(&encryption_state).map_err(|e| e.to_string())?;
    }

    document.save(&path).map_err(|e| e.to_string())?;

    let saved = fs::read(&path).map_err(|e| e.to_string())?;
    let saved_document = load_pdf_document(&saved, password.as_deref())?;
    let saved_annotations = read_kindedit_annotations(&saved_document);

    Ok(PdfSaveResult {
        page_count: saved_document.get_pages().len(),
        annotations: saved_annotations,
    })
}

fn load_pdf_document(bytes: &[u8], password: Option<&str>) -> Result<Document, String> {
    match password {
        Some(password) => Document::load_mem_with_options(bytes, LoadOptions::with_password(password))
            .map_err(|_| format!("{PASSWORD_INVALID}: 密码错误或 PDF 无法解密")),
        None => match Document::load_mem(bytes) {
            Ok(document) => {
                if document.is_encrypted() {
                    Err(format!("{PASSWORD_REQUIRED}: 需要输入 PDF 密码"))
                } else {
                    Ok(document)
                }
            }
            Err(err) => {
                let message = err.to_string();
                if message.to_lowercase().contains("password")
                    || message.to_lowercase().contains("encrypt")
                {
                    Err(format!("{PASSWORD_REQUIRED}: 需要输入 PDF 密码"))
                } else {
                    Err(message)
                }
            }
        },
    }
}

fn replace_outline(document: &mut Document, outline: &[PdfOutlineNode]) -> Result<(), String> {
    if outline.is_empty() {
        if let Ok(catalog) = document.catalog_mut() {
            catalog.remove(b"Outlines");
        }
        return Ok(());
    }

    let pages = document.get_pages();
    let root_id = document.new_object_id();
    let mut objects = Vec::new();
    let built = build_outline_level(document, outline, root_id, &pages)?;

    let mut root = dictionary! {
        "Type" => "Outlines",
        "Count" => built.count as i64,
    };
    if let Some(first) = built.first {
        root.set("First", Object::Reference(first));
    }
    if let Some(last) = built.last {
        root.set("Last", Object::Reference(last));
    }

    objects.push((root_id, root));
    objects.extend(built.objects);
    for (id, dictionary) in objects {
        document.objects.insert(id, Object::Dictionary(dictionary));
    }

    let catalog = document.catalog_mut().map_err(|e| e.to_string())?;
    catalog.set("Outlines", Object::Reference(root_id));
    catalog.set("PageMode", Object::Name(b"UseOutlines".to_vec()));

    Ok(())
}

struct BuiltOutlineLevel {
    first: Option<ObjectId>,
    last: Option<ObjectId>,
    count: usize,
    objects: Vec<(ObjectId, Dictionary)>,
}

fn build_outline_level(
    document: &mut Document,
    nodes: &[PdfOutlineNode],
    parent_id: ObjectId,
    pages: &std::collections::BTreeMap<u32, ObjectId>,
) -> Result<BuiltOutlineLevel, String> {
    let mut ids = Vec::with_capacity(nodes.len());
    for _ in nodes {
        ids.push(document.new_object_id());
    }

    let mut objects = Vec::new();
    let mut total_count = 0usize;

    for (index, node) in nodes.iter().enumerate() {
        let id = ids[index];
        let page_id = pages
            .get(&node.page_number)
            .or_else(|| pages.iter().next().map(|(_, id)| id))
            .ok_or_else(|| "PDF has no pages".to_string())?;

        let mut item = dictionary! {
            "Title" => pdf_text_string(&node.title),
            "Parent" => Object::Reference(parent_id),
            "Dest" => Object::Array(vec![
                Object::Reference(*page_id),
                Object::Name(b"XYZ".to_vec()),
                nullable_real(node.x),
                nullable_real(node.y),
                Object::Null,
            ]),
        };

        if index > 0 {
            item.set("Prev", Object::Reference(ids[index - 1]));
        }
        if index + 1 < ids.len() {
            item.set("Next", Object::Reference(ids[index + 1]));
        }

        let child_level = if node.children.is_empty() {
            None
        } else {
            Some(build_outline_level(document, &node.children, id, pages)?)
        };

        if let Some(child_level) = child_level {
            if let Some(first) = child_level.first {
                item.set("First", Object::Reference(first));
            }
            if let Some(last) = child_level.last {
                item.set("Last", Object::Reference(last));
            }
            item.set("Count", child_level.count as i64);
            total_count += child_level.count;
            objects.extend(child_level.objects);
        }

        total_count += 1;
        objects.push((id, item));
    }

    Ok(BuiltOutlineLevel {
        first: ids.first().copied(),
        last: ids.last().copied(),
        count: total_count,
        objects,
    })
}

fn nullable_real(value: Option<f64>) -> Object {
    value.map_or(Object::Null, real)
}

fn real(value: f64) -> Object {
    Object::Real(value as f32)
}

fn pdf_text_string(value: &str) -> Object {
    let mut bytes = vec![0xfe, 0xff];
    for unit in value.encode_utf16() {
        bytes.push((unit >> 8) as u8);
        bytes.push((unit & 0xff) as u8);
    }
    Object::String(bytes, StringFormat::Hexadecimal)
}

fn replace_kindedit_annotations(
    document: &mut Document,
    annotations: &[PdfAnnotation],
) -> Result<(), String> {
    remove_existing_kindedit_annotations(document);

    let pages = document.get_pages();
    for annotation in annotations {
        let Some(page_id) = pages.get(&annotation.page_number).copied() else {
            continue;
        };
        let Some(annotation_object) = build_annotation_object(document, annotation) else {
            continue;
        };
        let annotation_id = document.add_object(annotation_object);
        append_annotation_to_page(document, page_id, annotation_id)?;
    }

    Ok(())
}

fn remove_existing_kindedit_annotations(document: &mut Document) {
    let pages: Vec<ObjectId> = document.get_pages().values().copied().collect();
    let mut annotation_ids_to_remove = Vec::new();

    for page_id in pages {
        let annotation_ids = collect_page_annotation_ids(document, page_id);
        let filtered: Vec<Object> = annotation_ids
            .into_iter()
            .filter_map(|annotation_id| {
                if is_kindedit_annotation(document, annotation_id) {
                    annotation_ids_to_remove.push(annotation_id);
                    None
                } else {
                    Some(Object::Reference(annotation_id))
                }
            })
            .collect();
        set_page_annotations(document, page_id, filtered);
    }

    for annotation_id in annotation_ids_to_remove {
        let _ = document.remove_annot(&annotation_id);
        document.objects.remove(&annotation_id);
    }
}

fn collect_page_annotation_ids(document: &Document, page_id: ObjectId) -> Vec<ObjectId> {
    let Ok(page) = document.get_object(page_id) else {
        return Vec::new();
    };
    let Ok(page_dict) = page.as_dict() else {
        return Vec::new();
    };
    let Ok(annots) = page_dict.get(b"Annots") else {
        return Vec::new();
    };

    match annots {
        Object::Array(items) => items.iter().filter_map(object_reference).collect(),
        Object::Reference(id) => {
            let Ok(array_object) = document.get_object(*id) else {
                return Vec::new();
            };
            let Ok(items) = array_object.as_array() else {
                return Vec::new();
            };
            items.iter().filter_map(object_reference).collect()
        }
        _ => Vec::new(),
    }
}

fn set_page_annotations(document: &mut Document, page_id: ObjectId, annotations: Vec<Object>) {
    if let Ok(page) = document.get_object_mut(page_id) {
        if let Ok(page_dict) = page.as_dict_mut() {
            if annotations.is_empty() {
                page_dict.remove(b"Annots");
            } else {
                page_dict.set("Annots", Object::Array(annotations));
            }
        }
    }
}

fn is_kindedit_annotation(document: &Document, annotation_id: ObjectId) -> bool {
    let Ok(annotation) = document.get_object(annotation_id) else {
        return false;
    };
    let Ok(annotation_dict) = annotation.as_dict() else {
        return false;
    };
    dictionary_text(annotation_dict, b"NM")
        .is_some_and(|name| name.starts_with(KIND_EDIT_ANNOT_PREFIX))
}

fn append_annotation_to_page(
    document: &mut Document,
    page_id: ObjectId,
    annotation_id: ObjectId,
) -> Result<(), String> {
    let mut annotations = collect_page_annotation_ids(document, page_id)
        .into_iter()
        .map(Object::Reference)
        .collect::<Vec<_>>();
    annotations.push(Object::Reference(annotation_id));
    set_page_annotations(document, page_id, annotations);
    Ok(())
}

fn build_annotation_object(
    document: &Document,
    annotation: &PdfAnnotation,
) -> Option<Dictionary> {
    let page_height = page_height(document, annotation.page_number).unwrap_or(0.0);
    let rect = annotation_rect(annotation, page_height);
    let color = color_array(&annotation.color);
    let id = format!("{KIND_EDIT_ANNOT_PREFIX}{}", annotation.id);
    let contents = annotation.text.clone().unwrap_or_default();

    let subtype = match annotation.annotation_type.as_str() {
        "ink" => b"Ink".to_vec(),
        "highlight" => b"Highlight".to_vec(),
        "rect" => b"Square".to_vec(),
        "note" => b"Text".to_vec(),
        _ => return None,
    };

    let mut dictionary = dictionary! {
        "Type" => "Annot",
        "Subtype" => Object::Name(subtype.clone()),
        "Rect" => rect,
        "C" => color,
        "NM" => pdf_text_string(&id),
        "T" => pdf_text_string("KindEdit"),
        "Contents" => pdf_text_string(&contents),
    };

    match subtype.as_slice() {
        b"Ink" => {
            let path = if annotation.points.is_empty() {
                vec![
                    real(annotation.x),
                    real(page_height - annotation.y),
                    real(annotation.x + annotation.width),
                    real(page_height - annotation.y - annotation.height),
                ]
            } else {
                annotation
                    .points
                    .iter()
                    .flat_map(|point| vec![real(point.x), real(page_height - point.y)])
                    .collect()
            };
            dictionary.set("InkList", Object::Array(vec![Object::Array(path)]));
            dictionary.set("Border", Object::Array(vec![0.into(), 0.into(), real(annotation.line_width)]));
            dictionary.set("CA", real(annotation.opacity));
        }
        b"Highlight" => {
            let left = annotation.x;
            let right = annotation.x + annotation.width;
            let top = page_height - annotation.y;
            let bottom = page_height - annotation.y - annotation.height;
            dictionary.set(
                "QuadPoints",
                Object::Array(vec![
                    real(left),
                    real(top),
                    real(right),
                    real(top),
                    real(left),
                    real(bottom),
                    real(right),
                    real(bottom),
                ]),
            );
            dictionary.set("CA", real(annotation.opacity));
        }
        b"Square" => {
            dictionary.set("Border", Object::Array(vec![0.into(), 0.into(), real(annotation.line_width)]));
            dictionary.set("CA", real(annotation.opacity));
        }
        b"Text" => {
            dictionary.set("Name", Object::Name(b"Comment".to_vec()));
            dictionary.set("Open", Object::Boolean(false));
        }
        _ => {}
    }

    Some(dictionary)
}

fn read_kindedit_annotations(document: &Document) -> Vec<PdfAnnotation> {
    let pages = document.get_pages();
    let reverse_pages: HashMap<ObjectId, u32> = pages.iter().map(|(page, id)| (*id, *page)).collect();
    let mut annotations = Vec::new();

    for (page_number, page_id) in pages {
        let page_height = page_height_by_id(document, page_id).unwrap_or(0.0);
        for annotation_id in collect_page_annotation_ids(document, page_id) {
            let Ok(annotation) = document.get_object(annotation_id) else {
                continue;
            };
            let Ok(annotation_dict) = annotation.as_dict() else {
                continue;
            };
            let Some(name) = dictionary_text(annotation_dict, b"NM") else {
                continue;
            };
            if !name.starts_with(KIND_EDIT_ANNOT_PREFIX) {
                continue;
            }
            let annotation_type = dictionary_name(annotation_dict, b"Subtype")
                .and_then(|name| match name.as_str() {
                    "Ink" => Some("ink"),
                    "Highlight" => Some("highlight"),
                    "Square" => Some("rect"),
                    "Text" => Some("note"),
                    _ => None,
                })
                .unwrap_or("rect")
                .to_string();

            let (x, y, width, height) = read_annotation_rect(annotation_dict, page_height)
                .unwrap_or((0.0, 0.0, 0.0, 0.0));
            let color = read_color(annotation_dict).unwrap_or_else(|| "#f4c542".to_string());
            let text = dictionary_text(annotation_dict, b"Contents").filter(|text| !text.is_empty());
            let points = if annotation_type == "ink" {
                read_ink_points(annotation_dict, page_height)
            } else {
                Vec::new()
            };

            annotations.push(PdfAnnotation {
                id: name.trim_start_matches(KIND_EDIT_ANNOT_PREFIX).to_string(),
                page_number: reverse_pages.get(&page_id).copied().unwrap_or(page_number),
                annotation_type,
                x,
                y,
                width,
                height,
                color,
                opacity: 0.45,
                line_width: 2.0,
                text,
                points,
                fabric_json: None,
            });
        }
    }

    annotations
}

fn annotation_rect(annotation: &PdfAnnotation, page_height: f64) -> Object {
    let left = annotation.x;
    let right = annotation.x + annotation.width;
    let top = page_height - annotation.y;
    let bottom = page_height - annotation.y - annotation.height;
    Object::Array(vec![real(left), real(bottom), real(right), real(top)])
}

fn read_annotation_rect(dictionary: &Dictionary, page_height: f64) -> Option<(f64, f64, f64, f64)> {
    let rect = dictionary.get(b"Rect").ok()?.as_array().ok()?;
    if rect.len() != 4 {
        return None;
    }
    let left = object_number(&rect[0])?;
    let bottom = object_number(&rect[1])?;
    let right = object_number(&rect[2])?;
    let top = object_number(&rect[3])?;
    Some((left, page_height - top, right - left, top - bottom))
}

fn read_ink_points(dictionary: &Dictionary, page_height: f64) -> Vec<PdfPoint> {
    let Ok(ink_list) = dictionary.get(b"InkList").and_then(Object::as_array) else {
        return Vec::new();
    };
    let Some(first_path) = ink_list.first().and_then(|item| item.as_array().ok()) else {
        return Vec::new();
    };

    first_path
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() != 2 {
                return None;
            }
            let x = object_number(&chunk[0])?;
            let y = object_number(&chunk[1])?;
            Some(PdfPoint {
                x,
                y: page_height - y,
            })
        })
        .collect()
}

fn page_height(document: &Document, page_number: u32) -> Option<f64> {
    let pages = document.get_pages();
    let page_id = pages.get(&page_number)?;
    page_height_by_id(document, *page_id)
}

fn page_height_by_id(document: &Document, page_id: ObjectId) -> Option<f64> {
    let page = document.get_object(page_id).ok()?;
    let dictionary = page.as_dict().ok()?;
    let media_box = dictionary.get(b"MediaBox").ok()?.as_array().ok()?;
    if media_box.len() != 4 {
        return None;
    }
    let bottom = object_number(&media_box[1])?;
    let top = object_number(&media_box[3])?;
    Some(top - bottom)
}

fn color_array(color: &str) -> Object {
    let (r, g, b) = parse_hex_color(color).unwrap_or((244, 197, 66));
    Object::Array(vec![
        real(r as f64 / 255.0),
        real(g as f64 / 255.0),
        real(b as f64 / 255.0),
    ])
}

fn read_color(dictionary: &Dictionary) -> Option<String> {
    let color = dictionary.get(b"C").ok()?.as_array().ok()?;
    if color.len() < 3 {
        return None;
    }
    let r = (object_number(&color[0])? * 255.0).round().clamp(0.0, 255.0) as u8;
    let g = (object_number(&color[1])? * 255.0).round().clamp(0.0, 255.0) as u8;
    let b = (object_number(&color[2])? * 255.0).round().clamp(0.0, 255.0) as u8;
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}

fn parse_hex_color(color: &str) -> Option<(u8, u8, u8)> {
    let color = color.strip_prefix('#').unwrap_or(color);
    if color.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&color[0..2], 16).ok()?;
    let g = u8::from_str_radix(&color[2..4], 16).ok()?;
    let b = u8::from_str_radix(&color[4..6], 16).ok()?;
    Some((r, g, b))
}

fn object_reference(object: &Object) -> Option<ObjectId> {
    match object {
        Object::Reference(id) => Some(*id),
        _ => None,
    }
}

fn object_number(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some(*value as f64),
        _ => None,
    }
}

fn dictionary_name(dictionary: &Dictionary, key: &[u8]) -> Option<String> {
    match dictionary.get(key).ok()? {
        Object::Name(name) => Some(String::from_utf8_lossy(name).to_string()),
        _ => None,
    }
}

fn dictionary_text(dictionary: &Dictionary, key: &[u8]) -> Option<String> {
    match dictionary.get(key).ok()? {
        Object::String(bytes, _) => decode_pdf_text(bytes),
        _ => None,
    }
}

fn decode_pdf_text(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(&[0xfe, 0xff]) {
        let units = bytes[2..]
            .chunks(2)
            .filter_map(|chunk| {
                if chunk.len() == 2 {
                    Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        String::from_utf16(&units).ok()
    } else {
        Some(String::from_utf8_lossy(bytes).to_string())
    }
}
