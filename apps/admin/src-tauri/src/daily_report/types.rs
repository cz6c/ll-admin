//! 工作日报领域类型
//! 职责：Settings / Report / Commit 等可序列化结构，供落盘与前端 invoke 共用
//! 适用：admin CS 本机日报流水线

use serde::{Deserialize, Serialize};

/// 默认 Prompt：对齐个人日报体例（完成事项编号 + 一句总结）
pub const DEFAULT_PROMPT_TEMPLATE: &str = r#"根据下方「git 扫描日志」写今日工作日报。只输出日报正文，不要解释、不要 Markdown 标题符号。

# 输出格式（必须严格遵守）
{日志中的日期，取日期范围起始日 YYYY-MM-DD} 完成事项
1、{归并后的事项描述，约 8～16 字}
2、{归并后的事项描述，约 8～16 字}
总结：{一句话概括当天主线，约 8～16 字}

# 写法要求
1. 只使用有提交的仓库；忽略「(无今天提交)」的仓库。
2. 按业务语义归并相关提交，不要一条 commit 占一行；不要输出 hash、完整时间戳。
3. 事项描述用语贴近 commit message 的业务含义（feat/fix 前缀去掉），写成「做了什么」，不要空泛套话。
4. 不要编造或估算工时，行末不要写「Xh」。
5. 若当天完全无提交，只输出：{日期} 完成事项\n（无 Git 提交）\n总结：无

# 扫描日志
{{commits}}
"#;

/// 大小周锚点类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum BiweeklyAnchorKind {
  /// 大周（单休）：周一至周六上班
  #[default]
  Big,
  /// 小周（双休）：周一至周五上班
  Small,
}

impl BiweeklyAnchorKind {
  pub fn opposite(self) -> Self {
    match self {
      Self::Big => Self::Small,
      Self::Small => Self::Big,
    }
  }
}

fn default_schedule_days() -> Vec<u32> {
  vec![1, 2, 3, 4, 5]
}

/// 本机非敏感配置（API Key 不在此结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReportSettings {
  pub workspace_root: String,
  pub author_email: String,
  pub author_name: String,
  pub scan_depth: u32,
  pub exclude_dir_names: Vec<String>,
  pub schedule_enabled: bool,
  /// 本地时区 `HH:mm`
  pub schedule_time: String,
  /// 计划触发星期：1=周一 … 7=周日
  #[serde(default = "default_schedule_days")]
  pub schedule_days: Vec<u32>,
  /// 是否启用隔周大小周（开启后触发日完全由大小周工作日决定，忽略手动星期）
  #[serde(default)]
  pub schedule_biweekly_enabled: bool,
  /// 锚点周的周一 `YYYY-MM-DD`；保存时写入
  #[serde(default)]
  pub schedule_biweekly_anchor_monday: String,
  /// 锚点周类型：大周一～六 / 小周一～五
  #[serde(default)]
  pub schedule_biweekly_anchor_kind: BiweeklyAnchorKind,
  /// 已迁至应用级 `app-settings.json`；保留字段仅为兼容旧文件
  #[serde(default = "default_model_base_url")]
  pub model_base_url: String,
  /// 已迁至应用级设置；见上
  #[serde(default = "default_model_name")]
  pub model_name: String,
  pub prompt_template: String,
  /// 已迁至应用级设置；保留仅为兼容旧文件
  #[serde(default)]
  pub call_ai_when_empty: bool,
  /// 已迁至应用级 `app-settings.json`；保留字段仅为兼容旧文件反序列化
  #[serde(default = "default_minimize_to_tray")]
  pub minimize_to_tray_on_close: bool,
  /// 已迁至应用级设置；见上
  #[serde(default)]
  pub autostart: bool,
}

fn default_minimize_to_tray() -> bool {
  true
}

fn default_model_base_url() -> String {
  "https://api.openai.com/v1".into()
}

fn default_model_name() -> String {
  "gpt-4o-mini".into()
}

/// 扫描时默认跳过的目录名（按目录名匹配，不限深度）
pub const RECOMMENDED_EXCLUDE_DIR_NAMES: &[&str] = &[
  "node_modules",
  "dist",
  ".pnpm-store",
  "target",
];

impl Default for DailyReportSettings {
  fn default() -> Self {
    Self {
      workspace_root: String::new(),
      // 作者固定读本机 git config，不再提供 UI 覆盖
      author_email: String::new(),
      author_name: String::new(),
      // 0 = 全扫（不限深度）
      scan_depth: 0,
      exclude_dir_names: RECOMMENDED_EXCLUDE_DIR_NAMES
        .iter()
        .map(|s| (*s).into())
        .collect(),
      schedule_enabled: false,
      schedule_time: "19:00".into(),
      schedule_days: default_schedule_days(),
      schedule_biweekly_enabled: false,
      schedule_biweekly_anchor_monday: String::new(),
      schedule_biweekly_anchor_kind: BiweeklyAnchorKind::Big,
      model_base_url: "https://api.openai.com/v1".into(),
      model_name: "gpt-4o-mini".into(),
      prompt_template: DEFAULT_PROMPT_TEMPLATE.into(),
      call_ai_when_empty: false,
      minimize_to_tray_on_close: true,
      autostart: false,
    }
  }
}

/// 单条提交
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitItem {
  pub repo_name: String,
  pub repo_path: String,
  pub hash: String,
  pub committed_at: String,
  pub subject: String,
  pub body: String,
}

/// 单仓采集结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStat {
  pub repo_name: String,
  pub repo_path: String,
  pub ok: bool,
  pub commit_count: usize,
  pub error: Option<String>,
}

/// 日报状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReportStatus {
  Success,
  Failed,
  Empty,
}

/// 正文来源：区分「AI 成功」与「各种原因回退扫描日志」
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SummarySource {
  /// 模型总结成功
  Ai,
  /// 未配置 API Key，未调模型
  #[default]
  ScanLogNoKey,
  /// 无提交，未调模型
  ScanLogNoCommits,
  /// 已调模型但失败，回退扫描日志
  ScanLogAiFailed,
}

/// 按日落盘的日报
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReport {
  pub date: String,
  pub status: ReportStatus,
  /// AI 总结；未配置 AI / 无提交 / AI 失败时等同于扫描日志
  pub summary_markdown: String,
  /// 原始扫描日志文本（始终生成）
  #[serde(default)]
  pub scan_log: String,
  /// 总结来源；旧文件缺省时按「无 Key」兼容
  #[serde(default)]
  pub summary_source: SummarySource,
  pub raw_commits: Vec<CommitItem>,
  pub repo_stats: Vec<RepoStat>,
  pub error: Option<String>,
  pub started_at: String,
  pub finished_at: String,
  pub model_name: String,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn default_settings_match_spec() {
    let s = DailyReportSettings::default();
    assert_eq!(s.scan_depth, 0); // 全扫
    assert_eq!(s.schedule_days, vec![1, 2, 3, 4, 5]);
    assert!(!s.schedule_biweekly_enabled);
    assert!(!s.call_ai_when_empty);
    assert!(s.minimize_to_tray_on_close);
    assert!(s.exclude_dir_names.contains(&"node_modules".into()));
    assert!(s.exclude_dir_names.contains(&".cursor".into()));
    assert!(s.exclude_dir_names.contains(&".agents".into()));
  }
}
