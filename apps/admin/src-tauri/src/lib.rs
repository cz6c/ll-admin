use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
  Manager, WebviewWindow,
};

/// 页面缩放因子（f64 bits）；PredefinedMenuItem 无 Win 可用的 zoom_*，故自管状态
static PAGE_ZOOM_BITS: AtomicU64 = AtomicU64::new(f64::to_bits(1.0));

/// 调整主窗 WebView 缩放；`delta=None` 时重置为 1.0（限制 0.5..=3.0）
fn apply_page_zoom(window: &WebviewWindow, delta: Option<f64>) {
  let next = match delta {
    None => 1.0,
    Some(d) => {
      let current = f64::from_bits(PAGE_ZOOM_BITS.load(Ordering::Relaxed));
      (current + d).clamp(0.5, 3.0)
    }
  };
  PAGE_ZOOM_BITS.store(f64::to_bits(next), Ordering::Relaxed);
  let _ = window.set_zoom(next);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // single-instance MUST be first：二次启动时聚焦已有主窗，避免多开
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 窗口由 tauri.conf.json 创建，setup 只挂菜单，避免再建第二个 Webview
      let handle = app.handle();

      let about = MenuItem::with_id(handle, "about", "关于", true, None::<&str>)?;
      let devtools = MenuItem::with_id(handle, "devtools", "开发者工具", true, None::<&str>)?;
      let reload = MenuItem::with_id(handle, "reload", "强制刷新", true, None::<&str>)?;
      let quit = PredefinedMenuItem::quit(handle, Some("退出"))?;

      let app_submenu = Submenu::with_items(
        handle,
        "ll-admin",
        true,
        &[&about, &devtools, &reload, &quit],
      )?;

      let edit_submenu = Submenu::with_items(
        handle,
        "编辑",
        true,
        &[
          &PredefinedMenuItem::undo(handle, Some("撤销"))?,
          &PredefinedMenuItem::redo(handle, Some("重做"))?,
          &PredefinedMenuItem::separator(handle)?,
          &PredefinedMenuItem::cut(handle, Some("剪切"))?,
          &PredefinedMenuItem::copy(handle, Some("复制"))?,
          &PredefinedMenuItem::paste(handle, Some("粘贴"))?,
          &PredefinedMenuItem::select_all(handle, Some("全选"))?,
        ],
      )?;

      // Tauri 2.11 无 PredefinedMenuItem::zoom_*；fullscreen 在 Win 上也不支持 → 用自定义项
      let zoom_in = MenuItem::with_id(handle, "zoom_in", "加大", true, None::<&str>)?;
      let zoom_reset = MenuItem::with_id(handle, "zoom_reset", "默认大小", true, None::<&str>)?;
      let zoom_out = MenuItem::with_id(handle, "zoom_out", "缩小", true, None::<&str>)?;
      let fullscreen = MenuItem::with_id(handle, "fullscreen", "进入全屏", true, None::<&str>)?;
      let view_submenu = Submenu::with_items(
        handle,
        "显示",
        true,
        &[
          &zoom_in,
          &zoom_reset,
          &zoom_out,
          &PredefinedMenuItem::separator(handle)?,
          &fullscreen,
        ],
      )?;

      let menu = Menu::with_items(handle, &[&app_submenu, &edit_submenu, &view_submenu])?;
      app.set_menu(menu)?;

      Ok(())
    })
    .on_menu_event(|app, event| match event.id().as_ref() {
      "about" => {
        // 无独立 about 面板时仅聚焦主窗；后续可换 dialog 插件
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.set_focus();
        }
      }
      "devtools" => {
        if let Some(w) = app.get_webview_window("main") {
          if w.is_devtools_open() {
            w.close_devtools();
          } else {
            w.open_devtools();
          }
        }
      }
      "reload" => {
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.reload();
        }
      }
      "zoom_in" => {
        if let Some(w) = app.get_webview_window("main") {
          apply_page_zoom(&w, Some(0.1));
        }
      }
      "zoom_out" => {
        if let Some(w) = app.get_webview_window("main") {
          apply_page_zoom(&w, Some(-0.1));
        }
      }
      "zoom_reset" => {
        if let Some(w) = app.get_webview_window("main") {
          apply_page_zoom(&w, None);
        }
      }
      "fullscreen" => {
        if let Some(w) = app.get_webview_window("main") {
          let next = !w.is_fullscreen().unwrap_or(false);
          let _ = w.set_fullscreen(next);
        }
      }
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
