//! 一次性：将同步目录内旧落盘名迁到 `{unix}_{apple8}_{id16}.{ext}`
//! 职责：识别全部历史格式、重命名、回写 dest_path、搬迁相册缓存
//! @note 全员迁移完成后删除本模块、命令注册、前端按钮，以及 album 对下文导出的引用

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;
use tauri::AppHandle;

use super::db::{open_db, state_db_path};
use super::naming::{is_sync_filename, sync_asset_filename};
use super::resolve_sync_output_dir;
use super::settings::load_settings;
use super::types::AssetPart;

/// 旧版紧凑日历前缀长度：`YYYYMMDDTHHMMSS`
const YMD_COMPACT_LEN: usize = 15;

/// 迁移结果摘要（前端 toast / 文案）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateSyncFilenamesResult {
  /// 成功重命名并回写 dest_path 的行数
  pub renamed: u32,
  /// 已是当前格式或无需处理
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

fn id8_token(s: &str) -> Option<&str> {
  if s.len() == 8 && s.bytes().all(|b| b.is_ascii_hexdigit()) {
    Some(s)
  } else {
    None
  }
}

fn stem_has_unix_epoch_prefix(stem: &str) -> bool {
  let Some((prefix, _)) = stem.split_once('_') else {
    return false;
  };
  let len = prefix.len();
  (9..=12).contains(&len) && prefix.chars().all(|c| c.is_ascii_digit())
}

fn stem_has_ymd_compact_prefix(stem: &str) -> bool {
  if stem.len() < YMD_COMPACT_LEN + 1 {
    return false;
  }
  let bytes = stem.as_bytes();
  if bytes.get(YMD_COMPACT_LEN) != Some(&b'_') {
    return false;
  }
  let t = bytes.get(8).copied();
  if t != Some(b'T') && t != Some(b't') {
    return false;
  }
  stem[..8].chars().all(|c| c.is_ascii_digit())
    && stem[9..YMD_COMPACT_LEN].chars().all(|c| c.is_ascii_digit())
}

fn stem_has_index_prefix(stem: &str) -> bool {
  if stem_has_unix_epoch_prefix(stem) || stem_has_ymd_compact_prefix(stem) {
    return false;
  }
  stem.len() >= 6
    && stem.as_bytes().get(5) == Some(&b'_')
    && stem[..5].chars().all(|c| c.is_ascii_digit())
}

fn after_time_prefix<'a>(stem: &'a str) -> Option<&'a str> {
  if stem_has_unix_epoch_prefix(stem) {
    let (_, rest) = stem.split_once('_')?;
    return Some(rest);
  }
  if stem_has_ymd_compact_prefix(stem) {
    return Some(&stem[YMD_COMPACT_LEN + 1..]);
  }
  if stem_has_index_prefix(stem) {
    return Some(&stem[6..]);
  }
  None
}

fn is_unix_id8_stem_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_unix_epoch_prefix(stem) || is_sync_filename(filename) {
    return false;
  }
  let Some(rest) = after_time_prefix(stem) else {
    return false;
  };
  let Some((token, after)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some() && !after.is_empty()
}

fn is_ymd_id8_stem_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_ymd_compact_prefix(stem) {
    return false;
  }
  let rest = &stem[YMD_COMPACT_LEN + 1..];
  let Some((token, after)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some() && !after.is_empty()
}

fn is_index_id8_stem_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_index_prefix(stem) {
    return false;
  }
  let rest = &stem[6..];
  let Some((token, after)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some() && !after.is_empty()
}

fn is_index_only_stem_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  stem_has_index_prefix(stem) && !is_index_id8_stem_filename(filename)
}

/// 历史同步落盘名（非当前 `{unix}_{apple8}_{id16}`）；迁完删模块时可一并去掉调用方
pub fn is_pre_v3_sync_filename(filename: &str) -> bool {
  let base = Path::new(filename)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or(filename);
  if is_sync_filename(base) {
    return false;
  }
  is_unix_id8_stem_filename(base)
    || is_ymd_id8_stem_filename(base)
    || is_index_id8_stem_filename(base)
    || is_index_only_stem_filename(base)
}

/**
 * 去掉历史同步前缀后的 content stem，供重复检测在迁移过渡期匹配正本
 * @note 当前格式 stem 无原始文件名，返回空串；迁完删模块后调用方改为直接用小写 stem
 */
pub fn legacy_content_stem_for_dedup(stem: &str) -> String {
  let lower = stem.to_lowercase();
  if is_sync_filename(&format!("{lower}.bin")) {
    return String::new();
  }
  let Some(rest) = after_time_prefix(&lower) else {
    return lower;
  };
  if let Some((token, after)) = rest.split_once('_') {
    if id8_token(token).is_some() {
      return after.to_string();
    }
  }
  rest.to_string()
}

/**
 * 将当前 Apple ID 下仍占用旧命名的已绑定文件迁到 `{unix}_{apple8}_{id16}`
 * @note 仅处理 DB 中 dest_path 指向且文件仍在盘上的行；不扫孤儿文件
 */
pub fn migrate_sync_filenames_to_capture(app: &AppHandle) -> Result<MigrateSyncFilenamesResult, String> {
  let settings = load_settings(app)?;
  let apple_id = settings.apple_id.trim();
  if apple_id.is_empty() {
    return Err("请先登录 Apple ID".into());
  }

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

    if is_sync_filename(name) {
      skipped += 1;
      continue;
    }

    // 非当前格式一律尝试迁（含无法识别的旧名：按 catalog 重算目标名）
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
      apple_id,
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
  use super::*;
  use crate::icloud_sync::naming::{
    apple_id_token, asset_id_token16, format_asset_filename,
  };

  #[test]
  fn detects_all_pre_v3_shapes() {
    assert!(is_pre_v3_sync_filename("00007_a.jpg"));
    assert!(is_pre_v3_sync_filename("00007_abcd1234_a.jpg"));
    assert!(is_pre_v3_sync_filename("1705321845_abcd1234_a.jpg"));
    assert!(is_pre_v3_sync_filename("20240115T120000_abcd1234_a.jpg"));

    let cur = format_asset_filename(
      Some("2024-06-01T08:00:00Z"),
      "user@x.com",
      "X",
      "jpg",
    );
    assert!(is_sync_filename(&cur));
    assert!(!is_pre_v3_sync_filename(&cur));
  }

  #[test]
  fn legacy_stem_strip_for_dedup() {
    assert_eq!(
      legacy_content_stem_for_dedup("00042_img_0027"),
      "img_0027"
    );
    assert_eq!(
      legacy_content_stem_for_dedup("00042_abcd1234_img_0027"),
      "img_0027"
    );
    assert_eq!(
      legacy_content_stem_for_dedup("1705321845_abcd1234_img_0027"),
      "img_0027"
    );
    let apple8 = apple_id_token("u@x.com");
    let id16 = asset_id_token16("A1");
    assert_eq!(
      legacy_content_stem_for_dedup(&format!("1705321845_{apple8}_{id16}")),
      ""
    );
  }
}
