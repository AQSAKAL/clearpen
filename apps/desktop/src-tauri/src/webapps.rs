// Telegram, WhatsApp, X, Google and Wikipedia in the window, without iframes. Each is its own
// child webview — a real browser engine, with its own cookies and storage — laid
// over the part of the page the interface leaves free. Sites that refuse to be
// framed (Google, GitHub, most logins) work here.
//
// The webview is created the first time its tab is opened and then kept alive
// while Clearpen runs, so a chat stays logged in and scrolled where it was. The
// profile lives under the app's data folder, so cookies survive a restart too.
//
// Nothing from these pages can reach Tauri: they are external origins, with no
// IPC and no capabilities. Only http and https load.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl,
    webview::{NewWindowResponse, PageLoadEvent},
};
use tauri_plugin_opener::OpenerExt;

use crate::events;

/// The rectangle the web app may cover, in CSS pixels relative to the window.
#[derive(Clone, Copy, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Sent to the window when a page loads, so the address bar can follow links.
#[derive(Clone, Serialize)]
struct WebAppNavigation {
    label: String,
    url: String,
}

/// Only Clearpen's own web-app labels: no path separators, no main window.
fn safe_label(label: &str) -> Result<&str, String> {
    if label.starts_with("webapp-")
        && label.len() <= 64
        && label
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        Ok(label)
    } else {
        Err("Unknown web app.".to_string())
    }
}

fn web_url(raw: &str) -> Result<Url, String> {
    let url: Url = raw
        .parse()
        .map_err(|_| "That address isn't a web address.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http and https addresses open in the web apps.".to_string());
    }
    Ok(url)
}

/// WhatsApp's loader rejects WKWebView unless the UA names a Safari version,
/// even though the engine *is* Safari. Safari deliberately freezes the macOS
/// part at 10_15_7; keep it as written.
#[cfg(target_os = "macos")]
const SAFARI_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15";

/// Google and Apple refuse to authorize inside an embedded browser; a tab or
/// a popup inside the app cannot change that. The only route is the system
/// browser, where the writer is already signed in.
fn blocked_identity_provider(url: &Url) -> Option<&'static str> {
    match url.host_str() {
        Some("accounts.google.com" | "accounts.youtube.com") => Some("Google"),
        Some("appleid.apple.com") => Some("Apple"),
        _ => None,
    }
}

/// Opens an identity provider in the real browser and tells the writer why the
/// embedded tab will not follow it. No cookies move: the browser session is
/// its own, which is why the embedded tab still needs a username/password.
fn open_identity_provider(app: &AppHandle, url: &Url, provider: &str) {
    let _ = app.opener().open_url(url.to_string(), None::<&str>);
    events::emit(
        app,
        "notification.received",
        serde_json::json!({
            "title": format!("{provider} sign-in opened in your browser"),
            "body": format!("{provider} blocks sign-in inside embedded browsers. Finish there, or use your username and password in this tab."),
            "severity": "warning"
        }),
    );
}

fn profile_dir(app: &AppHandle, label: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Couldn't find the app's data folder: {e}"))?
        .join("webapps")
        .join(label);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Couldn't make the web app's folder: {e}"))?;
    Ok(dir)
}

/// Creates a hidden web app if needed. `url` is
/// only used when the webview is created: a later visit keeps the page where
/// the writer left it.
#[tauri::command]
pub async fn webapp_open(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let label = safe_label(&label)?.to_string();
    if app.get_webview(&label).is_some() {
        return Ok(());
    }

    let url = web_url(&url)?;
    let event_url = url.to_string();
    let window = app
        .get_window("main")
        .ok_or_else(|| "The main window is missing.".to_string())?;
    let data_dir = profile_dir(&app, &label)?;

    let popup_app = app.clone();
    let popup_label = label.clone();
    let nav_app = app.clone();
    let page_app = app.clone();
    let page_label = label.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
        .focused(false)
        .data_directory(data_dir)
        .zoom_hotkeys_enabled(true)
        .devtools(cfg!(debug_assertions))
        .on_navigation(move |url| {
            if let Some(provider) = blocked_identity_provider(url) {
                open_identity_provider(&nav_app, url, provider);
                return false;
            }
            matches!(url.scheme(), "http" | "https" | "about" | "blob" | "data")
        })
        // A site's "open in a new window" (a login, a document) stays in this
        // tab rather than becoming a second window with no chrome. Google and
        // Apple sign-in are the exception: they must use the real browser.
        .on_new_window(move |url, _features| {
            if let Some(provider) = blocked_identity_provider(&url) {
                open_identity_provider(&popup_app, &url, provider);
                return NewWindowResponse::Deny;
            }
            if let Some(view) = popup_app.get_webview(&popup_label) {
                let _ = view.navigate(url);
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_view, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let url = payload.url().to_string();
            let host = payload.url().host_str().unwrap_or_default().to_string();
            let _ = page_app.emit(
                "webapp-navigated",
                WebAppNavigation {
                    label: page_label.clone(),
                    url: url.clone(),
                },
            );
            events::emit(
                &page_app,
                "webapp.navigated",
                serde_json::json!({ "label": page_label, "host": host }),
            );
        });

    // WKWebView's stock UA omits `Version/… Safari/…`, and WhatsApp reads that
    // as an old Safari. A real Safari UA is the honest one for this engine.
    #[cfg(target_os = "macos")]
    let builder = if label == "webapp-whatsapp" {
        builder.user_agent(SAFARI_USER_AGENT)
    } else {
        builder
    };

    // A new child starts visible. Park it outside the window until the UI
    // confirms the tab is still active and no menu is covering its host.
    window
        .add_child(
            builder,
            LogicalPosition::new(-2.0, -2.0),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|e| format!("Couldn't open the web app: {e}"))?
        .hide()
        .map_err(|e| e.to_string())?;
    events::emit(
        &app,
        "webapp.opened",
        serde_json::json!({ "label": label, "host": url_host(&event_url) }),
    );
    Ok(())
}

/// The host only: a chat URL can carry an account or conversation id, which
/// the local interaction log does not need.
fn url_host(raw: &str) -> String {
    raw.parse::<Url>()
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_string()))
        .unwrap_or_default()
}

/// Only the selected tab is placed in the window. Hidden children retain their session.
#[tauri::command]
pub fn webapp_present(app: AppHandle, label: String, bounds: Option<Bounds>) -> Result<(), String> {
    let label = safe_label(&label)?;
    let Some(view) = app.get_webview(label) else {
        // Cleanup can arrive before the hidden child has finished opening.
        return if bounds.is_none() {
            Ok(())
        } else {
            Err("That web app isn't open.".into())
        };
    };
    if let Some(bounds) = bounds {
        view.set_bounds(tauri::Rect {
            position: LogicalPosition::new(bounds.x, bounds.y).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        })
        .map_err(|e| e.to_string())?;
        view.show().map_err(|e| e.to_string())
    } else {
        view.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn webapp_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let label = safe_label(&label)?;
    let url = web_url(&url)?;
    let view = app
        .get_webview(label)
        .ok_or_else(|| "That web app isn't open.".to_string())?;
    view.navigate(url).map_err(|e| e.to_string())
}

/// Back, forward and reload, run in the page itself.
#[tauri::command]
pub fn webapp_action(app: AppHandle, label: String, action: String) -> Result<(), String> {
    let label = safe_label(&label)?;
    let view = app
        .get_webview(label)
        .ok_or_else(|| "That web app isn't open.".to_string())?;
    match action.as_str() {
        "back" => view.eval("history.back()").map_err(|e| e.to_string()),
        "forward" => view.eval("history.forward()").map_err(|e| e.to_string()),
        "reload" => view.reload().map_err(|e| e.to_string()),
        _ => Err(format!("Unknown web app action: {action}")),
    }
}

#[tauri::command]
pub fn webapp_close(app: AppHandle, label: String) -> Result<(), String> {
    let label = safe_label(&label)?;
    if let Some(view) = app.get_webview(label) {
        view.close().map_err(|e| e.to_string())?;
    }
    events::emit(&app, "webapp.closed", serde_json::json!({ "label": label }));
    Ok(())
}

#[tauri::command]
pub fn webapp_url(app: AppHandle, label: String) -> Result<Option<String>, String> {
    let label = safe_label(&label)?;
    let Some(view) = app.get_webview(label) else {
        return Ok(None);
    };
    Ok(Some(view.url().map_err(|e| e.to_string())?.to_string()))
}
