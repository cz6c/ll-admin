//! assets.dest_path 批量改名
//! 职责：本地文件改名后 best-effort 同步各源 state.db
//! 适用：album 改拍摄时间 / 落盘 rename 后回调

use rusqlite::Connection;

/**
 * 按 (from, to) 更新 `assets.dest_path`
 * @note 失败只打日志，不中断相册主流程
 */
pub fn remap_assets_dest_paths(
  conn: &Connection,
  renames: &[(String, String)],
  log_prefix: &str,
) {
  for (from, to) in renames {
    if let Err(e) = conn.execute(
      "UPDATE assets SET dest_path = ?2 WHERE dest_path = ?1",
      rusqlite::params![from, to],
    ) {
      log::warn!("{log_prefix}: remap dest_path {from} → {to}: {e}");
    }
  }
}
