// A read-only file browser with native listing and a parallel path search.
// The window draws the Finder-style view; this side touches the filesystem.
//
// Search is deliberately stateless: it walks the chosen folder with the same
// parallel walker ripgrep uses, skips heavy dependency folders, stops after a
// short budget or a result limit, and returns paths. Nothing is indexed or
// stored, so a stale index can never lie about what is on disk.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ignore::{WalkBuilder, WalkState};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

const MAX_LIST: usize = 5_000;
const MAX_RESULTS: usize = 200;
const SEARCH_BUDGET: Duration = Duration::from_millis(2_200);
const LARGE_BUDGET: Duration = Duration::from_millis(8_000);
const SIZE_BUDGET: Duration = Duration::from_millis(1_200);
const SIZE_TTL_MS: i64 = 2 * 60 * 1000;
const PARTIAL_SIZE_TTL_MS: i64 = 20 * 1000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    /// Milliseconds since the Unix epoch, when the filesystem gives one.
    pub modified: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsPlace {
    pub name: String,
    pub path: String,
    /// home, desktop, documents, downloads, volume.
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsPlaces {
    pub home: String,
    pub places: Vec<FsPlace>,
}

#[derive(Clone)]
struct Candidate {
    score: u8,
    path: PathBuf,
    name: String,
    is_dir: bool,
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn modified_ms(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

fn entry_of(path: PathBuf, name: String, meta: fs::Metadata) -> FsEntry {
    FsEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: meta.is_dir(),
        size: (!meta.is_dir()).then_some(meta.len()),
        modified: meta.modified().ok().and_then(modified_ms),
    }
}

/// A directory listing, folders first and then by name. Hidden entries are
/// left out unless the writer asks for them.
fn list_dir(path: &str, show_hidden: bool) -> Result<Vec<FsEntry>, String> {
    let dir = Path::new(path);
    let meta = fs::metadata(dir).map_err(|e| format!("Couldn’t read {path}: {e}"))?;
    if !meta.is_dir() {
        return Err("That is a file, not a folder.".to_string());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(|e| format!("Couldn’t read {path}: {e}"))? {
        let Ok(item) = item else { continue };
        let name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let Ok(meta) = item.metadata() else { continue };
        entries.push(entry_of(item.path(), name, meta));
        if entries.len() >= MAX_LIST {
            break;
        }
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().clamp(2, 8))
        .unwrap_or(4)
}

/// Folders that are almost never what someone means by "find a file", and
/// whose contents can be huge.
fn is_skipped_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | ".next"
            | ".cache"
            | "Library"
            | "Pods"
            | "DerivedData"
            | ".Trash"
            | ".npm"
            | ".cargo"
            | "venv"
            | ".venv"
    )
}

/// Matches a file or folder name, or a relative path when the query contains
/// a separator (`docs/report`). Stat is done only for the few final results.
fn search_paths(
    root: &str,
    query: &str,
    limit: usize,
    show_hidden: bool,
) -> Result<Vec<FsEntry>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err("That folder does not exist.".to_string());
    }
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    // "project notes" should find Project_Draft_Notes.pdf: every word has to appear,
    // in any order, not the whole query as one substring.
    let tokens: Vec<String> = needle
        .split_whitespace()
        .map(|token| token.to_string())
        .collect();
    if tokens.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 500);
    let by_path = needle.contains('/') || needle.contains('\\');
    let deadline = Instant::now() + SEARCH_BUDGET;
    let stop = Arc::new(AtomicBool::new(false));
    let found = Arc::new(Mutex::new(Vec::<Candidate>::new()));

    let walker = WalkBuilder::new(root)
        .threads(threads())
        .hidden(!show_hidden)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !is_skipped_dir(name.as_ref())
        })
        .build_parallel();

    walker.run(|| {
        let found = Arc::clone(&found);
        let stop = Arc::clone(&stop);
        let tokens = tokens.clone();
        Box::new(move |result| {
            if stop.load(Ordering::Relaxed) || Instant::now() > deadline {
                return WalkState::Quit;
            }
            let Ok(entry) = result else {
                return WalkState::Continue;
            };
            if entry.depth() == 0 {
                return WalkState::Continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            let all_in_name = tokens.iter().all(|token| lower.contains(token.as_str()));
            let some_in_name = tokens.iter().any(|token| lower.contains(token.as_str()));
            let score = if all_in_name {
                // A file whose name starts with the first word is the closest.
                if lower.starts_with(tokens[0].as_str()) {
                    0
                } else {
                    1
                }
            } else if by_path || some_in_name {
                // One or more words are in the name: the rest may be in a
                // parent folder, as in "docs/report".
                let path = entry.path().to_string_lossy().to_lowercase();
                if tokens.iter().all(|token| path.contains(token.as_str())) {
                    2
                } else {
                    return WalkState::Continue;
                }
            } else {
                return WalkState::Continue;
            };
            let candidate = Candidate {
                score,
                path: entry.path().to_path_buf(),
                name,
                is_dir: entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false),
            };
            let mut list = match found.lock() {
                Ok(list) => list,
                Err(_) => return WalkState::Quit,
            };
            list.push(candidate);
            if list.len() >= limit {
                stop.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }
            WalkState::Continue
        })
    });

    let mut candidates = match found.lock() {
        Ok(list) => list.clone(),
        Err(_) => Vec::new(),
    };
    candidates.sort_by(|a, b| {
        a.score
            .cmp(&b.score)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.path.as_os_str().len().cmp(&b.path.as_os_str().len()))
    });
    candidates.truncate(limit);

    Ok(candidates
        .into_iter()
        .map(|candidate| {
            let meta = fs::metadata(&candidate.path);
            match meta {
                Ok(meta) => entry_of(candidate.path, candidate.name, meta),
                Err(_) => FsEntry {
                    name: candidate.name,
                    path: candidate.path.to_string_lossy().to_string(),
                    is_dir: candidate.is_dir,
                    size: None,
                    modified: None,
                },
            }
        })
        .collect())
}

#[derive(Clone, Copy)]
struct CachedSize {
    bytes: u64,
    at: i64,
    complete: bool,
}

/// Folder sizes are expensive, so they are computed in the background and
/// kept for a couple of minutes. One calculation runs at a time; the rest
/// queue, and each result is sent to the window as soon as it is ready.
#[derive(Default)]
pub struct FolderSizes {
    cache: Mutex<HashMap<PathBuf, CachedSize>>,
    in_flight: Mutex<HashSet<PathBuf>>,
    compute: Mutex<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSize {
    pub path: String,
    pub bytes: Option<u64>,
    pub complete: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFiles {
    pub files: Vec<FsEntry>,
    pub scanned_ms: u64,
    /// False when the scan stopped at its time budget.
    pub complete: bool,
}

/// The largest files under `root`, without keeping every path in memory. A
/// bounded min-heap holds the best `limit`; an atomic threshold keeps most
/// small files from taking the heap lock at all.
fn compute_large_files(root: &Path, limit: usize) -> (Vec<FsEntry>, bool) {
    let limit = limit.clamp(1, 500);
    let heap = Arc::new(Mutex::new(BinaryHeap::<Reverse<(u64, PathBuf)>>::new()));
    let threshold = Arc::new(AtomicU64::new(0));
    let timed_out = Arc::new(AtomicBool::new(false));
    let deadline = Instant::now() + LARGE_BUDGET;

    let walker = WalkBuilder::new(root)
        .threads(threads())
        .hidden(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .build_parallel();

    walker.run(|| {
        let heap = Arc::clone(&heap);
        let threshold = Arc::clone(&threshold);
        let timed_out = Arc::clone(&timed_out);
        Box::new(move |result| {
            if Instant::now() > deadline {
                timed_out.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }
            let Ok(entry) = result else {
                return WalkState::Continue;
            };
            if !entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
            {
                return WalkState::Continue;
            }
            let Ok(meta) = entry.metadata() else {
                return WalkState::Continue;
            };
            let size = meta.len();
            // Once full, a file no bigger than the smallest kept one is not
            // a candidate. This is the hot path and takes no lock.
            if size <= threshold.load(Ordering::Relaxed) {
                return WalkState::Continue;
            }
            let Ok(mut heap) = heap.lock() else {
                return WalkState::Quit;
            };
            if heap.len() < limit {
                heap.push(Reverse((size, entry.path().to_path_buf())));
                if heap.len() == limit {
                    if let Some(Reverse((smallest, _))) = heap.peek() {
                        threshold.store(*smallest, Ordering::Relaxed);
                    }
                }
            } else if let Some(Reverse((smallest, _))) = heap.peek() {
                if size > *smallest {
                    heap.pop();
                    heap.push(Reverse((size, entry.path().to_path_buf())));
                    if let Some(Reverse((next, _))) = heap.peek() {
                        threshold.store(*next, Ordering::Relaxed);
                    }
                }
            }
            WalkState::Continue
        })
    });

    let mut kept: Vec<(u64, PathBuf)> = match heap.lock() {
        Ok(mut heap) => heap.drain().map(|Reverse(item)| item).collect(),
        Err(_) => Vec::new(),
    };
    kept.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));

    let files = kept
        .into_iter()
        .filter_map(|(size, path)| {
            let meta = fs::metadata(&path).ok()?;
            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string());
            Some(FsEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                size: Some(size),
                modified: meta.modified().ok().and_then(modified_ms),
            })
        })
        .collect();

    (files, !timed_out.load(Ordering::Relaxed))
}

fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Sums file lengths under a folder, including hidden files. The walk stops
/// after a short budget; `complete` says whether it saw the whole tree.
fn compute_folder_size(root: &Path) -> (u64, bool) {
    let total = Arc::new(AtomicU64::new(0));
    let complete = Arc::new(AtomicBool::new(true));
    let deadline = Instant::now() + SIZE_BUDGET;

    let walker = WalkBuilder::new(root)
        .threads(threads())
        .hidden(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .build_parallel();

    walker.run(|| {
        let total = Arc::clone(&total);
        let complete = Arc::clone(&complete);
        Box::new(move |result| {
            if Instant::now() > deadline {
                complete.store(false, Ordering::Relaxed);
                return WalkState::Quit;
            }
            let Ok(entry) = result else {
                complete.store(false, Ordering::Relaxed);
                return WalkState::Continue;
            };
            if !entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
            {
                return WalkState::Continue;
            }
            if let Ok(meta) = entry.metadata() {
                total.fetch_add(meta.len(), Ordering::Relaxed);
            } else {
                complete.store(false, Ordering::Relaxed);
            }
            WalkState::Continue
        })
    });

    (
        total.load(Ordering::Relaxed),
        complete.load(Ordering::Relaxed),
    )
}

#[tauri::command]
pub fn fs_folder_sizes(
    app: AppHandle,
    sizes: tauri::State<'_, Arc<FolderSizes>>,
    paths: Vec<String>,
) -> Vec<FolderSize> {
    let now = epoch_ms();
    let mut out = Vec::new();
    let mut todo = Vec::new();
    let mut seen = HashSet::new();

    for raw in paths.into_iter().take(64) {
        if !seen.insert(raw.clone()) {
            continue;
        }
        let path = PathBuf::from(&raw);
        if !path.is_dir() {
            out.push(FolderSize {
                path: raw,
                bytes: Some(0),
                complete: true,
            });
            continue;
        }

        let cached = sizes
            .cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(&path).copied());
        if let Some(cached) = cached {
            let ttl = if cached.complete {
                SIZE_TTL_MS
            } else {
                PARTIAL_SIZE_TTL_MS
            };
            if now - cached.at < ttl {
                out.push(FolderSize {
                    path: raw,
                    bytes: Some(cached.bytes),
                    complete: cached.complete,
                });
                continue;
            }
        }

        let start = sizes
            .in_flight
            .lock()
            .map(|mut set| set.insert(path.clone()))
            .unwrap_or(false);
        if start {
            todo.push(path.clone());
        }
        // Pending: the window shows an ellipsis and waits for `fs-folder-size`.
        out.push(FolderSize {
            path: raw,
            bytes: None,
            complete: false,
        });
    }

    for path in todo {
        let app = app.clone();
        let sizes = Arc::clone(&sizes);
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = sizes.compute.lock().ok();
            let (bytes, complete) = compute_folder_size(&path);
            let result = FolderSize {
                path: path.to_string_lossy().to_string(),
                bytes: Some(bytes),
                complete,
            };
            if let Ok(mut cache) = sizes.cache.lock() {
                cache.insert(
                    path.clone(),
                    CachedSize {
                        bytes,
                        at: epoch_ms(),
                        complete,
                    },
                );
            }
            if let Ok(mut set) = sizes.in_flight.lock() {
                set.remove(&path);
            }
            let _ = app.emit("fs-folder-size", result);
        });
    }

    out
}

#[tauri::command]
pub fn fs_places() -> FsPlaces {
    let home = home_dir();
    let mut places = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut add = |name: &str, path: PathBuf, kind: &str| {
        if !path.is_dir() {
            return;
        }
        let text = path.to_string_lossy().to_string();
        if seen.insert(text.clone()) {
            places.push(FsPlace {
                name: name.to_string(),
                path: text,
                kind: kind.to_string(),
            });
        }
    };

    add("Home", home.clone(), "home");
    add("Desktop", home.join("Desktop"), "desktop");
    add("Documents", home.join("Documents"), "documents");
    add("Downloads", home.join("Downloads"), "downloads");

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                add(&name, entry.path(), "volume");
            }
        }
        add("Computer", PathBuf::from("/"), "volume");
    }

    #[cfg(target_os = "windows")]
    {
        for letter in b'C'..=b'Z' {
            let root = format!("{}:\\", letter as char);
            if Path::new(&root).is_dir() {
                add(
                    &format!("{}:", letter as char),
                    PathBuf::from(root),
                    "volume",
                );
            }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    add("Computer", PathBuf::from("/"), "volume");

    FsPlaces {
        home: home.to_string_lossy().to_string(),
        places,
    }
}

#[tauri::command]
pub async fn fs_list(path: String, show_hidden: bool) -> Result<Vec<FsEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_dir(&path, show_hidden))
        .await
        .map_err(|e| format!("The file browser stopped: {e}"))?
}

#[tauri::command]
pub async fn fs_search(
    root: String,
    query: String,
    limit: Option<usize>,
    show_hidden: bool,
) -> Result<Vec<FsEntry>, String> {
    let limit = limit.unwrap_or(MAX_RESULTS);
    tauri::async_runtime::spawn_blocking(move || search_paths(&root, &query, limit, show_hidden))
        .await
        .map_err(|e| format!("The search stopped: {e}"))?
}

/// The 100 largest files under a folder, for the Cleanup view.
#[tauri::command]
pub async fn fs_large_files(root: String, limit: Option<usize>) -> Result<LargeFiles, String> {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let start = Instant::now();
    let root = if root.trim().is_empty() {
        home_dir()
    } else {
        PathBuf::from(&root)
    };
    if !root.is_dir() {
        return Err("That folder does not exist.".to_string());
    }
    let (files, complete) =
        tauri::async_runtime::spawn_blocking(move || compute_large_files(&root, limit))
            .await
            .map_err(|e| format!("The cleanup scan stopped: {e}"))?;
    Ok(LargeFiles {
        files,
        scanned_ms: start.elapsed().as_millis() as u64,
        complete,
    })
}

#[tauri::command]
pub fn fs_open(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_reveal(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("clearpen-files-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_folders_first_and_hides_dotfiles() {
        let dir = scratch();
        fs::create_dir_all(dir.join("Folder")).unwrap();
        fs::write(dir.join("Notes.md"), "hello").unwrap();
        fs::write(dir.join(".secret"), "hidden").unwrap();

        let names: Vec<String> = list_dir(dir.to_str().unwrap(), false)
            .unwrap()
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert_eq!(names, ["Folder", "Notes.md"]);

        let names: Vec<String> = list_dir(dir.to_str().unwrap(), true)
            .unwrap()
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert!(names.contains(&".secret".to_string()));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn finds_nested_files_and_skips_dependency_folders() {
        let dir = scratch();
        fs::create_dir_all(dir.join("Folder")).unwrap();
        fs::create_dir_all(dir.join("node_modules").join("pkg")).unwrap();
        fs::write(dir.join("Folder").join("Inner.txt"), "inner").unwrap();
        fs::write(dir.join("node_modules").join("pkg").join("index.js"), "x").unwrap();

        let found = search_paths(dir.to_str().unwrap(), "inner", 20, false).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Inner.txt");

        let skipped = search_paths(dir.to_str().unwrap(), "index", 20, false).unwrap();
        assert!(skipped.is_empty(), "dependency folders are skipped");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn folder_sizes_count_nested_files() {
        let dir = scratch();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("a.txt"), vec![0u8; 100]).unwrap();
        fs::write(dir.join("sub").join("b.txt"), vec![0u8; 250]).unwrap();

        let (bytes, complete) = compute_folder_size(&dir);
        assert!(complete);
        assert_eq!(bytes, 350);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn search_matches_separate_words_in_any_order() {
        let dir = scratch();
        fs::write(dir.join("Project_Draft_Notes.pdf"), "notes").unwrap();
        fs::write(dir.join("Other.pdf"), "other").unwrap();

        let found = search_paths(dir.to_str().unwrap(), "project notes", 20, false).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Project_Draft_Notes.pdf");

        let reversed = search_paths(dir.to_str().unwrap(), "notes project", 20, false).unwrap();
        assert_eq!(reversed.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn cleanup_keeps_the_largest_files() {
        let dir = scratch();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("small.txt"), vec![0u8; 10]).unwrap();
        fs::write(dir.join("medium.txt"), vec![0u8; 50]).unwrap();
        fs::write(dir.join("sub").join("large.bin"), vec![0u8; 500]).unwrap();

        let (files, complete) = compute_large_files(&dir, 2);
        assert!(complete);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].size, Some(500));
        assert_eq!(files[1].size, Some(50));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_path_query_matches_parent_folders() {
        let dir = scratch();
        fs::create_dir_all(dir.join("docs")).unwrap();
        fs::write(dir.join("docs").join("report.pdf"), "pdf").unwrap();

        let found = search_paths(dir.to_str().unwrap(), "docs/report", 20, false).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "report.pdf");
        fs::remove_dir_all(dir).unwrap();
    }
}
