//! 用户修改拍摄时间时可选写回 EXIF
//! 职责：按 unix 秒写入 DateTimeOriginal / CreateDate
//! 适用：album_set_capture_at 勾选 writeExif 时
//! @note 扩展名不可信：QQ 空间落盘常为 `.jpg`，内容却是 PNG。按魔数选容器，否则 little_exif 会报 Wrong signature

use std::path::Path;

use chrono::{Local, TimeZone};
use little_exif::exif_tag::ExifTag;
use little_exif::filetype::FileExtension;
use little_exif::metadata::Metadata;

/// 能写入 EXIF 的容器；与扩展名无关
enum ExifContainer {
  Jpeg,
  Png,
  Webp,
}

impl ExifContainer {
  fn file_extension(&self) -> FileExtension {
    match self {
      // 与 little_exif `from_path("png")` 一致，EXIF 放 zTXt
      Self::Png => FileExtension::PNG { as_zTXt_chunk: true },
      Self::Jpeg => FileExtension::JPEG,
      Self::Webp => FileExtension::WEBP,
    }
  }
}

/// 将拍摄时间写入文件 EXIF（JPEG / PNG / WebP；看内容不看扩展名）
pub fn write_capture_at_exif(path: &Path, unix_secs: i64) -> Result<(), String> {
  if unix_secs <= 0 {
    return Err("无效时间戳".into());
  }
  let exif_str = to_exif_datetime(unix_secs).ok_or_else(|| "无法格式化 EXIF 时间".to_string())?;
  let mut buf = std::fs::read(path).map_err(|e| format!("读图片失败: {e}"))?;
  let Some(container) = sniff_exif_container(&buf) else {
    return Err("文件内容不是 JPEG / PNG / WebP，已跳过 EXIF".into());
  };
  let ext = container.file_extension();

  // JPEG 无 APP1 时不要让 little_exif 去解析，否则会刷 ERROR
  let mut metadata = if matches!(container, ExifContainer::Jpeg) && !jpeg_buffer_has_exif_app1(&buf) {
    Metadata::new()
  } else {
    Metadata::new_from_vec(&buf, ext).unwrap_or_else(|e| {
      log::debug!("album: exif decode skipped ({e}); rewrite with empty Metadata");
      Metadata::new()
    })
  };

  metadata.set_tag(ExifTag::DateTimeOriginal(exif_str.clone()));
  metadata.set_tag(ExifTag::CreateDate(exif_str));
  metadata
    .write_to_vec(&mut buf, ext)
    .map_err(|e| format!("写入 EXIF 缓冲失败: {e}"))?;
  std::fs::write(path, &buf).map_err(|e| format!("写回图片失败: {e}"))?;
  Ok(())
}

fn to_exif_datetime(unix_secs: i64) -> Option<String> {
  let dt = Local.timestamp_opt(unix_secs, 0).single()?;
  Some(dt.format("%Y:%m:%d %H:%M:%S").to_string())
}

fn sniff_exif_container(buf: &[u8]) -> Option<ExifContainer> {
  if buf.len() >= 3 && buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff {
    return Some(ExifContainer::Jpeg);
  }
  if buf.starts_with(b"\x89PNG\r\n\x1a\n") {
    return Some(ExifContainer::Png);
  }
  if buf.len() >= 12 && buf.starts_with(b"RIFF") && &buf[8..12] == b"WEBP" {
    return Some(ExifContainer::Webp);
  }
  None
}

/// 快速扫 APP1：是否已有 Exif 段（避免无段时 little_exif 读库刷 ERROR）
fn jpeg_buffer_has_exif_app1(data: &[u8]) -> bool {
  if data.len() < 4 || data[0] != 0xff || data[1] != 0xd8 {
    return false;
  }
  let mut i = 2usize;
  while i + 1 < data.len() {
    if data[i] != 0xff {
      return false;
    }
    while i < data.len() && data[i] == 0xff {
      i += 1;
    }
    if i >= data.len() {
      break;
    }
    let marker = data[i];
    i += 1;
    if marker == 0x01 || (0xd0..=0xd9).contains(&marker) {
      if marker == 0xd9 {
        break;
      }
      continue;
    }
    if i + 1 >= data.len() {
      break;
    }
    let len = u16::from_be_bytes([data[i], data[i + 1]]) as usize;
    if len < 2 || i + len > data.len() {
      break;
    }
    if marker == 0xe1 {
      return true;
    }
    i += len;
    if marker == 0xda {
      break;
    }
  }
  false
}

#[cfg(test)]
mod tests {
  use super::sniff_exif_container;
  use super::ExifContainer;

  #[test]
  fn sniff_png_even_if_callers_think_it_is_jpeg() {
    let buf = b"\x89PNG\r\n\x1a\nrest";
    assert!(matches!(sniff_exif_container(buf), Some(ExifContainer::Png)));
    assert!(matches!(
      sniff_exif_container(&[0xff, 0xd8, 0xff, 0xe0]),
      Some(ExifContainer::Jpeg)
    ));
  }

  #[test]
  fn write_exif_into_png_bytes() {
    // 1×1 PNG。QQ 空间的 .jpg 常是这种容器
    let png: &[u8] = &[
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x01, 0x73, 0x52, 0x47,
      0x42, 0x00, 0xAE, 0xCE, 0x1C, 0xE9, 0x00, 0x00, 0x00, 0x04, 0x67, 0x41, 0x4D, 0x41, 0x00, 0x00, 0xB1, 0x8F, 0x0B, 0xFC,
      0x61, 0x05, 0x00, 0x00, 0x00, 0x09, 0x70, 0x48, 0x59, 0x73, 0x00, 0x00, 0x0E, 0xC3, 0x00, 0x00, 0x0E, 0xC3, 0x01, 0xC7,
      0x6F, 0xA8, 0x64, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x18, 0x57, 0x63, 0xF8, 0xCF, 0xC0, 0xF0, 0x1F, 0x00,
      0x05, 0x00, 0x01, 0xFF, 0xA6, 0x5C, 0x9B, 0x5D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let path = std::env::temp_dir().join("album_exif_png_probe.png");
    std::fs::write(&path, png).expect("write fixture");
    super::write_capture_at_exif(&path, 1_300_000_000).expect("png exif");
    let out = std::fs::read(&path).expect("read back");
    assert!(out.windows(4).any(|w| w == b"exif" || w == b"EXIF" || w == b"eXIf" || w == b"zTXt" || w == b"tEXt"));
    let _ = std::fs::remove_file(&path);
  }
}
