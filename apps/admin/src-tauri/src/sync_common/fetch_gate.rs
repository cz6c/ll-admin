//! 自定义协议远端拉取并发门闸
//! 职责：限制同时 in-flight 请求数，避免 WebView 一次挂起数十请求
//! 适用：icloudimg / qzoneimg 协议层

use std::sync::{Condvar, Mutex};
use std::time::Duration;

/// 协议拉远端并发门闸（每协议各持一份静态实例）
pub struct FetchGate {
  inflight: Mutex<u32>,
  cv: Condvar,
  max_inflight: u32,
}

impl FetchGate {
  /// @param max_inflight 同时拉取上限
  pub const fn new(max_inflight: u32) -> Self {
    Self {
      inflight: Mutex::new(0),
      cv: Condvar::new(),
      max_inflight,
    }
  }

  /// 占用一个槽；满则最多等 60s 再重试
  pub fn acquire(&self) {
    let mut n = self.inflight.lock().unwrap_or_else(|e| e.into_inner());
    loop {
      if *n < self.max_inflight {
        *n += 1;
        return;
      }
      let (guard, _) = self
        .cv
        .wait_timeout(n, Duration::from_secs(60))
        .unwrap_or_else(|e| e.into_inner());
      n = guard;
    }
  }

  /// 释放槽并唤醒等待者
  pub fn release(&self) {
    if let Ok(mut n) = self.inflight.lock() {
      if *n > 0 {
        *n -= 1;
      }
      self.cv.notify_one();
    }
  }
}
