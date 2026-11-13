// The integrated terminal: one pseudo-terminal per tab. The window draws it
// with xterm.js; this side owns the process, sends its output over a Tauri
// channel, and writes keystrokes back. Nothing is kept between runs: closing a
// tab, or the window, ends its shell.
//
// A GUI app on macOS does not inherit the writer's PATH, so a command (run
// opencode, say) starts in a login, interactive shell. If the command isn't
// found, the tab drops back to that shell instead of vanishing.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde_json::json;
use tauri::{
    AppHandle,
    ipc::{Channel, InvokeResponseBody},
};

use crate::events;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Ends a tab's whole process group. The shell is a session leader, so its
/// process group holds the command it started too (opencode, a build, a test).
fn end(session: &mut Session) {
    #[cfg(unix)]
    if let Some(pid) = session.child.process_id() {
        // SIGKILL, so a TUI that ignores SIGHUP cannot outlive its tab. Guard
        // the pid: kill(0, …) would signal Clearpen's own process group.
        if pid > 0 && pid <= i32::MAX as u32 {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
    let _ = session.child.kill();
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, Session>>,
}

/// The shell a plain tab opens: the writer's own, as their terminal would.
fn default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|shell| !shell.trim().is_empty())
            .unwrap_or_else(|| {
                if cfg!(target_os = "macos") {
                    "/bin/zsh".to_string()
                } else {
                    "/bin/bash".to_string()
                }
            })
    }
}

fn home_dir() -> Option<String> {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").ok();
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").ok();
    home.filter(|home| !home.trim().is_empty())
}

fn shell_command(shell: &str, command: Option<&str>) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(shell);
    #[cfg(target_os = "windows")]
    {
        let lower = shell.to_ascii_lowercase();
        let powershell = lower.contains("powershell") || lower.contains("pwsh");
        match command {
            Some(command) if powershell => {
                cmd.args(["-NoLogo", "-NoExit", "-Command", command]);
            }
            Some(command) => {
                cmd.args(["/K", command]);
            }
            None if powershell => {
                cmd.arg("-NoLogo");
            }
            None => {}
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        match command {
            Some(command) => {
                // -l and -i load the writer's profile, so the PATH it sets
                // (nvm, Homebrew, asdf) works. If the command can't start, a
                // shell is better than a tab that closes.
                let script = format!(
                    "{command} || {{ printf '\\n[Clearpen] that command could not start; here is a shell.\\n'; exec {shell} -l; }}"
                );
                cmd.args(["-l", "-i", "-c", &script]);
            }
            None => {
                cmd.arg("-l");
            }
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Clearpen");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    cmd
}

fn spawn(
    shell: &str,
    cwd: Option<String>,
    command: Option<&str>,
    cols: u16,
    rows: u16,
) -> Result<(Session, Box<dyn Read + Send>), String> {
    let size = PtySize {
        rows: rows.max(2),
        cols: cols.max(2),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|e| format!("Couldn't open a terminal: {e}"))?;

    let mut cmd = shell_command(shell, command);
    if let Some(cwd) = cwd.filter(|cwd| !cwd.trim().is_empty()).or_else(home_dir) {
        cmd.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Couldn't start {shell}: {e}"))?;
    drop(pair.slave);

    let master = pair.master;
    let reader = master
        .try_clone_reader()
        .map_err(|e| format!("Couldn't read from the terminal: {e}"))?;
    let writer = master
        .take_writer()
        .map_err(|e| format!("Couldn't write to the terminal: {e}"))?;

    Ok((
        Session {
            master,
            writer,
            child,
        },
        reader,
    ))
}

#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shell: Option<String>,
    command: Option<String>,
    on_output: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let shell = shell
        .filter(|shell| !shell.trim().is_empty())
        .unwrap_or_else(default_shell);
    let (session, mut reader) = spawn(&shell, cwd, command.as_deref(), cols, rows)?;
    let event_id = id.clone();

    state
        .sessions
        .lock()
        .map_err(|_| "The terminal list is unavailable.".to_string())?
        .insert(id, session);

    events::emit(
        &app,
        "terminal.opened",
        json!({ "id": event_id, "shell": shell }),
    );

    let channel = on_output;
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if channel
                        .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        // An empty chunk says the shell has ended.
        let _ = channel.send(InvokeResponseBody::Raw(Vec::new()));
    });

    Ok(())
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "The terminal list is unavailable.".to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| "That terminal has closed.".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Couldn't write to the terminal: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Couldn't write to the terminal: {e}"))
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "The terminal list is unavailable.".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| "That terminal has closed.".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Couldn't resize the terminal: {e}"))
}

#[tauri::command]
pub fn terminal_close(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "The terminal list is unavailable.".to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        end(&mut session);
        // Dropping the master closes the PTY; the reader thread then ends.
    }
    events::emit(&app, "terminal.closed", json!({ "id": id }));
    Ok(())
}

#[tauri::command]
pub fn terminal_close_all(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "The terminal list is unavailable.".to_string())?;
    let count = sessions.len();
    for (_, mut session) in sessions.drain() {
        end(&mut session);
    }
    events::emit(&app, "terminal.closed_all", json!({ "count": count }));
    Ok(())
}

#[tauri::command]
pub fn terminal_default_shell() -> String {
    default_shell()
}

#[cfg(test)]
mod tests {
    /// A real pseudo-terminal runs a command, and what it prints comes back.
    #[cfg(unix)]
    #[test]
    fn runs_a_command_in_a_terminal() {
        use std::io::Read;

        let (mut session, mut reader) = super::spawn(
            &super::default_shell(),
            None,
            Some("printf clearpen"),
            80,
            24,
        )
        .expect("open a terminal");
        let mut out = Vec::new();
        let mut buf = [0u8; 4096];
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    out.extend_from_slice(&buf[..n]);
                    if String::from_utf8_lossy(&out).contains("clearpen") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        assert!(String::from_utf8_lossy(&out).contains("clearpen"));
        let _ = session.child.kill();
    }
}
