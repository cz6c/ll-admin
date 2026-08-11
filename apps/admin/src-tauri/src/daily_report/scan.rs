//! 工作区 git 仓库扫描
//! 职责：在根目录下按排除名查找含 `.git` 的仓库路径；支持全扫或限深
//! 适用：日报流水线采仓前

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

/// 扫描工作区下的 git 仓库（目录内存在 `.git` 文件或目录）
///
/// `scan_depth`：相对根的最大深度（根为 0）；**0 表示全扫不限深度**
pub fn scan_git_repos(
  root: &Path,
  scan_depth: u32,
  exclude_dir_names: &[String],
) -> Result<Vec<PathBuf>, String> {
  if !root.is_dir() {
    return Err(format!("工作区不存在或不是目录: {}", root.display()));
  }

  let excludes: HashSet<&str> = exclude_dir_names.iter().map(|s| s.as_str()).collect();
  let mut repos = Vec::new();

  // 根自身若是 git 仓也纳入
  if root.join(".git").exists() {
    repos.push(root.to_path_buf());
  }

  let mut walker = WalkDir::new(root).min_depth(1);
  // 0 = 全扫：不设 max_depth
  if scan_depth > 0 {
    walker = walker.max_depth(scan_depth as usize);
  }
  let walker = walker.into_iter().filter_entry(|e| {
    let name = e.file_name().to_string_lossy();
    if e.depth() == 0 {
      return true;
    }
    !excludes.contains(name.as_ref()) && name != ".git"
  });

  for entry in walker {
    let entry = entry.map_err(|e| format!("扫描工作区失败: {e}"))?;
    if !entry.file_type().is_dir() {
      continue;
    }
    let path = entry.path();
    if path.join(".git").exists() {
      repos.push(path.to_path_buf());
    }
  }

  repos.sort();
  repos.dedup();
  Ok(repos)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn scan_finds_nested_repo_and_skips_node_modules() {
    let tmp = std::env::temp_dir().join(format!("ll-admin-scan-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("proj-a/.git")).unwrap();
    fs::create_dir_all(tmp.join("node_modules/fake/.git")).unwrap();
    fs::create_dir_all(tmp.join("group/proj-b/.git")).unwrap();

    let found = scan_git_repos(
      &tmp,
      0, // 全扫
      &["node_modules".into(), "dist".into()],
    )
    .unwrap();

    let names: Vec<_> = found
      .iter()
      .map(|p| p.strip_prefix(&tmp).unwrap().to_string_lossy().replace('\\', "/"))
      .collect();
    assert!(names.iter().any(|n| n == "proj-a"));
    assert!(names.iter().any(|n| n == "group/proj-b"));
    assert!(!names.iter().any(|n| n.contains("node_modules")));

    let _ = fs::remove_dir_all(&tmp);
  }
}
