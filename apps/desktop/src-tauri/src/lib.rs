// Margin's desktop shell. The app itself is the web build in ../dist; the
// shell adds what a browser can't give it: the library in a SQLite file on
// disk, images in a folder beside it, save dialogs, and HTTP to models on
// this machine without CORS. What the window may do with them is listed in
// capabilities/default.json.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}
