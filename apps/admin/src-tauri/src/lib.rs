//! Tauri 桌面壳：单实例、托盘、外链 opener、工作日报定时
//! 职责：壳层能力；「更多工具」菜单在前端 UI（CsToolsBar），不再使用原生系统菜单栏
//! 适用：admin CS（Win x64）

mod app_settings;
mod daily_report;

use std::sync::Mutex;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager,
};

fn focus_main(app: &tauri::AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
  }
}

/// 主窗内打开工具页（today | history | settings | admin | /path）
fn open_in_main(app: &tauri::AppHandle, target: &str) {
  focus_main(app);
  let _ = app.emit_to("main", "app:navigate", target);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // single-instance MUST be first：二次启动时聚焦已有主窗，避免多开
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      focus_main(app);
    }))
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec!["--autostart"]),
    ))
    .manage(Mutex::new(daily_report::ScheduleState::default()))
    .invoke_handler(tauri::generate_handler![
      app_settings::app_settings_get,
      app_settings::app_settings_save,
      daily_report::daily_report_default_prompt,
      daily_report::daily_report_get_settings,
      daily_report::daily_report_save_settings,
      daily_report::daily_report_set_api_key,
      daily_report::daily_report_has_api_key,
      daily_report::daily_report_list,
      daily_report::daily_report_get,
      daily_report::daily_report_run,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let handle = app.handle();

      // 托盘保留快捷入口；应用内菜单改由前端 CsToolsBar 提供
      let tray_open = MenuItem::with_id(handle, "tray_open", "打开主界面", true, None::<&str>)?;
      let tray_daily = MenuItem::with_id(handle, "tray_daily", "打开工作日报", true, None::<&str>)?;
      let tray_run = MenuItem::with_id(handle, "tray_run", "立刻生成日报", true, None::<&str>)?;
      let tray_quit = MenuItem::with_id(handle, "tray_quit", "退出", true, None::<&str>)?;
      let tray_menu = Menu::with_items(handle, &[&tray_open, &tray_daily, &tray_run, &tray_quit])?;

      let icon = app
        .default_window_icon()
        .cloned()
        .expect("missing default window icon");

      let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&tray_menu)
        .tooltip("ll-admin")
        .on_menu_event(|app, event| match event.id().as_ref() {
          "tray_open" => open_in_main(app, "admin"),
          "tray_daily" => open_in_main(app, "today"),
          "tray_run" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
              match daily_report::daily_report_run(app.clone()).await {
                Ok(_) => open_in_main(&app, "today"),
                Err(e) => log::warn!("tray run daily report: {e}"),
              }
            });
          }
          "tray_quit" => {
            app.exit(0);
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            focus_main(tray.app_handle());
          }
        })
        .build(app)?;

      daily_report::start_scheduler(app.handle().clone());

      Ok(())
    })
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let minimize = app_settings::load_settings(window.app_handle())
          .map(|s| s.minimize_to_tray_on_close)
          .unwrap_or(true);
        if minimize {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
