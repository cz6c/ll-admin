//! 相册内容指纹（判重用）
//! 职责：对 JPEG/PNG 去掉 EXIF/说明类元数据后再 BLAKE3，使「仅补写拍摄时间」的新旧文件仍同哈希
//! 适用：`album_find_local_duplicates`；算法名 bump 后旧缓存自动失效

use std::io::Read;
use std::path::Path;

/// 当前内容指纹算法（换实现必须改名，避免与整文件 blake3 混用）
pub const CONTENT_HASH_ALGO: &str = "blake3-no-meta-v1";

/**
 * 计算判重用内容指纹
 * - jpg/jpeg：跳过 APP1 Exif / XMP 后再哈希
 * - png：跳过 eXIf / tEXt / zTXt / iTXt 后再哈希
 * - 其它：整文件 BLAKE3（视频等无 EXIF 补写路径）
 */
pub fn compute_content_hash_hex(path: &str) -> Option<String> {
  let path = path.trim();
  if path.is_empty() {
    return None;
  }
  let ext = Path::new(path)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match ext.as_str() {
    "jpg" | "jpeg" => hash_jpeg_strip_exif_xmp(path),
    "png" => hash_png_strip_text_exif(path),
    _ => hash_file_full(path),
  }
}

fn hash_file_full(path: &str) -> Option<String> {
  let mut file = std::fs::File::open(path).ok()?;
  let mut hasher = blake3::Hasher::new();
  let mut buf = [0u8; 65536];
  loop {
    let n = file.read(&mut buf).ok()?;
    if n == 0 {
      break;
    }
    hasher.update(&buf[..n]);
  }
  Some(hasher.finalize().to_hex().to_string())
}

fn finalize(hasher: blake3::Hasher) -> String {
  hasher.finalize().to_hex().to_string()
}

/// JPEG：保留图像比特流，丢弃 Exif/XMP 的 APP1（我们补写的拍摄时间在此）
fn hash_jpeg_strip_exif_xmp(path: &str) -> Option<String> {
  let data = std::fs::read(path).ok()?;
  if data.len() < 4 || data[0] != 0xff || data[1] != 0xd8 {
    return hash_file_full(path);
  }
  let mut hasher = blake3::Hasher::new();
  hasher.update(&[0xff, 0xd8]);
  let mut i = 2usize;
  while i + 1 < data.len() {
    if data[i] != 0xff {
      // 熵编码区：剩余全部计入
      hasher.update(&data[i..]);
      return Some(finalize(hasher));
    }
    // 跳过填充 0xFF
    while i < data.len() && data[i] == 0xff {
      i += 1;
    }
    if i >= data.len() {
      break;
    }
    let marker = data[i];
    i += 1;
    // 独立标记（无长度）
    if marker == 0x01 || (0xd0..=0xd9).contains(&marker) {
      hasher.update(&[0xff, marker]);
      if marker == 0xd9 {
        return Some(finalize(hasher));
      }
      continue;
    }
    if i + 1 >= data.len() {
      break;
    }
    let len = u16::from_be_bytes([data[i], data[i + 1]]) as usize;
    if len < 2 || i + len > data.len() {
      // 畸形则退回整文件
      return hash_file_full(path);
    }
    let segment = &data[i..i + len];
    let payload = &segment[2..];
    let skip = marker == 0xe1 && is_exif_or_xmp_payload(payload);
    if !skip {
      hasher.update(&[0xff, marker]);
      hasher.update(segment);
    }
    i += len;
    // SOS 之后是压缩数据直到 EOI（可能含 FF 但不是标准 marker 扫描）
    if marker == 0xda {
      hasher.update(&data[i..]);
      return Some(finalize(hasher));
    }
  }
  Some(finalize(hasher))
}

fn is_exif_or_xmp_payload(payload: &[u8]) -> bool {
  if payload.starts_with(b"Exif\0\0") || payload.starts_with(b"Exif\0") {
    return true;
  }
  // XMP 常以 null 结尾的 URI 开头
  const XMP: &[u8] = b"http://ns.adobe.com/xap/1.0/";
  payload.len() >= XMP.len() && &payload[..XMP.len()] == XMP
}

/// PNG：跳过文本与 eXIf 辅助块
fn hash_png_strip_text_exif(path: &str) -> Option<String> {
  let data = std::fs::read(path).ok()?;
  const SIG: &[u8] = b"\x89PNG\r\n\x1a\n";
  if data.len() < 8 || &data[..8] != SIG {
    return hash_file_full(path);
  }
  let mut hasher = blake3::Hasher::new();
  hasher.update(SIG);
  let mut i = 8usize;
  while i + 12 <= data.len() {
    let len = u32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as usize;
    let typ = &data[i + 4..i + 8];
    let total = 12 + len;
    if i + total > data.len() {
      return hash_file_full(path);
    }
    let skip = matches!(typ, b"eXIf" | b"tEXt" | b"zTXt" | b"iTXt");
    if !skip {
      hasher.update(&data[i..i + total]);
    }
    i += total;
    if typ == b"IEND" {
      break;
    }
  }
  Some(finalize(hasher))
}

/// 供测试：对内存 JPEG 缓冲做同样剥离哈希
#[cfg(test)]
pub(crate) fn hash_jpeg_bytes_for_test(data: &[u8]) -> Option<String> {
  let dir = std::env::temp_dir().join(format!("chash_{}", std::process::id()));
  let _ = std::fs::create_dir_all(&dir);
  let path = dir.join("t.jpg");
  std::fs::write(&path, data).ok()?;
  let h = hash_jpeg_strip_exif_xmp(&path.to_string_lossy());
  let _ = std::fs::remove_file(&path);
  h
}

#[cfg(test)]
mod tests {
  use super::*;

  /// 最小 JPEG：SOI + APP1 Exif 伪段 + EOI
  fn jpeg_with_exif(extra: &[u8]) -> Vec<u8> {
    let mut exif_body = b"Exif\0\0".to_vec();
    exif_body.extend_from_slice(extra);
    let len = (exif_body.len() + 2) as u16;
    let mut out = vec![0xff, 0xd8, 0xff, 0xe1];
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(&exif_body);
    out.extend_from_slice(&[0xff, 0xd9]);
    out
  }

  #[test]
  fn jpeg_different_exif_same_hash() {
    let a = jpeg_with_exif(b"AAAA");
    let b = jpeg_with_exif(b"BBBBBB");
    let ha = hash_jpeg_bytes_for_test(&a).expect("a");
    let hb = hash_jpeg_bytes_for_test(&b).expect("b");
    assert_eq!(ha, hb);
  }

  #[test]
  fn jpeg_without_app1_matches_stripped() {
    let with = jpeg_with_exif(b"TIME");
    let bare = vec![0xff, 0xd8, 0xff, 0xd9];
    let h1 = hash_jpeg_bytes_for_test(&with).expect("with");
    let h2 = hash_jpeg_bytes_for_test(&bare).expect("bare");
    assert_eq!(h1, h2);
  }
}
