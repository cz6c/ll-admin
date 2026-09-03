//! Tauri 桌面壳：单实例、托盘、外链 opener
//! 职责：壳层能力；「更多工具」菜单在前端 UI（CsToolsBar），不再使用原生系统菜单栏
//! 适用：admin CS（Win x64）

mod album;
mod app_settings;
mod icloud_sync;

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

/// 主窗内打开工具页（admin | /path）
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
    .manage(icloud_sync::SidecarClientHandle::new())
    .manage(Mutex::new(album::AlbumState::new()))
    .invoke_handler(tauri::generate_handler![
      app_settings::app_settings_get,
      app_settings::app_settings_save,
      app_settings::app_settings_set_ai_api_key,
      app_settings::app_settings_has_ai_api_key,
      album::album_get_settings,
      album::album_save_settings,
      album::album_scan,
      album::album_cancel_scan,
      album::album_delete_local,
      album::album_find_local_duplicates,
      album::album_resolve_duplicate_thumb,
      album::album_ensure_playback,
      album::album_open_dir,
      icloud_sync::icloud_sync_ping,
      icloud_sync::icloud_sync_get_settings,
      icloud_sync::icloud_sync_save_settings,
      icloud_sync::icloud_sync_set_credentials,
      icloud_sync::icloud_sync_logout,
      icloud_sync::icloud_sync_login,
      icloud_sync::icloud_sync_submit_2fa,
      icloud_sync::icloud_sync_auth_state,
      icloud_sync::queue::icloud_sync_start_job,
      icloud_sync::queue::icloud_sync_pause_job,
      icloud_sync::queue::icloud_sync_resume_job,
      icloud_sync::queue::icloud_sync_job_status,
      icloud_sync::queue::icloud_sync_list_failed_assets,
      icloud_sync::queue::icloud_sync_list_asset_tasks,
      icloud_sync::queue::icloud_sync_discard_job,
      icloud_sync::queue::icloud_sync_active_task,
      icloud_sync::queue::icloud_sync_refresh_catalog,
      icloud_sync::cloud_assets::icloud_sync_load_assets,
      icloud_sync::cloud_assets::icloud_sync_get_cloud_state_summary,
      icloud_sync::cloud_delete::icloud_sync_delete_assets,
      icloud_sync::cloud_delete::icloud_sync_delete_all_synced,
      icloud_sync::cloud_delete::icloud_sync_cancel_cloud_delete,
      icloud_sync::cloud_delete::icloud_sync_retry_cloud_deletes,
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
      let tray_open = MenuItem::with_id(handle, "tray_open", "打开管理后台", true, None::<&str>)?;
      let tray_album = MenuItem::with_id(handle, "tray_album", "打开本地相册", true, None::<&str>)?;
      let tray_quit = MenuItem::with_id(handle, "tray_quit", "退出", true, None::<&str>)?;
      let tray_menu = Menu::with_items(handle, &[&tray_open, &tray_album, &tray_quit])?;

      let icon = app
        .default_window_icon()
        .cloned()
        .expect("missing default window icon");

      let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&tray_menu)
        .tooltip("Ccode")
        .on_menu_event(|app, event| match event.id().as_ref() {
          "tray_open" => open_in_main(app, "admin"),
          "tray_album" => open_in_main(app, "album"),
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

      icloud_sync::init_cloud_delete_worker(
        handle.clone(),
        handle.state::<icloud_sync::SidecarClientHandle>().client(),
      );

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
