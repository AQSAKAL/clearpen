// The event hub. Everything that happens in the app — the writer's commands,
// terminal sessions, web-app pages, notifications from a service — becomes one
// `AppEvent`. It is broadcast in Rust (tokio) and forwarded to the window,
// which stores it in the `interactions` table. Later, a small model can read
// that log and decide what deserves attention.
//
// Events are deliberately small and boring:
//   { id, kind, source, at, data }
// `data` is free-form JSON; a notification carries title/body/severity there.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::broadcast;

/// The Tauri event the window listens on. One channel, every kind.
pub const EVENT_NAME: &str = "clearpen://event";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppEvent {
    pub id: String,
    pub kind: String,
    pub source: String,
    /// Milliseconds since the Unix epoch.
    pub at: i64,
    #[serde(default)]
    pub data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct EventInput {
    pub kind: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
}

static SEQ: AtomicU64 = AtomicU64::new(0);

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn event_id(at: i64) -> String {
    format!("ev_{at:x}_{:x}", SEQ.fetch_add(1, Ordering::Relaxed))
}

pub struct EventBus {
    tx: broadcast::Sender<AppEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        // Slow consumers skip old events rather than blocking the app.
        let (tx, _) = broadcast::channel(512);
        Self { tx }
    }

    pub fn emit(&self, app: &AppHandle, input: EventInput) -> Result<AppEvent, String> {
        let kind = input.kind.trim().to_string();
        if kind.is_empty() {
            return Err("An event needs a kind.".to_string());
        }
        if kind.len() > 80 {
            return Err("That event kind is too long.".to_string());
        }
        let at = now();
        let event = AppEvent {
            id: event_id(at),
            kind,
            source: input
                .source
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty() && s.len() <= 40)
                .unwrap_or_else(|| "app".to_string()),
            at,
            data: input.data.unwrap_or(serde_json::Value::Null),
        };
        // A subscriber may come later (the model filter); the window is the
        // one that persists the log today. `emit` (not `emit_to`) matters:
        // the window's listener targets any webview, and `emit_to` would be
        // filtered out before it reaches that listener.
        let _ = self.tx.send(event.clone());
        let _ = app.emit(EVENT_NAME, &event);
        Ok(event)
    }

    /// For the small model filter that will run in Rust later. Kept beside
    /// the sender so the bus has a real subscriber API, not only the window.
    #[allow(dead_code)]
    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.tx.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

/// For Rust producers that don't have the window's state in hand.
pub fn emit(app: &AppHandle, kind: &str, data: serde_json::Value) {
    if let Some(bus) = app.try_state::<EventBus>() {
        let _ = bus.emit(
            app,
            EventInput {
                kind: kind.to_string(),
                source: Some("app".to_string()),
                data: Some(data),
            },
        );
    }
}

/// Emits an event from the window (a command, a saved article, a notification
/// a service delivered). The event comes back on `EVENT_NAME`, where the
/// window stores it and, for notifications, shows it.
#[tauri::command]
pub fn event_emit(
    app: AppHandle,
    bus: tauri::State<'_, EventBus>,
    input: EventInput,
) -> Result<AppEvent, String> {
    bus.emit(&app, input)
}
