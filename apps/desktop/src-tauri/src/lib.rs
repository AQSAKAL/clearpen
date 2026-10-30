// Clearpen's desktop shell. The app itself is the web build in ../dist; the
// shell adds what a browser can't give it: the library in a SQLite file on
// disk, images in a folder beside it, save dialogs, HTTP to models on this
// machine without CORS, links opened in the browser, and how much memory
// there is for a model. What the window may do with them is listed in
// capabilities/default.json.

use sysinfo::{MemoryRefreshKind, RefreshKind, System};


/// Failing loudly on screen still needs a record when the window is blank:
/// the UI writes startup and render errors here so they can be read afterward.
#[tauri::command]
fn log_error(message: String) {
    let path = std::path::Path::new("/tmp/clearpen-js.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(f, "{message}");
    }
}

/// The computer's memory in bytes, so first-run setup can offer a model that fits.
#[tauri::command]
fn total_memory() -> u64 {
    System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::nothing().with_ram()),
    )
    .total_memory()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![total_memory, log_error])
        .run(tauri::generate_context!())
        .expect("error while running Clearpen");
}

#[cfg(test)]
mod tests {
    #[test]
    fn reports_the_memory_there_is() {
        // Every computer Clearpen runs on has at least a gigabyte.
        assert!(super::total_memory() > 1 << 30);
    }
}
