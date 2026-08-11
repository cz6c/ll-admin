//! 扫描日志文本格式化
//! 职责：将作者、日期范围、各仓提交整理为可读日志（无 AI 时直接展示 / 有 AI 时作为输入）
//! 适用：日报流水线采仓后

use chrono::{DateTime, Local, NaiveDateTime};

use super::types::{CommitItem, RepoStat};

/// 生成扫描日志文本（与既有脚本风格对齐）
pub fn format_scan_log(
  author: &str,
  day_start: DateTime<Local>,
  day_end: DateTime<Local>,
  repo_stats: &[RepoStat],
  commits: &[CommitItem],
) -> String {
  let mut out = String::new();
  out.push_str(&format!("查询作者: {author}\n"));
  out.push_str(&format!(
    "日期范围: {} 至 {}\n",
    day_start.format("%Y-%m-%d %H:%M"),
    day_end.format("%Y-%m-%d %H:%M")
  ));
  out.push_str("----------------------------------------\n");

  for stat in repo_stats {
    out.push_str(&format!("=== Repository: {} ===\n", stat.repo_name));
    if !stat.ok {
      let err = stat.error.as_deref().unwrap_or("采集失败");
      out.push_str(&format!("(采集失败: {err})\n"));
      continue;
    }
    let repo_commits: Vec<&CommitItem> = commits
      .iter()
      .filter(|c| c.repo_path == stat.repo_path || c.repo_name == stat.repo_name)
      .collect();
    if repo_commits.is_empty() {
      out.push_str("(无今天提交)\n");
    } else {
      for c in repo_commits {
        let hash = short_hash(&c.hash);
        let time = format_commit_time(&c.committed_at);
        out.push_str(&format!("{hash}|{time}|{}\n", c.subject));
      }
    }
  }

  out
}

fn short_hash(hash: &str) -> String {
  hash.chars().take(9).collect()
}

/// 将 git %cI / 其它时间串格式化为 `YYYY-MM-DD HH:mm`
fn format_commit_time(raw: &str) -> String {
  if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
    return dt.with_timezone(&Local).format("%Y-%m-%d %H:%M").to_string();
  }
  // 兼容 `2026-08-08 16:23:01` / `2026-08-08T16:23:01`
  let normalized = raw.replace('T', " ");
  let trimmed = normalized.split('+').next().unwrap_or(&normalized);
  let trimmed = trimmed.split('Z').next().unwrap_or(trimmed).trim();
  if let Ok(naive) = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
    return naive.format("%Y-%m-%d %H:%M").to_string();
  }
  if trimmed.len() >= 16 {
    return trimmed.chars().take(16).collect();
  }
  raw.to_string()
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::TimeZone;

  #[test]
  fn format_includes_author_range_and_empty_repo() {
    let start = Local.with_ymd_and_hms(2026, 8, 8, 0, 0, 0).single().unwrap();
    let end = Local.with_ymd_and_hms(2026, 8, 9, 0, 0, 0).single().unwrap();
    let stats = vec![RepoStat {
      repo_name: "HallErpAdmin".into(),
      repo_path: "/tmp/HallErpAdmin".into(),
      ok: true,
      commit_count: 0,
      error: None,
    }];
    let text = format_scan_log("chenzhibin", start, end, &stats, &[]);
    assert!(text.contains("查询作者: chenzhibin"));
    assert!(text.contains("2026-08-08 00:00 至 2026-08-09 00:00"));
    assert!(text.contains("=== Repository: HallErpAdmin ==="));
    assert!(text.contains("(无今天提交)"));
  }

  #[test]
  fn format_commit_line() {
    let start = Local.with_ymd_and_hms(2026, 8, 8, 0, 0, 0).single().unwrap();
    let end = Local.with_ymd_and_hms(2026, 8, 9, 0, 0, 0).single().unwrap();
    let stats = vec![RepoStat {
      repo_name: "TradeErp".into(),
      repo_path: "/tmp/TradeErp".into(),
      ok: true,
      commit_count: 1,
      error: None,
    }];
    let commits = vec![CommitItem {
      repo_name: "TradeErp".into(),
      repo_path: "/tmp/TradeErp".into(),
      hash: "6cc2887c1abcdef".into(),
      committed_at: "2026-08-08T16:23:00+08:00".into(),
      subject: "优化".into(),
      body: String::new(),
    }];
    let text = format_scan_log("chenzhibin", start, end, &stats, &commits);
    assert!(text.contains("6cc2887c1|2026-08-08 16:23|优化"));
  }
}
