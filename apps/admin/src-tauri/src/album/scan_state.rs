//! 相册扫描任务状态
//! 职责：取消标志、后台缩略图任务串行化

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 可跨线程共享的扫描取消令牌
#[derive(Clone, Default)]
pub struct ScanCancelToken {
  cancelled: Arc<AtomicBool>,
}

impl ScanCancelToken {
  pub fn cancel(&self) {
    self.cancelled.store(true, Ordering::SeqCst);
  }

  pub fn is_cancelled(&self) -> bool {
    self.cancelled.load(Ordering::SeqCst)
  }
}
