//! 工作日报定时调度
//! 职责：后台轮询本地时钟，在配置的 HH:mm 触发一次日报生成
//! 适用：托盘常驻进程内调度（应用未运行则不跑）

use std::sync::Mutex;

use chrono::Local;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use super::pipeline::run_scheduled;
use super::schedule::schedule_should_run_today;
use super::settings::load_settings;

/// 记录今日已触发过的 schedule_time，避免同一分钟内重复
pub struct ScheduleState {
  pub last_fired_key: Option<String>,
}

impl Default for ScheduleState {
  fn default() -> Self {
    Self {
      last_fired_key: None,
    }
  }
}

/// 启动后台轮询（每 30s）
pub fn start(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
      interval.tick().await;
      if let Err(e) = tick_once(&app).await {
        log::warn!("daily-report schedule tick: {e}");
      }
    }
  });
}

async fn tick_once(app: &AppHandle) -> Result<(), String> {
  let settings = load_settings(app)?;
  if !settings.schedule_enabled {
    return Ok(());
  }

  let now = Local::now();
  let hhmm = now.format("%H:%M").to_string();
  if hhmm != settings.schedule_time {
    return Ok(());
  }
  if !schedule_should_run_today(&settings) {
    return Ok(());
  }

  let fire_key = format!("{}-{}", now.format("%Y-%m-%d"), settings.schedule_time);
  {
    let state = app.state::<Mutex<ScheduleState>>();
    let mut guard = state
      .lock()
      .map_err(|_| "schedule state lock poisoned".to_string())?;
    if guard.last_fired_key.as_deref() == Some(fire_key.as_str()) {
      return Ok(());
    }
    guard.last_fired_key = Some(fire_key);
  }

  match run_scheduled(app).await {
    Ok(Some(report)) => {
      notify_report(app, &report.date, report.error.as_deref());
      Ok(())
    }
    Ok(None) => Ok(()),
    Err(e) => {
      notify_report(app, &today(), Some(&e));
      Err(e)
    }
  }
}

fn today() -> String {
  Local::now().format("%Y-%m-%d").to_string()
}

/// 系统通知；点击由前端/壳层另行处理聚焦
pub fn notify_report(app: &AppHandle, date: &str, error: Option<&str>) {
  let (title, body) = match error {
    Some(e) => (
      "工作日报生成失败".to_string(),
      format!("{date}: {e}"),
    ),
    None => (
      "今日工作日报已生成".to_string(),
      format!("日期 {date}，点击打开查看"),
    ),
  };

  let _ = app
    .notification()
    .builder()
    .title(title)
    .body(body)
    .show();
}
