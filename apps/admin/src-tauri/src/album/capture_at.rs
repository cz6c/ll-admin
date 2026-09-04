//! 相册拍摄时间解析
//! 职责：缩略图就绪后写入 media.db 的 capture_at
//! 优先级：iCloud sync state.db（dest_path）→ 本地 EXIF DateTimeOriginal
//! 适用：thumbnail pipeline 成功后 / 已有缩略图缺字段回填

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use exif::{In, Reader, Tag};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use tauri::AppHandle;

use crate::icloud_sync::state_db_path;

/// 可复用的解析器：整批回填时只打开一次 sync 只读库
pub struct CaptureAtResolver {
  sync: Option<Connection>,
}

impl CaptureAtResolver {
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

  /// 解析单文件拍摄时间；两端皆无则 None
  pub fn resolve(&self, path: &str) -> Option<String> {
    if let Some(ref conn) = self.sync {
      if let Some(v) = lookup_sync_capture_at(conn, path) {
        return Some(v);
      }
    }
    read_exif_capture_at(Path::new(path))
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

/// 从 EXIF 读拍摄时间，归一成可被 dayjs 解析的 ISO 风格字符串
fn read_exif_capture_at(path: &Path) -> Option<String> {
  let file = File::open(path).ok()?;
  let mut reader = BufReader::new(file);
  let exif = Reader::new().read_from_container(&mut reader).ok()?;
  let field = exif
    .get_field(Tag::DateTimeOriginal, In::PRIMARY)
    .or_else(|| exif.get_field(Tag::DateTimeDigitized, In::PRIMARY))
    .or_else(|| exif.get_field(Tag::DateTime, In::PRIMARY))?;
  let raw = field.display_value().to_string();
  normalize_exif_datetime(&raw)
}

/// EXIF 常见 `YYYY:MM:DD HH:MM:SS` → `YYYY-MM-DDTHH:MM:SS`
fn normalize_exif_datetime(raw: &str) -> Option<String> {
  let s = raw.trim().trim_matches('"');
  if s.len() < 19 {
    return None;
  }
  let bytes = s.as_bytes();
  // YYYY:MM:DD HH:MM:SS
  if bytes[4] == b':' && bytes[7] == b':' && bytes[10] == b' ' && bytes[13] == b':' && bytes[16] == b':'
  {
    let mut out = s[..19].to_string();
    out.replace_range(4..5, "-");
    out.replace_range(7..8, "-");
    out.replace_range(10..11, "T");
    return Some(out);
  }
  // 已是 ISO / 其它可展示原串
  if s.contains('-') {
    return Some(s.to_string());
  }
  None
}

#[cfg(test)]
mod tests {
  use super::normalize_exif_datetime;

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
}
