#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Serialize)]
struct OpenFilePayload {
    path: String,
    content: String,
}

#[tauri::command]
fn open_markdown_file() -> Result<Option<OpenFilePayload>, String> {
    let picked = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .pick_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))?;
    Ok(Some(OpenFilePayload {
        path: path.to_string_lossy().into_owned(),
        content,
    }))
}

#[tauri::command]
fn save_markdown_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
fn save_markdown_as(content: String, suggested_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new().add_filter("Markdown", &["md"]);
    dialog = match suggested_path {
        Some(path) => configure_dialog_path(dialog, &path),
        None => dialog.set_file_name("untitled.md"),
    };

    let picked = dialog.save_file();
    let Some(raw_path) = picked else {
        return Ok(None);
    };

    let final_path = enforce_md_extension(raw_path);
    fs::write(&final_path, content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(Some(final_path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("Failed to update window state: {e}"))
}

fn configure_dialog_path(dialog: rfd::FileDialog, path: &str) -> rfd::FileDialog {
    let candidate = PathBuf::from(path);
    let dialog = match candidate.parent() {
        Some(parent) => dialog.set_directory(parent),
        None => dialog,
    };
    match candidate.file_name() {
        Some(file_name) => dialog.set_file_name(file_name.to_string_lossy().as_ref()),
        None => dialog,
    }
}

fn enforce_md_extension(mut path: PathBuf) -> PathBuf {
    let has_md_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false);

    if !has_md_extension {
        path.set_extension("md");
    }
    path
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_markdown_file,
            save_markdown_file,
            save_markdown_as,
            set_always_on_top
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
