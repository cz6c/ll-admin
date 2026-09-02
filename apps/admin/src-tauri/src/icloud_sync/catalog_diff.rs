//! iCloud catalog 降级 B：全量枚举 + 与 assets 现有行 diff
//! 职责：fingerprint 比对、added/modified/unchanged 分类；catalog 侧无 delta API 时使用
//! 适用：start_job 全量 catalog diff

use std::collections::{HashMap, HashSet};

use super::types::{AssetRow, CloudState, MediaKind};

/// catalog 行相对库内基线的变更类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogDeltaKind {
  /// catalog 新见、库内无行
  Added,
  /// fingerprint / changeTag 变化，或云端删后重新出现 → 需重下
  Modified,
  /// fingerprint 与 changeTag 一致，仅产品元数据（时间/GPS/CPL 名）需刷新
  MetadataRefresh,
  /// fingerprint、changeTag、产品元数据均一致 → 仅批量刷新 last_catalog_at
  Unchanged,
}

/// 库内已有行的 diff 基线
#[derive(Debug, Clone)]
pub struct ExistingAssetBaseline {
  pub fingerprint: String,
  pub cloud_state: CloudState,
  pub cpl_asset_record_name: Option<String>,
  pub cpl_asset_change_tag: Option<String>,
  pub capture_at: Option<String>,
  pub added_at: Option<String>,
  pub latitude: Option<f64>,
  pub longitude: Option<f64>,
}

/// catalog 元数据指纹（降级 B；sidecar 无 native delta 时用）
pub fn catalog_fingerprint(sort_key: &str, filename: &str, media_kind: MediaKind) -> String {
  format!("{}|{}|{}", sort_key, filename, media_kind.as_str())
}

fn norm_tag(value: &Option<String>) -> Option<&str> {
  value.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

fn product_meta_changed(base: &ExistingAssetBaseline, row: &AssetRow) -> bool {
  base.capture_at != row.capture_at
    || base.added_at != row.added_at
    || base.latitude != row.latitude
    || base.longitude != row.longitude
    || norm_tag(&base.cpl_asset_record_name) != norm_tag(&row.cpl_asset_record_name)
}

/// 对单条 catalog 行分类
pub fn classify_catalog_row(
  row: &AssetRow,
  existing: &HashMap<(String, String), ExistingAssetBaseline>,
) -> CatalogDeltaKind {
  let key = (row.asset_id.clone(), row.part.as_str().to_string());
  let fp = catalog_fingerprint(&row.sort_key, &row.original_filename, row.media_kind);
  match existing.get(&key) {
    None => CatalogDeltaKind::Added,
    Some(base) if base.cloud_state == CloudState::DeletedCloudPending => CatalogDeltaKind::Modified,
    Some(base) if base.fingerprint != fp => CatalogDeltaKind::Modified,
    Some(base) if norm_tag(&base.cpl_asset_change_tag) != norm_tag(&row.cpl_asset_change_tag) => {
      CatalogDeltaKind::Modified
    }
    Some(base) if product_meta_changed(base, row) => CatalogDeltaKind::MetadataRefresh,
    Some(_) => CatalogDeltaKind::Unchanged,
  }
}

/// 批量分类并收集 catalog 侧全部 (asset_id, part) 键
pub fn classify_catalog_rows(
  rows: &[AssetRow],
  existing: &HashMap<(String, String), ExistingAssetBaseline>,
) -> (Vec<(AssetRow, CatalogDeltaKind)>, HashSet<(String, String)>) {
  let mut catalog_keys = HashSet::new();
  let mut out = Vec::with_capacity(rows.len());
  for row in rows {
    let key = (row.asset_id.clone(), row.part.as_str().to_string());
    catalog_keys.insert(key);
    let kind = classify_catalog_row(row, existing);
    out.push((row.clone(), kind));
  }
  (out, catalog_keys)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::types::{AssetPart, AssetStatus};

  fn sample_row(asset_id: &str, filename: &str) -> AssetRow {
    AssetRow {
      id: 0,
      apple_id: "a@b.com".into(),
      asset_id: asset_id.into(),
      sort_key: "2024-01-01".into(),
      capture_at: Some("2024-01-01".into()),
      added_at: Some("2024-01-02".into()),
      latitude: None,
      longitude: None,
      original_filename: filename.into(),
      media_kind: MediaKind::Photo,
      live_pair_id: None,
      index_num: 1,
      part: AssetPart::Full,
      download_status: Some(AssetStatus::Done),
      active_job_id: None,
      dest_path: Some("/x.jpg".into()),
      cloud_state: CloudState::Synced,
      last_synced_at: None,
      last_catalog_at: None,
      last_error: None,
      attempt_count: 0,
      cpl_asset_record_name: None,
      cpl_asset_change_tag: None,
    }
  }

  fn baseline(fp: &str, cloud_state: CloudState) -> ExistingAssetBaseline {
    ExistingAssetBaseline {
      fingerprint: fp.into(),
      cloud_state,
      cpl_asset_record_name: None,
      cpl_asset_change_tag: None,
      capture_at: Some("2024-01-01".into()),
      added_at: Some("2024-01-02".into()),
      latitude: None,
      longitude: None,
    }
  }

  #[test]
  fn classify_added_when_missing() {
    let row = sample_row("A1", "a.jpg");
    assert_eq!(classify_catalog_row(&row, &HashMap::new()), CatalogDeltaKind::Added);
  }

  #[test]
  fn classify_unchanged_when_fingerprint_matches() {
    let row = sample_row("A1", "a.jpg");
    let fp = catalog_fingerprint(&row.sort_key, &row.original_filename, row.media_kind);
    let mut existing = HashMap::new();
    existing.insert(
      ("A1".into(), "full".into()),
      baseline(&fp, CloudState::Synced),
    );
    assert_eq!(classify_catalog_row(&row, &existing), CatalogDeltaKind::Unchanged);
  }

  #[test]
  fn classify_modified_when_filename_changes() {
    let row = sample_row("A1", "b.jpg");
    let mut existing = HashMap::new();
    existing.insert(
      ("A1".into(), "full".into()),
      baseline(
        &catalog_fingerprint(&row.sort_key, "a.jpg", row.media_kind),
        CloudState::Synced,
      ),
    );
    assert_eq!(classify_catalog_row(&row, &existing), CatalogDeltaKind::Modified);
  }

  #[test]
  fn deleted_cloud_pending_in_catalog_is_modified() {
    let row = sample_row("A1", "a.jpg");
    let fp = catalog_fingerprint(&row.sort_key, &row.original_filename, row.media_kind);
    let mut existing = HashMap::new();
    existing.insert(
      ("A1".into(), "full".into()),
      baseline(&fp, CloudState::DeletedCloudPending),
    );
    assert_eq!(classify_catalog_row(&row, &existing), CatalogDeltaKind::Modified);
  }

  #[test]
  fn classify_modified_when_change_tag_changes() {
    let row = sample_row("A1", "a.jpg");
    let fp = catalog_fingerprint(&row.sort_key, &row.original_filename, row.media_kind);
    let mut existing = HashMap::new();
    let mut base = baseline(&fp, CloudState::Synced);
    base.cpl_asset_change_tag = Some("old".into());
    existing.insert(("A1".into(), "full".into()), base);
    let mut row = row;
    row.cpl_asset_change_tag = Some("new".into());
    assert_eq!(classify_catalog_row(&row, &existing), CatalogDeltaKind::Modified);
  }

  #[test]
  fn classify_metadata_refresh_when_only_gps_changes() {
    let row = sample_row("A1", "a.jpg");
    let fp = catalog_fingerprint(&row.sort_key, &row.original_filename, row.media_kind);
    let mut existing = HashMap::new();
    existing.insert(("A1".into(), "full".into()), baseline(&fp, CloudState::Synced));
    let mut row = row;
    row.latitude = Some(31.2);
    row.longitude = Some(121.5);
    assert_eq!(classify_catalog_row(&row, &existing), CatalogDeltaKind::MetadataRefresh);
  }
}
