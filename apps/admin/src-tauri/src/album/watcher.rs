//! 相册根目录文件监听
//! 职责：trailing debounce 后置 dirty 标志，由用户主动刷新触发 scan
//! 不再 emit 事件自动触发扫描，避免同步期间反复重扫

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

/// 静默期：最后一次文件变动后等待该时长再标记脏，避免批量落盘期间反复置位
const DEBOUNCE: Duration = Duration::from_secs(2);

/// 监听相册根目录变更；返回 watcher 句柄以维持生命周期
/// 收到变动只置 `dirty=true`，不触发扫描；scan 入口读取 dirty 决定走 DB 缓存还是全量重扫
pub fn start_watching(root: String, dirty: Arc<AtomicBool>) -> Option<RecommendedWatcher> {
  if root.is_empty() || !Path::new(&root).is_dir() {
    return None;
  }

  let (tx, rx) = mpsc::channel();
  let mut watcher = RecommendedWatcher::new(tx, notify::Config::default()).ok()?;
  if watcher
    .watch(Path::new(&root), RecursiveMode::Recursive)
    .is_err()
  {
    return None;
  }

  std::thread::spawn(move || {
    // 标准 trailing debounce：阻塞等首个事件 → 持续 drain 直到静默 DEBOUNCE → 置脏一次
    loop {
      match rx.recv() {
        Ok(_) => {}
        Err(_) => break, // watcher 已 drop，通道关闭
      }
      // 持续 drain，每收到一个事件就重置静默计时
      while rx.recv_timeout(DEBOUNCE).is_ok() {}
      dirty.store(true, Ordering::SeqCst);
    }
  });

  Some(watcher)
}
