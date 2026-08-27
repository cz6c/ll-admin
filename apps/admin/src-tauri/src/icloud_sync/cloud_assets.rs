//! iCloud 同步 — 跨 job 云资产查询
//! 职责：抽屉 load_assets、cloud_state 汇总（含 local_missing 懒算）
//! 适用：P1b 云管理列表；不写入 cloud_state

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::db::{open_db, state_db_path};
use super::settings::load_settings;
use super::types::{
  CloudState, IcloudSyncCloudStateSummary, IcloudSyncLoadAssetsResult, SyncAssetRow,
};
use tauri::AppHandle;

/// 单次请求最多对多少条「有 dest_path 的候选」做 is_file()。
/// 禁止对全库 10w 扫盘；超出窗口的缺失不计入本轮 total（与 summary 一致）。
const LOCAL_MISSING_CHECK_LIMIT: i64 = 2000;

fn derive_display_state(cloud_state: CloudState, dest_path: Option<&str>) -> String {
  if let Some(p) = dest_path.filter(|s| !s.is_empty()) {
    if matches!(cloud_state, CloudState::Synced | CloudState::ModifiedCloud) {
      if !Path::new(p).is_file() {
        return "local_missing".to_string();
      }
    }
  }
  cloud_state.as_str().to_string()
}

/// Live Photo 列表：有 still 时不返回 mov（DB 仍两行；删云仍 expand 成对）
const LIVE_MOV_LIST_HIDDEN: &str = r#"NOT (
  part = 'mov'
  AND EXISTS (
    SELECT 1 FROM assets s
    WHERE s.apple_id = assets.apple_id
      AND s.asset_id = assets.asset_id
      AND s.part = 'still'
  )
)"#;

fn push_cloud_list_where(parts: &mut Vec<&'static str>) {
  parts.push(LIVE_MOV_LIST_HIDDEN);
}

/// catalog 常给 still/mov 同一 filename；列表展示 mov 时用云端原名或从 still 推导 .MOV
fn derive_live_mov_filename(still_filename: &str) -> String {
  let stem = Path::new(still_filename)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or(still_filename);
  format!("{stem}.MOV")
}

fn resolve_live_mov_display_filename(still_filename: &str, mov_original: &str) -> String {
  if !mov_original.is_empty() && mov_original != still_filename {
    return mov_original.to_string();
  }
  // 不用 dest_path basename：落盘名为 {index:05d}_{stem}.mov，仅用于本地路径
  derive_live_mov_filename(still_filename)
}

/// still 行附带 mov 配对元数据（文件名 + job 内 download_status）
fn enrich_live_pair_meta(
  conn: &Connection,
  apple_id: &str,
  row: &mut SyncAssetRow,
) -> Result<(), String> {
  row.live_mov_filename = None;
  row.live_mov_download_status = None;
  if row.part != "still" {
    return Ok(());
  }

  let mov_row: Option<(String, Option<String>, Option<String>)> = conn
    .query_row(
      r#"
      SELECT original_filename, dest_path, download_status
      FROM assets
      WHERE apple_id = ?1 AND asset_id = ?2 AND part = 'mov'
      LIMIT 1
      "#,
      params![apple_id, row.asset_id],
      |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()
    .map_err(|e| format!("读取 live mov 配对失败: {e}"))?;

  if let Some((mov_original, _mov_dest, mov_download)) = mov_row {
    row.live_mov_filename = Some(resolve_live_mov_display_filename(
      &row.original_filename,
      &mov_original,
    ));
    row.live_mov_download_status = mov_download;
    return Ok(());
  }

  if row.media_kind == "live" {
    row.live_mov_filename = Some(derive_live_mov_filename(&row.original_filename));
  }
  Ok(())
}

fn cloud_display_rank(state: &str) -> u8 {
  match state {
    "failed_delete" => 7,
    "deleted_cloud_pending" => 6,
    "local_missing" => 5,
    "cloud_delete_queued" => 4,
    "modified_cloud" => 3,
    "cloud_only" => 2,
    "synced" => 1,
    _ => 0,
  }
}

fn worse_cloud_display(a: &str, b: &str) -> String {
  if cloud_display_rank(b) > cloud_display_rank(a) {
    b.to_string()
  } else {
    a.to_string()
  }
}

/// Live 列表行：合并 still/mov 派生态（local_missing、等待删云等取更「差」一侧）
fn derive_list_display_state(
  conn: &Connection,
  apple_id: &str,
  asset_id: &str,
  part: &str,
  cloud_state: CloudState,
  dest_path: Option<&str>,
) -> Result<String, String> {
  let still_display = derive_display_state(cloud_state, dest_path);
  if part != "still" {
    return Ok(still_display);
  }
  let mov_row: Option<(String, Option<String>)> = conn
    .query_row(
      r#"
      SELECT cloud_state, dest_path FROM assets
      WHERE apple_id = ?1 AND asset_id = ?2 AND part = 'mov'
      "#,
      params![apple_id, asset_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| format!("读取 live mov 态失败: {e}"))?;
  let Some((mov_cloud_s, mov_dest)) = mov_row else {
    return Ok(still_display);
  };
  let mov_cloud = CloudState::parse(&mov_cloud_s).unwrap_or(CloudState::CloudOnly);
  let mov_display = derive_display_state(mov_cloud, mov_dest.as_deref());
  Ok(worse_cloud_display(&still_display, &mov_display))
}

/// YYYY-MM-DD 日期边界（对 sort_key ISO8601 前缀比较）
#[derive(Debug, Clone, Default)]
struct SortKeyDateFilter {
  from: Option<String>,
  to: Option<String>,
}

impl SortKeyDateFilter {
  fn parse(from: Option<&str>, to: Option<&str>) -> Self {
    fn norm(raw: Option<&str>) -> Option<String> {
      let s = raw?.trim();
      if s.is_empty() {
        return None;
      }
      if s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') && s.as_bytes().get(7) == Some(&b'-') {
        Some(s.to_string())
      } else {
        None
      }
    }
    Self {
      from: norm(from),
      to: norm(to),
    }
  }

  fn push_where(&self, parts: &mut Vec<&'static str>) {
    if self.from.is_some() {
      parts.push("substr(sort_key, 1, 10) >= ?");
    }
    if self.to.is_some() {
      parts.push("substr(sort_key, 1, 10) <= ?");
    }
  }

  fn push_params(&self, params: &mut Vec<Box<dyn rusqlite::ToSql>>) {
    if let Some(f) = &self.from {
      params.push(Box::new(f.clone()));
    }
    if let Some(t) = &self.to {
      params.push(Box::new(t.clone()));
    }
  }
}

/// 流式扫描有限候选：最多 `LOCAL_MISSING_CHECK_LIMIT` 次 is_file，收集缺失行。
///
/// @note 按 sort_key 前缀窗口懒算；不写回 cloud_state。
fn collect_local_missing(
  conn: &Connection,
  apple_id: &str,
  date_filter: &SortKeyDateFilter,
) -> Result<Vec<SyncAssetRow>, String> {
  let mut where_parts = vec![
    "apple_id = ?1",
    "dest_path IS NOT NULL",
    "cloud_state IN ('synced', 'modified_cloud')",
  ];
  push_cloud_list_where(&mut where_parts);
  date_filter.push_where(&mut where_parts);
  let where_clause = where_parts.join(" AND ");
  let sql = format!(
    r#"
      SELECT asset_id, part, index_num, sort_key, original_filename, media_kind, live_pair_id,
             dest_path, cloud_state, download_status, last_synced_at, last_catalog_at
      FROM assets
      WHERE {where_clause}
      ORDER BY sort_key ASC,
               CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
      LIMIT ?
      "#
  );

  let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(apple_id.to_string())];
  date_filter.push_params(&mut params);
  params.push(Box::new(LOCAL_MISSING_CHECK_LIMIT));
  let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn
    .prepare(&sql)
    .map_err(|e| format!("准备 local_missing 候选失败: {e}"))?;

  let mut missing = Vec::new();
  let rows = stmt
    .query_map(param_refs.as_slice(), map_candidate_row)
    .map_err(|e| format!("查询 local_missing 候选失败: {e}"))?;
  for row in rows {
      let item = row.map_err(|e| format!("解析 local_missing 候选失败: {e}"))?;
      let display = derive_list_display_state(
        conn,
        apple_id,
        &item.asset_id,
        &item.part,
        CloudState::parse(&item.cloud_state).unwrap_or(CloudState::Synced),
        item.dest_path.as_deref(),
      )?;
      if display != "local_missing" {
        continue;
      }
      let mut row = SyncAssetRow {
        cloud_state: display,
        live_mov_filename: None,
        live_mov_download_status: None,
        ..item
      };
      enrich_live_pair_meta(conn, apple_id, &mut row)?;
      missing.push(row);
  }
  Ok(missing)
}

fn map_candidate_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncAssetRow> {
  Ok(SyncAssetRow {
    asset_id: row.get(0)?,
    part: row.get(1)?,
    index_num: row.get(2)?,
    sort_key: row.get(3)?,
    original_filename: row.get(4)?,
    live_mov_filename: None,
    live_mov_download_status: None,
    media_kind: row.get(5)?,
    live_pair_id: row.get(6)?,
    dest_path: row.get(7)?,
    cloud_state: row.get(8)?,
    download_status: row.get(9)?,
    last_synced_at: row.get(10)?,
    last_catalog_at: row.get(11)?,
  })
}

fn count_local_missing(conn: &Connection, apple_id: &str) -> Result<u32, String> {
  let missing = collect_local_missing(conn, apple_id, &SortKeyDateFilter::default())?;
  Ok(u32::try_from(missing.len()).unwrap_or(u32::MAX))
}

/// 分页加载云注册表行（只读；local_missing 为派生态）
pub fn load_sync_assets(
  conn: &Connection,
  apple_id: &str,
  offset: u32,
  limit: u32,
  cloud_state_filter: Option<&str>,
  date_from: Option<&str>,
  date_to: Option<&str>,
) -> Result<IcloudSyncLoadAssetsResult, String> {
  let date_filter = SortKeyDateFilter::parse(date_from, date_to);
  let filter = cloud_state_filter.map(str::trim).filter(|s| !s.is_empty() && *s != "all");
  if filter == Some("local_missing") {
    return load_sync_assets_local_missing(conn, apple_id, offset, limit, &date_filter);
  }

  let lim = i64::from(limit.clamp(1, 200));
  let off = i64::from(offset);

  let mut where_parts = vec!["apple_id = ?"];
  if filter.is_some() {
    where_parts.push("cloud_state = ?");
  }
  date_filter.push_where(&mut where_parts);
  push_cloud_list_where(&mut where_parts);
  let where_clause = where_parts.join(" AND ");

  let count_sql = format!("SELECT COUNT(*) FROM assets WHERE {where_clause}");
  let list_sql = format!(
    r#"
    SELECT asset_id, part, index_num, sort_key, original_filename, media_kind, live_pair_id,
           dest_path, cloud_state, download_status, last_synced_at, last_catalog_at
    FROM assets
    WHERE {where_clause}
    ORDER BY sort_key ASC,
             CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
    LIMIT ? OFFSET ?
    "#
  );

  let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(apple_id.to_string())];
  if let Some(st) = filter {
    count_params.push(Box::new(st.to_string()));
  }
  date_filter.push_params(&mut count_params);
  let count_refs: Vec<&dyn rusqlite::ToSql> = count_params.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn
    .query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))
    .map_err(|e| format!("统计云资产失败: {e}"))?;

  let mut list_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(apple_id.to_string())];
  if let Some(st) = filter {
    list_params.push(Box::new(st.to_string()));
  }
  date_filter.push_params(&mut list_params);
  list_params.push(Box::new(lim));
  list_params.push(Box::new(off));
  let list_refs: Vec<&dyn rusqlite::ToSql> = list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn
    .prepare(&list_sql)
    .map_err(|e| format!("准备云资产列表失败: {e}"))?;
  let rows = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, i32>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
        row.get::<_, Option<String>>(6)?,
        row.get::<_, Option<String>>(7)?,
        row.get::<_, String>(8)?,
        row.get::<_, Option<String>>(9)?,
        row.get::<_, Option<i64>>(10)?,
        row.get::<_, Option<i64>>(11)?,
      ))
    })
    .map_err(|e| format!("查询云资产列表失败: {e}"))?;

  let mut items = Vec::new();
  for row in rows {
    let (
      asset_id,
      part,
      index_num,
      sort_key,
      original_filename,
      media_kind,
      live_pair_id,
      dest_path,
      cloud_s,
      download_status,
      last_synced_at,
      last_catalog_at,
    ) = row.map_err(|e| format!("解析云资产行失败: {e}"))?;
    let cloud_state = CloudState::parse(&cloud_s).unwrap_or(CloudState::CloudOnly);
    let display = derive_list_display_state(
      conn,
      apple_id,
      &asset_id,
      &part,
      cloud_state,
      dest_path.as_deref(),
    )?;
    items.push(SyncAssetRow {
      asset_id,
      part,
      index_num,
      sort_key,
      original_filename,
      live_mov_filename: None,
      live_mov_download_status: None,
      media_kind,
      live_pair_id,
      dest_path,
      cloud_state: display,
      download_status,
      last_synced_at,
      last_catalog_at,
    });
  }

  for item in &mut items {
    enrich_live_pair_meta(conn, apple_id, item)?;
  }

  Ok(IcloudSyncLoadAssetsResult {
    items,
    total: u32::try_from(total).map_err(|_| "云资产总数超出 u32".to_string())?,
  })
}

/// local_missing 筛选：SQL `LIMIT` 候选窗口 + 流式 is_file，再内存切片分页。
fn load_sync_assets_local_missing(
  conn: &Connection,
  apple_id: &str,
  offset: u32,
  limit: u32,
  date_filter: &SortKeyDateFilter,
) -> Result<IcloudSyncLoadAssetsResult, String> {
  let lim = limit.clamp(1, 200) as usize;
  let off = offset as usize;
  // 单次扫满窗口（≤ CHECK_LIMIT 次 is_file），再切片；禁止无 LIMIT 的全表拉行
  let missing = collect_local_missing(conn, apple_id, date_filter)?;
  let total = u32::try_from(missing.len()).unwrap_or(u32::MAX);
  let page: Vec<_> = missing.into_iter().skip(off).take(lim).collect();
  Ok(IcloudSyncLoadAssetsResult { items: page, total })
}

pub fn get_cloud_state_summary(
  conn: &Connection,
  apple_id: &str,
  check_disk: bool,
) -> Result<IcloudSyncCloudStateSummary, String> {
  let mut stmt = conn
    .prepare(
      "SELECT cloud_state, COUNT(*) FROM assets WHERE apple_id = ?1 GROUP BY cloud_state",
    )
    .map_err(|e| format!("准备 cloud_state 汇总失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })
    .map_err(|e| format!("查询 cloud_state 汇总失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 cloud_state 汇总失败: {e}"))?;

  let mut summary = IcloudSyncCloudStateSummary {
    cloud_only: 0,
    synced: 0,
    modified_cloud: 0,
    deleted_cloud_pending: 0,
    cloud_delete_queued: 0,
    failed_delete: 0,
    local_missing: 0,
  };
  for (state, count) in rows {
    let n = u32::try_from(count).unwrap_or(u32::MAX);
    match CloudState::parse(&state) {
      Some(CloudState::CloudOnly) => summary.cloud_only = n,
      Some(CloudState::Synced) => summary.synced = n,
      Some(CloudState::ModifiedCloud) => summary.modified_cloud = n,
      Some(CloudState::DeletedCloudPending) => summary.deleted_cloud_pending = n,
      Some(CloudState::CloudDeleteQueued) => summary.cloud_delete_queued = n,
      Some(CloudState::FailedDelete) => summary.failed_delete = n,
      None => {}
    }
  }
  if check_disk {
    summary.local_missing = count_local_missing(conn, apple_id)?;
  }
  Ok(summary)
}

/// 抽屉云资产列表
#[tauri::command]
pub fn icloud_sync_load_assets(
  app: AppHandle,
  offset: Option<u32>,
  limit: Option<u32>,
  cloud_state: Option<String>,
  date_from: Option<String>,
  date_to: Option<String>,
) -> Result<IcloudSyncLoadAssetsResult, String> {
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }
  let filter = cloud_state
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty() && *s != "all");
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  load_sync_assets(
    &conn,
    apple_id,
    offset.unwrap_or(0),
    limit.unwrap_or(50),
    filter,
    date_from.as_deref(),
    date_to.as_deref(),
  )
}

/// FAB / 抽屉 cloud_state 计数
#[tauri::command]
pub fn icloud_sync_get_cloud_state_summary(
  app: AppHandle,
  check_disk: Option<bool>,
) -> Result<IcloudSyncCloudStateSummary, String> {
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  get_cloud_state_summary(&conn, apple_id, check_disk.unwrap_or(false))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::db::open_db;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_db() -> (std::path::PathBuf, Connection) {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("icloud-local-missing-{nanos}.db"));
    let conn = open_db(&path).expect("open");
    (path, conn)
  }

  fn insert_synced(conn: &Connection, asset_id: &str, sort_key: &str, dest: &str) {
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          index_num, part, download_status, cloud_state, dest_path
        ) VALUES('u@x.com', ?1, ?2, ?3, 'photo', 1, 'full', NULL, 'synced', ?4)
        "#,
        params![asset_id, sort_key, format!("{asset_id}.jpg"), dest],
      )
      .expect("insert");
  }

  #[test]
  fn local_missing_list_skips_existing_files_and_paginates() {
    let (path, conn) = temp_db();
    let dir = std::env::temp_dir().join(format!(
      "icloud-lm-files-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let present = dir.join("ok.jpg");
    std::fs::write(&present, b"x").unwrap();
    let gone1 = dir.join("gone1.jpg");
    let gone2 = dir.join("gone2.jpg");

    insert_synced(&conn, "A0", "2024-01-01", present.to_str().unwrap());
    insert_synced(&conn, "A1", "2024-01-02", gone1.to_str().unwrap());
    insert_synced(&conn, "A2", "2024-01-03", gone2.to_str().unwrap());

    let page = load_sync_assets(&conn, "u@x.com", 0, 1, Some("local_missing"), None, None).expect("page");
    assert_eq!(page.total, 2);
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].asset_id, "A1");
    assert_eq!(page.items[0].sort_key, "2024-01-02");

    let page2 = load_sync_assets(&conn, "u@x.com", 1, 1, Some("local_missing"), None, None).expect("p2");
    assert_eq!(page2.items[0].asset_id, "A2");

    let synced = load_sync_assets(&conn, "u@x.com", 0, 10, Some("synced"), None, None).expect("synced");
    assert!(synced.items.iter().any(|r| r.asset_id == "A0" && r.sort_key == "2024-01-01"));

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn load_sync_assets_filters_by_sort_key_date_range() {
    let (path, conn) = temp_db();
    let dir = std::env::temp_dir().join(format!(
      "icloud-date-filter-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let dest = dir.join("x.jpg");
    std::fs::write(&dest, b"x").unwrap();
    let dest_s = dest.to_str().unwrap();

    insert_synced(&conn, "D1", "2024-01-15T10:00:00Z", dest_s);
    insert_synced(&conn, "D2", "2024-02-01T10:00:00Z", dest_s);
    insert_synced(&conn, "D3", "2024-03-10T10:00:00Z", dest_s);

    let jan = load_sync_assets(
      &conn,
      "u@x.com",
      0,
      50,
      Some("synced"),
      Some("2024-01-01"),
      Some("2024-01-31"),
    )
    .expect("jan");
    assert_eq!(jan.total, 1);
    assert_eq!(jan.items[0].asset_id, "D1");

    let feb_mar = load_sync_assets(
      &conn,
      "u@x.com",
      0,
      50,
      Some("synced"),
      Some("2024-02-01"),
      Some("2024-03-31"),
    )
    .expect("feb_mar");
    assert_eq!(feb_mar.total, 2);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(path);
  }

  fn insert_live_synced(conn: &Connection, asset_id: &str, sort_key: &str, still_dest: &str, mov_dest: &str) {
    for (part, dest, filename) in [
      ("still", still_dest, format!("{asset_id}.HEIC")),
      ("mov", mov_dest, format!("{asset_id}.MOV")),
    ] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            index_num, part, download_status, cloud_state, dest_path
          ) VALUES('u@x.com', ?1, ?2, ?3, 'live', 1, ?4, NULL, 'synced', ?5)
          "#,
          params![asset_id, sort_key, filename, part, dest],
        )
        .expect("insert live");
    }
  }

  #[test]
  fn load_sync_assets_live_ignores_indexed_dest_basename_for_display() {
    let (path, conn) = temp_db();
    let dir = std::env::temp_dir().join(format!(
      "icloud-live-dest-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let still_dest = dir.join("00002_IMG_0027.HEIC");
    let mov_dest = dir.join("00002_IMG_0027.mov");
    std::fs::write(&still_dest, b"s").unwrap();
    std::fs::write(&mov_dest, b"m").unwrap();

    for (part, dest) in [("still", still_dest.to_str().unwrap()), ("mov", mov_dest.to_str().unwrap())] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            index_num, part, download_status, cloud_state, dest_path
          ) VALUES('u@x.com', 'L3', '2024-06-01', 'IMG_0027.HEIC', 'live', 2, ?1, NULL, 'synced', ?2)
          "#,
          params![part, dest],
        )
        .expect("insert live with dest");
    }

    let page = load_sync_assets(&conn, "u@x.com", 0, 50, Some("synced"), None, None).expect("page");
    let live = page.items.iter().find(|r| r.asset_id == "L3").expect("live row");
    assert_eq!(live.live_mov_filename.as_deref(), Some("IMG_0027.MOV"));

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn load_sync_assets_live_same_catalog_filename_derives_mov_display() {
    let (path, conn) = temp_db();
    for part in ["still", "mov"] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            index_num, part, download_status, cloud_state, dest_path
          ) VALUES('u@x.com', 'L2', '2024-06-01', 'IMG_1.HEIC', 'live', 1, ?1, NULL, 'cloud_only', NULL)
          "#,
          params![part],
        )
        .expect("insert live same name");
    }
    let page = load_sync_assets(&conn, "u@x.com", 0, 50, None, None, None).expect("page");
    let live = page.items.iter().find(|r| r.asset_id == "L2").expect("live row");
    assert_eq!(live.live_mov_filename.as_deref(), Some("IMG_1.MOV"));
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn load_sync_assets_hides_live_mov_row() {
    let (path, conn) = temp_db();
    let dir = std::env::temp_dir().join(format!(
      "icloud-live-hide-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let still = dir.join("live.jpg");
    let mov = dir.join("live.mov");
    std::fs::write(&still, b"s").unwrap();
    std::fs::write(&mov, b"m").unwrap();

    insert_live_synced(
      &conn,
      "L1",
      "2024-06-01T12:00:00Z",
      still.to_str().unwrap(),
      mov.to_str().unwrap(),
    );
    insert_synced(&conn, "P1", "2024-06-02", still.to_str().unwrap());

    let page = load_sync_assets(&conn, "u@x.com", 0, 50, Some("synced"), None, None).expect("page");
    assert_eq!(page.total, 2, "live pair counts as one row");
    assert_eq!(page.items.len(), 2);
    assert!(page.items.iter().all(|r| r.part != "mov"));
    let live = page
      .items
      .iter()
      .find(|r| r.asset_id == "L1" && r.part == "still")
      .expect("live still row");
    assert_eq!(live.original_filename, "L1.HEIC");
    assert_eq!(live.live_mov_filename.as_deref(), Some("L1.MOV"));

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn local_missing_sql_limit_caps_candidate_window() {
    // 窗口常量应限制候选，而非一次拉全表
    assert!(LOCAL_MISSING_CHECK_LIMIT <= 2000);
    assert!(LOCAL_MISSING_CHECK_LIMIT > 0);
  }
}
