//! 相册根目录文件监听
//! 职责：debounce 后通知前端触发增量扫描

use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use super::scanner::ALBUM_FILES_CHANGED_EVENT;

const DEBOUNCE_SECS: u64 = 2;

/// 监听相册根目录变更；返回 watcher 句柄以维持生命周期
pub fn start_watching(app: AppHandle, root: String) -> Option<RecommendedWatcher> {
  if root.is_empty() || !Path::new(&root).is_dir() {
    return None;
  }

  let (tx, rx) = mpsc::channel();
  let mut watcher = RecommendedWatcher::new(tx, notify::Config::default()).ok()?;
  watcher
    .watch(Path::new(&root), RecursiveMode::Recursive)
    .ok()?;

  std::thread::spawn(move || {
    let mut last_emit = Instant::now() - Duration::from_secs(DEBOUNCE_SECS);
    while let Ok(_event) = rx.recv() {
      if last_emit.elapsed() >= Duration::from_secs(DEBOUNCE_SECS) {
        let _ = app.emit(ALBUM_FILES_CHANGED_EVENT, ());
        last_emit = Instant::now();
      }
    }
  });

  Some(watcher)
}
