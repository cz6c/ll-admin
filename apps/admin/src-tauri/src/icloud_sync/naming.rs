//! iCloud 同步落盘命名
//! 职责：Windows 非法字符清洗与 `{index:05d}_{stem}.{ext}` 格式化
//! 适用：队列分配 index 后生成最终文件名

/// Windows 文件名非法字符替换为 `_`；连续 `_` 合并为单个
pub fn sanitize_filename(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
  let mut prev_underscore = false;
  for c in input.chars() {
    let ch = if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
      '_'
    } else {
      c
    };
    if ch == '_' {
      if !prev_underscore {
        out.push('_');
        prev_underscore = true;
      }
    } else {
      out.push(ch);
      prev_underscore = false;
    }
  }
  out
}

/// 生成落盘文件名：`{index:05d}_{sanitized_stem}.{ext}`
/// stem 保留 iCloud 原名（清洗后），便于顺序变化时用 index+原名交叉校验是否同一张。
pub fn format_asset_filename(index: u32, stem: &str, ext: &str) -> String {
  let stem = sanitize_filename(stem);
  let ext = ext.trim_start_matches('.');
  format!("{index:05}_{stem}.{ext}")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_strips_windows_illegal() {
    assert_eq!(sanitize_filename("a<b>:c"), "a_b_c");
    assert_eq!(format_asset_filename(1, "x", "jpg"), "00001_x.jpg");
  }
}
