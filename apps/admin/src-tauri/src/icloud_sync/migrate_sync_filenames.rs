//! 一次性：将同步目录内旧 `{index}_{id8?}_…` 文件名迁到 `{capture}_{id8}_…`
//! 职责：按 assets 表 dest_path 重命名落盘文件并回写路径
//! @note 全员迁移完成后可删除本模块、命令注册与前端按钮

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;
use tauri::AppHandle;

use super::db::{open_db, state_db_path};
use super::naming::{needs_capture_format_migration, sync_asset_filename};
use super::settings::load_settings;
use super::types::AssetPart;
use super::resolve_sync_output_dir;

/// 迁移结果摘要（前端 toast / 文案）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateSyncFilenamesResult {
  /// 成功重命名并回写 dest_path 的行数
  pub renamed: u32,
  /// 已是 capture 格式或无需处理
  pub skipped: u32,
  /// 失败条数
  pub failed: u32,
  /// 失败摘要（最多保留若干条）
  pub errors: Vec<String>,
}

struct MigrateRow {
  id: i64,
  asset_id: String,
  part: String,
  capture_at: Option<String>,
  original_filename: String,
  dest_path: String,
}

fn parse_part(raw: &str) -> Result<AssetPart, String> {
  match raw {
    "full" => Ok(AssetPart::Full),
    "still" => Ok(AssetPart::Still),
    "mov" => Ok(AssetPart::Mov),
    other => Err(format!("未知 part: {other}")),
  }
}

fn push_err(errors: &mut Vec<String>, msg: String) {
  if errors.len() < 20 {
    errors.push(msg);
  }
}

/**
 * 将当前 Apple ID 下仍占用旧 index 命名的已绑定文件迁到 capture 格式
 * @note 仅处理 DB 中 dest_path 指向且文件仍在盘上的行；不扫孤儿文件
 */
pub fn migrate_sync_filenames_to_capture(app: &AppHandle) -> Result<MigrateSyncFilenamesResult, String> {
  let settings = load_settings(app)?;
  let apple_id = settings.apple_id.trim();
  if apple_id.is_empty() {
    return Err("请先登录 Apple ID".into());
  }

  // 校验输出目录可解析（与下载一致）；实际重命名在 dest 同级目录
  let _output = resolve_sync_output_dir(app)?
    .ok_or_else(|| "无法解析同步输出目录".to_string())?;

  let db_path = state_db_path(app)?;
  let conn = open_db(&db_path)?;

  let mut stmt = conn
    .prepare(
      r#"
      SELECT id, asset_id, part, capture_at, original_filename, dest_path
      FROM assets
      WHERE apple_id = ?1
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
      "#,
    )
    .map_err(|e| format!("查询 assets 失败: {e}"))?;

  let rows = stmt
    .query_map(params![apple_id], |r| {
      Ok(MigrateRow {
        id: r.get(0)?,
        asset_id: r.get(1)?,
        part: r.get(2)?,
        capture_at: r.get(3)?,
        original_filename: r.get(4)?,
        dest_path: r.get(5)?,
      })
    })
    .map_err(|e| format!("读取 assets 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("遍历 assets 失败: {e}"))?;

  let mut renamed = 0u32;
  let mut skipped = 0u32;
  let mut failed = 0u32;
  let mut errors: Vec<String> = Vec::new();

  for row in rows {
    let dest = PathBuf::from(row.dest_path.trim());
    let Some(name) = dest.file_name().and_then(|n| n.to_str()) else {
      skipped += 1;
      continue;
    };

    if !needs_capture_format_migration(name) {
      skipped += 1;
      continue;
    }

    if !dest.is_file() {
      failed += 1;
      push_err(
        &mut errors,
        format!("文件不存在，跳过 id={}: {}", row.id, dest.display()),
      );
      continue;
    }

    let part = match parse_part(&row.part) {
      Ok(p) => p,
      Err(e) => {
        failed += 1;
        push_err(&mut errors, format!("id={}: {e}", row.id));
        continue;
      }
    };

    let new_name = sync_asset_filename(
      row.capture_at.as_deref(),
      &row.asset_id,
      &row.original_filename,
      part,
    );
    let new_path = dest
      .parent()
      .unwrap_or_else(|| Path::new("."))
      .join(&new_name);

    if new_path == dest {
      skipped += 1;
      continue;
    }

    if new_path.exists() {
      failed += 1;
      push_err(
        &mut errors,
        format!("目标已存在，跳过 id={}: {}", row.id, new_path.display()),
      );
      continue;
    }

    if let Err(e) = fs::rename(&dest, &new_path) {
      failed += 1;
      push_err(
        &mut errors,
        format!(
          "重命名失败 id={}: {e} ({} → {})",
          row.id,
          dest.display(),
          new_path.display()
        ),
      );
      continue;
    }

    let new_path_str = new_path.to_string_lossy().to_string();
    let old_path_str = dest.to_string_lossy().to_string();
    if let Err(e) = conn.execute(
      "UPDATE assets SET dest_path = ?1 WHERE id = ?2",
      params![new_path_str, row.id],
    ) {
      let _ = fs::rename(&new_path, &dest);
      failed += 1;
      push_err(&mut errors, format!("回写 dest_path 失败 id={}: {e}", row.id));
      continue;
    }

    // 同步相册索引 + 缩略图缓存（失败不回滚文件；下次扫盘会重生）
    if let Err(e) = crate::album::relocate_media_after_rename(app, &old_path_str, &new_path_str) {
      log::warn!(
        "icloud_sync migrate: album relocate failed {} → {}: {e}",
        old_path_str,
        new_path_str
      );
    }

    renamed += 1;
  }

  Ok(MigrateSyncFilenamesResult {
    renamed,
    skipped,
    failed,
    errors,
  })
}

#[cfg(test)]
mod tests {
  use crate::icloud_sync::naming::{asset_id_token, format_asset_filename, needs_capture_format_migration};

  #[test]
  fn migration_predicate_on_index_names() {
    let id8 = asset_id_token("X");
    assert!(needs_capture_format_migration(&format!("00007_{id8}_a.jpg")));
    assert!(needs_capture_format_migration("00007_a.jpg"));
    assert!(!needs_capture_format_migration(&format_asset_filename(
      Some("2024-06-01T08:00:00Z"),
      "X",
      "a",
      "jpg"
    )));
  }
}
