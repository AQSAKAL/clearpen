// Margin's desktop shell. The app itself is the web build in ../dist; the
// shell adds the two things a browser can't give it: the library in a SQLite
// file on disk, and HTTP to models on this machine without CORS. What the
// window may do with them is listed in capabilities/default.json.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}
