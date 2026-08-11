//! git CLI 封装
//! 职责：解析作者、拉取当日提交；通过 PATH 中的 git 子进程，不开放任意 shell
//! 适用：日报采集阶段

use std::path::Path;
use std::process::Command;

use chrono::{DateTime, Local, NaiveTime, TimeZone};

use super::types::{CommitItem, DailyReportSettings, RepoStat};

/// 本地自然日 `[start, end)` 边界
pub fn local_day_bounds(now: DateTime<Local>) -> (DateTime<Local>, DateTime<Local>) {
  let date = now.date_naive();
  let start = Local
    .from_local_datetime(&date.and_time(NaiveTime::MIN))
    .single()
    .unwrap_or(now);
  let end = start + chrono::Duration::days(1);
  (start, end)
}

/// 解析 `--author`：只读本机 git config（local → global），不提供设置覆盖
pub fn resolve_author(_settings: &DailyReportSettings) -> Result<String, String> {
  if let Ok(email) = git_config("user.email") {
    if !email.is_empty() {
      return Ok(email);
    }
  }
  if let Ok(name) = git_config("user.name") {
    if !name.is_empty() {
      return Ok(name);
    }
  }
  Err("无法解析作者：请配置 git user.email（或 user.name）".into())
}

/// 先读仓库/目录局部配置，再回退全局（不加 --global）
fn git_config(key: &str) -> Result<String, String> {
  let output = Command::new("git")
    .args(["config", "--get", key])
    .output()
    .map_err(|e| format!("执行 git 失败（请确认已安装并在 PATH 中）: {e}"))?;
  if !output.status.success() {
    return Ok(String::new());
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 单仓采集结果
pub struct RepoCollectResult {
  pub commits: Vec<CommitItem>,
  pub stat: RepoStat,
}

/// 采集单仓在时间窗内、匹配作者的提交
pub fn collect_repo_commits(
  repo: &Path,
  author: &str,
  day_start: DateTime<Local>,
  day_end: DateTime<Local>,
) -> RepoCollectResult {
  let repo_name = repo
    .file_name()
    .map(|s| s.to_string_lossy().to_string())
    .unwrap_or_else(|| repo.display().to_string());
  let repo_path = repo.display().to_string();

  let since = day_start.to_rfc3339();
  let until = day_end.to_rfc3339();

  let output = Command::new("git")
    .args([
      "-C",
      repo_path.as_str(),
      "log",
      &format!("--since={since}"),
      &format!("--until={until}"),
      &format!("--author={author}"),
      // 合并提交无业务说明，写入日报只会噪音
      "--no-merges",
      // 从早到晚，便于扫描日志与明细阅读
      "--reverse",
      "--pretty=format:%H%x1f%cI%x1f%s%x1f%b%x1e",
    ])
    .output();

  match output {
    Err(e) => RepoCollectResult {
      commits: vec![],
      stat: RepoStat {
        repo_name,
        repo_path,
        ok: false,
        commit_count: 0,
        error: Some(format!("执行 git log 失败: {e}")),
      },
    },
    Ok(out) if !out.status.success() => {
      let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
      RepoCollectResult {
        commits: vec![],
        stat: RepoStat {
          repo_name,
          repo_path,
          ok: false,
          commit_count: 0,
          error: Some(if err.is_empty() {
            "git log 返回非零".into()
          } else {
            err
          }),
        },
      }
    }
    Ok(out) => {
      let text = String::from_utf8_lossy(&out.stdout);
      let commits = parse_git_log(&text, &repo_name, &repo_path);
      let count = commits.len();
      RepoCollectResult {
        commits,
        stat: RepoStat {
          repo_name,
          repo_path,
          ok: true,
          commit_count: count,
          error: None,
        },
      }
    }
  }
}

/// 解析自定义 pretty 格式（字段 \\x1f，记录 \\x1e）
pub fn parse_git_log(raw: &str, repo_name: &str, repo_path: &str) -> Vec<CommitItem> {
  let mut items = Vec::new();
  for record in raw.split('\u{1e}') {
    let record = record.trim();
    if record.is_empty() {
      continue;
    }
    let parts: Vec<&str> = record.split('\u{1f}').collect();
    if parts.len() < 3 {
      continue;
    }
    items.push(CommitItem {
      repo_name: repo_name.to_string(),
      repo_path: repo_path.to_string(),
      hash: parts[0].trim().to_string(),
      committed_at: parts[1].trim().to_string(),
      subject: parts[2].trim().to_string(),
      body: parts.get(3).map(|s| s.trim().to_string()).unwrap_or_default(),
    });
  }
  items
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::TimeZone;

  #[test]
  fn parse_two_commits() {
    let raw = "aaa\u{1f}2026-08-08T10:00:00+08:00\u{1f}feat: a\u{1f}body-a\u{1e}bbb\u{1f}2026-08-08T11:00:00+08:00\u{1f}fix: b\u{1f}\u{1e}";
    let items = parse_git_log(raw, "demo", "/tmp/demo");
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].hash, "aaa");
    assert_eq!(items[0].subject, "feat: a");
    assert_eq!(items[1].hash, "bbb");
  }

  #[test]
  fn day_bounds_are_local_midnight() {
    let now = Local
      .with_ymd_and_hms(2026, 8, 8, 15, 30, 0)
      .single()
      .unwrap();
    let (start, end) = local_day_bounds(now);
    assert_eq!(start.format("%Y-%m-%d %H:%M").to_string(), "2026-08-08 00:00");
    assert_eq!(end.format("%Y-%m-%d %H:%M").to_string(), "2026-08-09 00:00");
  }
}
