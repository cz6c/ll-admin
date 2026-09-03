//! 一次性补救：将旧版 `{index}_{stem}.ext` 同步文件重命名为含 id8 的新格式
//! 职责：有 state.db 时按 synced 行 rename 并更新 dest_path
//! 适用：用户手动触发 `icloud_sync_migrate_legacy_filenames`；全库迁完后可删除本模块
//! @note 临时模块：补救完成后可从 mod.rs / lib.rs / 前端入口移除

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use super::db::{list_synced_assets_for_path_migrate, open_db, set_asset_dest_path, state_db_path};
use super::naming::{format_legacy_asset_filename, sync_asset_filename};
use super::queue::is_worker_slot_active;
use super::resolve_sync_output_dir;
use super::types::AssetPart;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateLegacyFilenamesResult {
  /// 已成功 rename 并更新 dest_path
  pub renamed: u32,
  /// dest_path 已是新格式或磁盘文件已是新名
  pub already_new: u32,
  /// DB 指向的路径与计算的新路径均不存在
  pub skipped_no_file: u32,
  /// 新路径已被其它文件占用，未覆盖
  pub skipped_target_exists: u32,
  /// rename 或写库失败
  pub failed: u32,
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub errors: Vec<String>,
}

fn local_file_ready(path: &Path) -> bool {
  path.is_file()
    && std::fs::metadata(path)
      .map(|m| m.len() > 0)
      .unwrap_or(false)
}

fn paths_equal(a: &Path, b: &Path) -> bool {
  a == b
    || a.to_string_lossy().replace('\\', "/").eq_ignore_ascii_case(
      &b.to_string_lossy().replace('\\', "/"),
    )
}

/// 将 state.db 中 synced 行的落盘文件从旧命名迁到新命名（需 DB 与文件均在）
pub fn migrate_legacy_filenames(app: &AppHandle) -> Result<MigrateLegacyFilenamesResult, String> {
  if is_worker_slot_active() {
    return Err("已有同步/删云任务正在运行，请稍后再试".to_string());
  }

  let db_path = state_db_path(app)?;
  if !db_path.is_file() {
    return Err("未找到同步状态库，无需补救".to_string());
  }

  let output_dir = resolve_sync_output_dir(app)?
    .ok_or_else(|| "请配置同步输出目录".to_string())?;

  let conn = open_db(&db_path)?;
  let rows = list_synced_assets_for_path_migrate(&conn)?;

  let mut result = MigrateLegacyFilenamesResult {
    renamed: 0,
    already_new: 0,
    skipped_no_file: 0,
    skipped_target_exists: 0,
    failed: 0,
    errors: Vec::new(),
  };

  for row in rows {
    let part = match AssetPart::parse(&row.part) {
      Some(p) => p,
      None => {
        result.failed += 1;
        result.errors.push(format!(
          "asset {} part 无法解析: {}",
          row.asset_id, row.part
        ));
        continue;
      }
    };

    let new_name = sync_asset_filename(
      row.index_num as u32,
      &row.asset_id,
      &row.original_filename,
      part,
    );
    let new_path = output_dir.join(&new_name);

    let (stem, ext) = {
      let path = Path::new(&row.original_filename);
      let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("asset")
        .to_string();
      let ext = match part {
        AssetPart::Mov => "mov".to_string(),
        _ => path
          .extension()
          .and_then(|s| s.to_str())
          .unwrap_or("bin")
          .to_string(),
      };
      (stem, ext)
    };
    let legacy_name =
      format_legacy_asset_filename(row.index_num as u32, &stem, &ext);
    let legacy_path = output_dir.join(&legacy_name);

    let mut old_path = row
      .dest_path
      .as_deref()
      .map(PathBuf::from)
      .filter(|p| !p.as_os_str().is_empty())
      .unwrap_or_else(|| legacy_path.clone());

    if !local_file_ready(&old_path) && local_file_ready(&legacy_path) {
      old_path = legacy_path;
    }

    if paths_equal(&old_path, &new_path) && local_file_ready(&new_path) {
      result.already_new += 1;
      continue;
    }

    if local_file_ready(&new_path) {
      if paths_equal(&old_path, &new_path) {
        result.already_new += 1;
        continue;
      }
      if local_file_ready(&old_path) {
        result.skipped_target_exists += 1;
        result.errors.push(format!(
          "目标已存在且源路径不同，跳过: {}",
          new_path.display()
        ));
        continue;
      }
      if let Err(e) = set_asset_dest_path(&conn, row.id, &new_path.to_string_lossy()) {
        result.failed += 1;
        result.errors.push(format!("更新 dest_path 失败 id={}: {e}", row.id));
      } else {
        result.already_new += 1;
      }
      continue;
    }

    if !local_file_ready(&old_path) {
      result.skipped_no_file += 1;
      continue;
    }

    if let Some(parent) = new_path.parent() {
      if let Err(e) = std::fs::create_dir_all(parent) {
        result.failed += 1;
        result.errors.push(format!("创建目录失败 {}: {e}", parent.display()));
        continue;
      }
    }

    match std::fs::rename(&old_path, &new_path) {
      Ok(()) => {
        if let Err(e) = set_asset_dest_path(&conn, row.id, &new_path.to_string_lossy()) {
          result.failed += 1;
          result.errors.push(format!(
            "已重命名但写库失败 {} → {}: {e}",
            old_path.display(),
            new_path.display()
          ));
        } else {
          result.renamed += 1;
        }
      }
      Err(e) => {
        result.failed += 1;
        result.errors.push(format!(
          "重命名失败 {} → {}: {e}",
          old_path.display(),
          new_path.display()
        ));
      }
    }
  }

  Ok(result)
}

#[tauri::command]
pub fn icloud_sync_migrate_legacy_filenames(
  app: AppHandle,
) -> Result<MigrateLegacyFilenamesResult, String> {
  migrate_legacy_filenames(&app)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::db::{
    insert_job, mark_asset_status, open_db, upsert_catalog_assets,
  };
  use crate::icloud_sync::naming::{format_legacy_asset_filename, is_new_format_sync_filename, sync_asset_filename};
  use crate::icloud_sync::types::{
    AssetPart, AssetRow, AssetStatus, CloudState, JobStatus, JobView, MediaKind, TaskType,
  };
  use rusqlite::params;
  use std::time::{SystemTime, UNIX_EPOCH};

  #[test]
  fn migrate_renames_legacy_synced_file() {
    let dir = std::env::temp_dir().join(format!(
      "icloud_sync_migrate_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");

    let legacy_name = format_legacy_asset_filename(2, "IMG_0027", "HEIC");
    let legacy_path = dir.join(&legacy_name);
    std::fs::write(&legacy_path, b"photo").expect("write");

    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let db_path = std::env::temp_dir().join(format!("icloud-sync-migrate-{nanos}.db"));
    let conn = open_db(&db_path).expect("open");
    let job_id = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      &dir.to_string_lossy(),
      "user@icloud.com",
      JobStatus::Done,
      1,
      "full",
    )
    .expect("job");

    let asset = AssetRow {
      id: 0,
      apple_id: "user@icloud.com".into(),
      asset_id: "ASSET-MIGRATE-1".into(),
      sort_key: "2026-01-01".into(),
      capture_at: None,
      added_at: None,
      latitude: None,
      longitude: None,
      original_filename: "IMG_0027.HEIC".into(),
      media_kind: MediaKind::Photo,
      live_pair_id: None,
      index_num: 2,
      part: AssetPart::Full,
      download_status: Some(AssetStatus::Done),
      active_job_id: Some(job_id),
      dest_path: Some(legacy_path.to_string_lossy().into_owned()),
      cloud_state: CloudState::Synced,
      last_synced_at: None,
      last_catalog_at: None,
      last_error: None,
      attempt_count: 0,
      cpl_asset_record_name: None,
      cpl_asset_change_tag: None,
    };
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", std::slice::from_ref(&asset))
      .expect("insert");
    let row_id = conn
      .query_row(
        "SELECT id FROM assets WHERE asset_id = ?1",
        params!["ASSET-MIGRATE-1"],
        |r| r.get::<_, i64>(0),
      )
      .expect("id");
    mark_asset_status(
      &conn,
      row_id,
      AssetStatus::Done,
      Some(&legacy_path.to_string_lossy()),
    )
    .expect("mark");

    let rows = list_synced_assets_for_path_migrate(&conn).expect("list");
    assert_eq!(rows.len(), 1);

    let new_name = sync_asset_filename(2, "ASSET-MIGRATE-1", "IMG_0027.HEIC", AssetPart::Full);
    let new_path = dir.join(&new_name);
    assert!(!new_path.is_file());

    // 内联迁移逻辑（无 AppHandle）
    std::fs::rename(&legacy_path, &new_path).expect("rename");
    set_asset_dest_path(&conn, row_id, &new_path.to_string_lossy()).expect("update");

    assert!(new_path.is_file());
    assert!(!legacy_path.is_file());
    assert!(is_new_format_sync_filename(&new_name));

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(db_path);
  }
}
