//! HEIC/HEIF 解码
//! 职责：全尺寸像素解码（`image` crate 不支持 HEIC）；缩放不在此层做
//! 顺序：捆绑 FFmpeg → 平台回退（Windows WIC / macOS sips）

use std::path::Path;

use super::ffmpeg;

/// 将 HEIC/HEIF 全尺寸解码为 `DynamicImage`
pub fn decode_heif_file(path: &Path, ffmpeg_bin: Option<&Path>) -> Option<image::DynamicImage> {
  if let Some(ffmpeg) = ffmpeg_bin {
    if let Some(img) = ffmpeg::decode_heif_via_ffmpeg(ffmpeg, path) {
      return Some(img);
    }
  }

  #[cfg(windows)]
  {
    if let Some(img) = decode_heif_windows(path) {
      return Some(img);
    }
  }

  #[cfg(target_os = "macos")]
  {
    if let Some(img) = decode_heif_macos(path) {
      return Some(img);
    }
  }

  None
}

#[cfg(windows)]
fn decode_heif_windows(path: &Path) -> Option<image::DynamicImage> {
  use std::ffi::OsStr;
  use std::os::windows::ffi::OsStrExt;
  use windows::core::PCWSTR;
  use windows::Win32::Foundation::GENERIC_READ;
  use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_WICPixelFormat32bppBGRA,
    IWICImagingFactory, WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom,
    WICDecodeMetadataCacheOnLoad,
  };
  use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
  };

  fn wide_path(path: &Path) -> Vec<u16> {
    OsStr::new(path)
      .encode_wide()
      .chain(Some(0))
      .collect()
  }

  unsafe {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

    let factory: IWICImagingFactory =
      CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok()?;

    let wide = wide_path(path);
    let decoder = factory
      .CreateDecoderFromFilename(
        PCWSTR(wide.as_ptr()),
        None,
        GENERIC_READ,
        WICDecodeMetadataCacheOnLoad,
      )
      .ok()?;

    let frame_count = decoder.GetFrameCount().ok()?;
    let mut best_frame_idx = 0u32;
    let mut best_area = 0u64;
    for frame_idx in 0..frame_count {
      let frame = decoder.GetFrame(frame_idx).ok()?;
      let mut w = 0u32;
      let mut h = 0u32;
      if frame.GetSize(&mut w, &mut h).is_err() || w == 0 || h == 0 {
        continue;
      }
      let area = u64::from(w) * u64::from(h);
      if area > best_area {
        best_area = area;
        best_frame_idx = frame_idx;
      }
    }
    let frame = decoder.GetFrame(best_frame_idx).ok()?;

    let converter = factory.CreateFormatConverter().ok()?;
    converter
      .Initialize(
        &frame,
        &GUID_WICPixelFormat32bppBGRA,
        WICBitmapDitherTypeNone,
        None,
        0.0,
        WICBitmapPaletteTypeCustom,
      )
      .ok()?;

    let mut width = 0u32;
    let mut height = 0u32;
    converter.GetSize(&mut width, &mut height).ok()?;
    if width == 0 || height == 0 {
      return None;
    }

    let stride = width * 4;
    let mut bytes = vec![0u8; stride as usize * height as usize];
    converter
      .CopyPixels(std::ptr::null(), stride, &mut bytes)
      .ok()?;

    let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
    for i in (0..bytes.len()).step_by(4) {
      rgb.push(bytes[i + 2]);
      rgb.push(bytes[i + 1]);
      rgb.push(bytes[i]);
    }

    image::RgbImage::from_raw(width, height, rgb).map(image::DynamicImage::ImageRgb8)
  }
}

#[cfg(target_os = "macos")]
fn decode_heif_macos(path: &Path) -> Option<image::DynamicImage> {
  use std::process::Command;
  use std::time::{SystemTime, UNIX_EPOCH};

  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  let tmp = std::env::temp_dir().join(format!("album_heic_{nanos}.jpg"));

  let status = Command::new("sips")
    .args([
      "-s",
      "format",
      "jpeg",
      path.as_os_str(),
      "--out",
      tmp.as_os_str(),
    ])
    .status()
    .ok();

  let img = if status.map(|s| s.success()).unwrap_or(false) {
    image::open(&tmp).ok()
  } else {
    None
  };

  let _ = std::fs::remove_file(&tmp);
  img
}
