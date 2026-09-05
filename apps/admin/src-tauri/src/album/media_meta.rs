//! 相册媒体元数据（拍摄时间 / 机型）
//! 职责：缩略图就绪后补写 media.db 的 capture_at、camera；**不写尺寸**
//! 尺寸真源：图/HEIC=解码；单独视频=打开 ensure_playback 时 ffprobe
//! 优先级：capture_at = sync → EXIF；camera = EXIF Make/Model（仅补空）
//! 适用：thumbnail pipeline 成功后 / 已有缩略图缺字段回填

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use exif::{In, Reader, Tag};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use tauri::AppHandle;

use crate::icloud_sync::state_db_path;

/// 单次 EXIF/sync 解析结果；调用方按「仅补空」落库
#[derive(Debug, Clone, Default)]
pub struct MediaMetaFill {
  pub capture_at: Option<String>,
  pub camera: Option<String>,
}

impl MediaMetaFill {
  pub fn is_empty(&self) -> bool {
    self.capture_at.is_none() && self.camera.is_none()
  }
}

/// 可复用的解析器：整批回填时只打开一次 sync 只读库
pub struct MediaMetaResolver {
  sync: Option<Connection>,
}

impl MediaMetaResolver {
  /// 打开 sync state.db（只读）；不存在或打不开则仅走 EXIF
  pub fn new(app: &AppHandle) -> Self {
    let sync = state_db_path(app).ok().and_then(|path| {
      if !path.is_file() {
        return None;
      }
      Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()
    });
    Self { sync }
  }

  /// 解析建议写入的拍摄时间与机型
  pub fn resolve(&self, path: &str) -> MediaMetaFill {
    let mut fill = MediaMetaFill::default();

    if let Some(ref conn) = self.sync {
      fill.capture_at = lookup_sync_capture_at(conn, path);
    }

    let exif = read_exif_bundle(Path::new(path));
    if fill.capture_at.is_none() {
      fill.capture_at = exif.capture_at;
    }
    fill.camera = exif.camera;
    fill
  }
}

fn lookup_sync_capture_at(conn: &Connection, path: &str) -> Option<String> {
  let try_one = |p: &str| -> Option<String> {
    conn
      .query_row(
        "SELECT capture_at FROM assets
         WHERE dest_path = ?1
           AND capture_at IS NOT NULL
           AND trim(capture_at) != ''
         LIMIT 1",
        params![p],
        |row| row.get::<_, String>(0),
      )
      .optional()
      .ok()
      .flatten()
  };

  try_one(path)
    .or_else(|| {
      let alt = path.replace('/', "\\");
      if alt != path {
        try_one(&alt)
      } else {
        None
      }
    })
    .or_else(|| {
      let alt = path.replace('\\', "/");
      if alt != path {
        try_one(&alt)
      } else {
        None
      }
    })
}

struct ExifBundle {
  capture_at: Option<String>,
  camera: Option<String>,
}

fn read_exif_bundle(path: &Path) -> ExifBundle {
  let empty = ExifBundle {
    capture_at: None,
    camera: None,
  };
  let file = match File::open(path) {
    Ok(f) => f,
    Err(_) => return empty,
  };
  let mut reader = BufReader::new(file);
  let exif = match Reader::new().read_from_container(&mut reader) {
    Ok(e) => e,
    Err(_) => return empty,
  };

  let capture_at = exif
    .get_field(Tag::DateTimeOriginal, In::PRIMARY)
    .or_else(|| exif.get_field(Tag::DateTimeDigitized, In::PRIMARY))
    .or_else(|| exif.get_field(Tag::DateTime, In::PRIMARY))
    .and_then(|f| normalize_exif_datetime(&f.display_value().to_string()));

  let make = exif
    .get_field(Tag::Make, In::PRIMARY)
    .map(|f| f.display_value().to_string())
    .map(|s| s.trim().trim_matches('"').to_string())
    .filter(|s| !s.is_empty());
  let model = exif
    .get_field(Tag::Model, In::PRIMARY)
    .map(|f| f.display_value().to_string())
    .map(|s| s.trim().trim_matches('"').to_string())
    .filter(|s| !s.is_empty());
  let camera = format_camera(make.as_deref(), model.as_deref());

  ExifBundle {
    capture_at,
    camera,
  }
}

/// Make + Model → 展示串；Model 已含 Make 时不重复
fn format_camera(make: Option<&str>, model: Option<&str>) -> Option<String> {
  let make = make.map(str::trim).filter(|s| !s.is_empty());
  let model = model.map(str::trim).filter(|s| !s.is_empty());
  match (make, model) {
    (None, None) => None,
    (Some(m), None) => Some(m.to_string()),
    (None, Some(model)) => Some(model.to_string()),
    (Some(make), Some(model)) => {
      if model.to_lowercase().starts_with(&make.to_lowercase()) {
        Some(model.to_string())
      } else {
        Some(format!("{make} {model}"))
      }
    }
  }
}

/// EXIF 常见 `YYYY:MM:DD HH:MM:SS` → `YYYY-MM-DDTHH:MM:SS`
fn normalize_exif_datetime(raw: &str) -> Option<String> {
  let s = raw.trim().trim_matches('"');
  if s.len() < 19 {
    return None;
  }
  let bytes = s.as_bytes();
  if bytes[4] == b':'
    && bytes[7] == b':'
    && bytes[10] == b' '
    && bytes[13] == b':'
    && bytes[16] == b':'
  {
    let mut out = s[..19].to_string();
    out.replace_range(4..5, "-");
    out.replace_range(7..8, "-");
    out.replace_range(10..11, "T");
    return Some(out);
  }
  if s.contains('-') {
    return Some(s.to_string());
  }
  None
}

#[cfg(test)]
mod tests {
  use super::{format_camera, normalize_exif_datetime};

  #[test]
  fn normalize_classic_exif() {
    assert_eq!(
      normalize_exif_datetime("2024:01:15 12:30:45"),
      Some("2024-01-15T12:30:45".into())
    );
  }

  #[test]
  fn normalize_iso_passthrough() {
    assert_eq!(
      normalize_exif_datetime("2024-01-15T12:30:45Z"),
      Some("2024-01-15T12:30:45Z".into())
    );
  }

  #[test]
  fn normalize_rejects_short() {
    assert_eq!(normalize_exif_datetime("2024"), None);
  }

  #[test]
  fn camera_dedupes_make_prefix() {
    assert_eq!(
      format_camera(Some("Apple"), Some("Apple iPhone 15 Pro")),
      Some("Apple iPhone 15 Pro".into())
    );
    assert_eq!(
      format_camera(Some("Canon"), Some("EOS R5")),
      Some("Canon EOS R5".into())
    );
  }
}
