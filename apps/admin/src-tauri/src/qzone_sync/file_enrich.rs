//! 下载落盘后的时间元数据补写
//! 职责：按已解析拍摄时间设置文件 mtime；JPEG 在缺 DateTimeOriginal 时补写
//! 适用：qzone_sync 下载成功或跳过已存在文件后；说明/Comment 等后续再做

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

use exif::{In, Reader, Tag};
use little_exif::exif_tag::ExifTag;
use little_exif::filetype::FileExtension;
use little_exif::metadata::Metadata;

use super::capture_time;

/**
 * 下载后补时间：mtime（图/视频）+ JPEG EXIF（仅缺 DateTimeOriginal 时）
 * @note 失败只打日志，不使下载任务失败
 */
pub fn enrich_downloaded_file(path: &Path, unix_secs: i64) {
  if unix_secs <= 0 {
    return;
  }
  if let Err(e) = apply_file_times(path, unix_secs) {
    log::warn!("qzone_sync: set mtime {}: {e}", path.display());
  }
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  if matches!(ext.as_str(), "jpg" | "jpeg") {
    if let Err(e) = fill_jpeg_datetime_if_missing(path, unix_secs) {
      log::warn!("qzone_sync: fill jpeg exif {}: {e}", path.display());
    }
  }
}

fn apply_file_times(path: &Path, unix_secs: i64) -> Result<(), String> {
  let system = UNIX_EPOCH
    .checked_add(Duration::from_secs(unix_secs as u64))
    .ok_or_else(|| "时间戳溢出".to_string())?;
  let file = File::options()
    .write(true)
    .open(path)
    .map_err(|e| format!("打开文件失败: {e}"))?;
  let times = std::fs::FileTimes::new()
    .set_accessed(system)
    .set_modified(system);
  file
    .set_times(times)
    .map_err(|e| format!("设置文件时间失败: {e}"))?;
  Ok(())
}

fn jpeg_has_datetime_original(path: &Path) -> bool {
  let file = match File::open(path) {
    Ok(f) => f,
    Err(_) => return false,
  };
  let mut reader = BufReader::new(file);
  let Ok(exif) = Reader::new().read_from_container(&mut reader) else {
    return false;
  };
  exif
    .get_field(Tag::DateTimeOriginal, In::PRIMARY)
    .map(|f| {
      let s = f.display_value().to_string();
      let t = s.trim().trim_matches('"');
      t.len() >= 19 && !t.starts_with("0000")
    })
    .unwrap_or(false)
}

/**
 * 仅当文件尚无有效 DateTimeOriginal 时写入拍摄时间（不覆盖相机原 EXIF）
 */
fn fill_jpeg_datetime_if_missing(path: &Path, unix_secs: i64) -> Result<(), String> {
  if jpeg_has_datetime_original(path) {
    return Ok(());
  }
  let exif_str =
    capture_time::to_exif_datetime(unix_secs).ok_or_else(|| "无法格式化 EXIF 时间".to_string())?;
  let mut buf = std::fs::read(path).map_err(|e| format!("读 JPEG 失败: {e}"))?;
  let mut metadata = Metadata::new_from_vec(&buf, FileExtension::JPEG)
    .map_err(|e| format!("解析 JPEG EXIF 失败: {e}"))?;
  metadata.set_tag(ExifTag::DateTimeOriginal(exif_str.clone()));
  // CreateDate ≈ DateTimeDigitized
  metadata.set_tag(ExifTag::CreateDate(exif_str));
  metadata
    .write_to_vec(&mut buf, FileExtension::JPEG)
    .map_err(|e| format!("写入 EXIF 缓冲失败: {e}"))?;
  std::fs::write(path, &buf).map_err(|e| format!("写回 JPEG 失败: {e}"))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::apply_file_times;
  use std::time::{Duration, UNIX_EPOCH};

  #[test]
  fn set_mtime_roundtrip() {
    let dir = std::env::temp_dir().join(format!("qzone_mtime_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("t.bin");
    std::fs::write(&path, b"x").unwrap();
    let secs = 1_700_000_000_i64;
    apply_file_times(&path, secs).unwrap();
    let meta = std::fs::metadata(&path).unwrap();
    let modified = meta.modified().unwrap();
    let expected = UNIX_EPOCH + Duration::from_secs(secs as u64);
    let delta = modified
      .duration_since(expected)
      .or_else(|_| expected.duration_since(modified))
      .unwrap();
    assert!(delta.as_secs() <= 1);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_dir(&dir);
  }
}
