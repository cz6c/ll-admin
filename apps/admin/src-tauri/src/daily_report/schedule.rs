//! 定时触发规则
//! 职责：按「计划星期」或「大小周工作日」判定今日是否应跑定时日报
//! 适用：scheduler / pipeline::run_scheduled
//! @note 开启大小周时触发日完全由大/小周决定（与 UI 只读胶囊一致），不再与手选星期取交

use chrono::{Datelike, Local, NaiveDate};

use super::types::{BiweeklyAnchorKind, DailyReportSettings};

/// 本周一（本地日历，周一为一周起点）
pub fn monday_of(date: NaiveDate) -> NaiveDate {
  let offset = date.weekday().num_days_from_monday() as i64;
  date - chrono::Duration::days(offset)
}

/// 大小周工作日：大周一～六（单休），小周一～五（双休）
pub fn workdays_for_kind(kind: BiweeklyAnchorKind) -> Vec<u32> {
  match kind {
    BiweeklyAnchorKind::Big => (1..=6).collect(),
    BiweeklyAnchorKind::Small => (1..=5).collect(),
  }
}

/// 根据锚点周一与隔周规则，计算指定日期所在周的大小周类型
pub fn biweekly_kind_for_date(
  settings: &DailyReportSettings,
  date: NaiveDate,
) -> Option<BiweeklyAnchorKind> {
  let anchor_str = settings.schedule_biweekly_anchor_monday.trim();
  if anchor_str.is_empty() {
    return None;
  }
  let anchor = NaiveDate::parse_from_str(anchor_str, "%Y-%m-%d").ok()?;
  let weeks = (monday_of(date) - anchor).num_days() / 7;
  let kind = if weeks.rem_euclid(2) == 0 {
    settings.schedule_biweekly_anchor_kind
  } else {
    settings.schedule_biweekly_anchor_kind.opposite()
  };
  Some(kind)
}

/// 今日是否满足定时触发（不含 HH:mm 比对）
pub fn schedule_should_run_today(settings: &DailyReportSettings) -> bool {
  if !settings.schedule_enabled {
    return false;
  }
  let now = Local::now();
  let weekday = now.weekday().number_from_monday();

  // 开启大小周：只看当前周型工作日
  if settings.schedule_biweekly_enabled {
    let Some(kind) = biweekly_kind_for_date(settings, now.date_naive()) else {
      return false;
    };
    return workdays_for_kind(kind).contains(&weekday);
  }

  // 未开大小周：按手选星期
  settings.schedule_days.contains(&weekday)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::daily_report::types::DailyReportSettings;

  fn settings_with_biweekly(
    anchor: &str,
    kind: BiweeklyAnchorKind,
    days: Vec<u32>,
  ) -> DailyReportSettings {
    DailyReportSettings {
      schedule_enabled: true,
      schedule_days: days,
      schedule_biweekly_enabled: true,
      schedule_biweekly_anchor_monday: anchor.into(),
      schedule_biweekly_anchor_kind: kind,
      ..DailyReportSettings::default()
    }
  }

  #[test]
  fn big_week_allows_monday_to_saturday() {
    let anchor = "2026-08-10";
    let settings = settings_with_biweekly(anchor, BiweeklyAnchorKind::Big, vec![]);
    assert_eq!(
      biweekly_kind_for_date(&settings, NaiveDate::from_ymd_opt(2026, 8, 12).unwrap()),
      Some(BiweeklyAnchorKind::Big)
    );
    let work = workdays_for_kind(BiweeklyAnchorKind::Big);
    assert!(work.contains(&6));
    assert!(!work.contains(&7));
  }

  #[test]
  fn alternates_to_small_next_week() {
    let anchor = "2026-08-10";
    let settings = settings_with_biweekly(anchor, BiweeklyAnchorKind::Big, vec![]);
    // 2026-08-22 周六，锚点周的下一周（8/17 起）应为小周（双休，周六不上班）
    let kind = biweekly_kind_for_date(&settings, NaiveDate::from_ymd_opt(2026, 8, 22).unwrap())
      .unwrap();
    assert_eq!(kind, BiweeklyAnchorKind::Small);
    assert!(!workdays_for_kind(kind).contains(&6));
    assert!(workdays_for_kind(kind).contains(&5));
  }

  #[test]
  fn biweekly_ignores_manual_schedule_days() {
    // 即使 schedule_days 为空，大小周开启后仍按周型工作日判定
    let settings = settings_with_biweekly("2026-08-10", BiweeklyAnchorKind::Big, vec![]);
    let kind = biweekly_kind_for_date(&settings, NaiveDate::from_ymd_opt(2026, 8, 15).unwrap())
      .unwrap();
    assert_eq!(kind, BiweeklyAnchorKind::Big);
    assert!(workdays_for_kind(kind).contains(&6));
  }
}
