# Admin CS Electron → Tauri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@apps/admin` desktop (`cs:*`) packaging from Electron to Tauri 2 on Windows x64, keeping browser (`bs:*`) and `web.yml` unchanged.

**Architecture:** Vite still builds the SPA into `apps/admin/dist`. Tauri 2 Rust shell (`src-tauri/`) loads that frontend in WebView2. Dev uses `tauri dev` + Vite on port `9596`. Shell features (window size, menu, single-instance, open external https) live in Rust/plugins. Unused Electron IPC (`open-win`, preload bridge) is deleted, not ported.

**Tech Stack:** Tauri 2, `@tauri-apps/cli`, `tauri-plugin-single-instance`, `tauri-plugin-opener`, existing Vue3/Vite admin app, pnpm monorepo.

**Spec:** [`docs/superpowers/specs/2026-07-23-admin-cs-tauri-design.md`](../specs/2026-07-23-admin-cs-tauri-design.md)

## Global Constraints

- Package: `@apps/admin` under `apps/admin/` only; do not touch `apps/server`, `apps/uni`, or `web.yml` deploy path
- Desktop target: **Windows x64 only** for v1
- Tauri major: **2.x** (MSRV ≥ 1.77.2)
- Keep `VITE_PUBLIC_PATH=./` in production (already set)
- Keep router history **hash** (already `VITE_ROUTER_HISTORY=hash`) — required for asset-protocol friendliness
- Direct replace Electron — delete electron deps after Tauri path works; no dual-track scripts
- Package manager: **pnpm only**
- Identifier / product naming: `com.ll.admin` / `ll-admin` (drop `electron-` prefix from productName)
- CS builds must **not** emit `.gz` as primary assets for the shell (disable compress when Tauri env is set)
- Comments: follow repo `comment-standards.mdc` for any new TS/Rust business files

## File map

| Path | Responsibility |
|------|----------------|
| `apps/admin/src-tauri/` | Tauri Rust app, config, capabilities, icons |
| `apps/admin/src-tauri/tauri.conf.json` | Window, build hooks, bundle (NSIS Win) |
| `apps/admin/src-tauri/src/lib.rs` | Builder: plugins, menu, external link policy |
| `apps/admin/src-tauri/capabilities/default.json` | Permissions (opener defaults, core) |
| `apps/admin/package.json` | `cs:*` scripts; remove electron deps; add `@tauri-apps/cli` |
| `apps/admin/vite.config.ts` | Drop `dist-electron` cleanup; ignore `src-tauri` in watch; detect Tauri for compress |
| `apps/admin/build/vite/index.ts` | Remove Electron plugin branch |
| Delete `apps/admin/electron/**`, `electron-builder.json5`, `build/vite/plugins/electron.ts` | Electron shell removal |
| `apps/docs/guide/admin.md` | Electron → Tauri section |
| `.cursor/rules/vue-admin.mdc` | `cs:*` wording |
| Root `package.json` `pnpm.onlyBuiltDependencies` | Remove `electron` |

---

### Task 1: Prerequisite check + scaffold `src-tauri`

**Files:**
- Create: `apps/admin/src-tauri/**` (via CLI init)
- Modify: `apps/admin/package.json` (devDependency `@tauri-apps/cli`)
- Test: shell commands below

**Interfaces:**
- Produces: runnable `pnpm exec tauri --version`; directory `apps/admin/src-tauri` with default Cargo/tauri layout

- [ ] **Step 1: Verify local toolchain**

Run from repo root:

```powershell
rustc --version
cargo --version
```

Expected: Rust ≥ 1.77.2. If missing, install via https://rustup.rs and re-run.

Also confirm WebView2 Runtime is present on the Windows machine (Win10/11 usually preinstalled).

- [ ] **Step 2: Add Tauri CLI to admin**

In `apps/admin/package.json` `devDependencies`, add:

```json
"@tauri-apps/cli": "^2"
```

Remove nothing yet (Electron stays until Task 5 so rollback is possible mid-migration).

Run:

```powershell
pnpm --filter @apps/admin install
pnpm --filter @apps/admin exec tauri --version
```

Expected: prints Tauri CLI 2.x.

- [ ] **Step 3: Initialize Tauri in `apps/admin`**

```powershell
cd apps/admin
pnpm exec tauri init --ci --app-name ll-admin --window-title "ll-admin" --frontend-dist ../dist --dev-url http://localhost:9596 --before-dev-command "pnpm dev" --before-build-command "pnpm run bs:build"
```

Note: `--before-build-command` is temporary; Task 2 replaces it with a CS-specific Vite build that skips browser-only assumptions and disables gzip. Prefer answering init interactively only if `--ci` flags differ on your CLI version — match the same values.

If `tauri init` creates files at wrong depth, ensure `apps/admin/src-tauri/tauri.conf.json` exists (app root = `apps/admin`).

- [ ] **Step 4: Smoke that scaffold compiles (no frontend yet optional)**

```powershell
cd apps/admin
pnpm exec tauri build --help
```

Expected: help text, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/pnpm-lock.yaml apps/admin/src-tauri
git commit -m "chore(admin): scaffold Tauri 2 src-tauri for CS packaging"
```

(If lockfile is only at repo root, stage `pnpm-lock.yaml` from root.)

---

### Task 2: Wire Vite + package scripts for Tauri CS

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/vite.config.ts`
- Modify: `apps/admin/build/vite/index.ts`
- Modify: `apps/admin/src-tauri/tauri.conf.json`
- Modify: `apps/admin/tsconfig.node.json` (drop `electron` include later in Task 5; can leave for now)

**Interfaces:**
- Consumes: Task 1 `src-tauri` + `@tauri-apps/cli`
- Produces: `cs:dev` / `cs:build` / `cs:staging` scripts; `isTauri` build flag; `beforeDevCommand`/`beforeBuildCommand` aligned to port 9596 and `dist/`

- [ ] **Step 1: Update `package.json` scripts**

Replace CS scripts and add helper (keep old electron scripts until Task 5, or replace in place once Task 3–4 done — prefer replace now and fix forward):

```json
{
  "scripts": {
    "dev": "vite",
    "bs:dev": "vite",
    "bs:build": "rimraf dist && vite build --mode production",
    "cs:dev": "tauri dev",
    "cs:vite-build": "rimraf dist && vite build --mode production",
    "cs:vite-build:staging": "rimraf dist && vite build --mode staging",
    "cs:build": "tauri build",
    "cs:staging": "tauri build --config \"{\\\"build\\\":{\\\"beforeBuildCommand\\\":\\\"pnpm run cs:vite-build:staging\\\"}}\"",
    "icon": "esno build/icon.ts --input=public/icon.png --output=dist",
    "tauri": "tauri"
  }
}
```

Remove `"main": "dist-electron/main/index.js"` from `package.json` (Node entry unused by Tauri).

Simplify `cs:staging` if CLI config override is awkward on Windows PowerShell — alternative: add `src-tauri/tauri.staging.conf.json` with only `build.beforeBuildCommand` override and run `tauri build --config src-tauri/tauri.staging.conf.json`.

- [ ] **Step 2: Point `tauri.conf.json` build hooks at admin scripts**

In `apps/admin/src-tauri/tauri.conf.json`, set (field names are Tauri 2):

```json
{
  "productName": "ll-admin",
  "version": "0.0.1",
  "identifier": "com.ll.admin",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:9596",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm run cs:vite-build"
  },
  "app": {
    "windows": [
      {
        "title": "ll-admin",
        "width": 1024,
        "height": 768,
        "minWidth": 1024,
        "minHeight": 768,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://webapi.amap.com https://*.amap.com; style-src 'self' 'unsafe-inline' https://*.amap.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http: ws: wss:; font-src 'self' data:; frame-src 'self' https:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

CSP note: AMap + MQTT ws/wss need the `connect-src` / `script-src` allowances above; tighten later if policy requires.

- [ ] **Step 3: Fix Vite for Tauri (no Electron plugin; watch ignore; no gz in CS)**

`apps/admin/vite.config.ts` — replace Electron cleanup with Tauri-aware config:

```typescript
export default ({ command, mode }: ConfigEnv): UserConfigExport => {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  const isCS = !lifecycle.includes("bs");
  const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM) || lifecycle.startsWith("cs");
  const isBuild = command === "build";
  const isProduction = mode === "production";
  // ... loadEnv unchanged ...

  return {
    // ... existing root/base/resolve/css ...
    clearScreen: false,
    server: {
      host: true,
      hmr: true,
      port: viteEnv.VITE_PORT,
      strictPort: true,
      proxy: createProxy(viteEnv.VITE_PROXY),
      watch: {
        ignored: ["**/src-tauri/**"]
      }
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    plugins: createVitePlugins(
      {
        ...viteEnv,
        // CS/Tauri 壳直接读 dist 文件，.gz 仅给 Nginx；避免壳误配压缩产物
        VITE_USE_COMPRESS: isTauri ? false : viteEnv.VITE_USE_COMPRESS
      },
      isBuild,
      isCS
    ),
    // ... build/optimizeDeps unchanged ...
  };
};
```

`apps/admin/build/vite/index.ts` — remove Electron import and `if (isCS)` Electron push. Keep `isCS` param unused for now or delete the param and update call sites:

```typescript
export function createVitePlugins(env: ViteEnv, isBuild: boolean) {
  const { VITE_USE_COMPRESS } = env;
  const vitePlugins: (PluginOption | PluginOption[])[] = [
    vue(),
    vueJsx(),
    ConfigRestartPlugin(),
    AutoRegistryComponents(),
    AutoImportDeps(),
    UnoCSSPlugin(),
    svgLoader(),
    Icons({ compiler: "vue3", scale: 1 })
  ];

  if (isBuild && VITE_USE_COMPRESS) {
    vitePlugins.push(ConfigCompressPlugin());
  }

  return vitePlugins;
}
```

Update `vite.config.ts` call to `createVitePlugins(env, isBuild)` accordingly.

- [ ] **Step 4: Verify browser build still works**

```powershell
pnpm --filter @apps/admin run bs:build
```

Expected: `apps/admin/dist/index.html` exists; no `dist-electron`.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/vite.config.ts apps/admin/build/vite/index.ts apps/admin/src-tauri/tauri.conf.json
git commit -m "feat(admin): wire Vite and cs scripts to Tauri build hooks"
```

---

### Task 3: Shell features — single-instance, opener, menu, external links

**Files:**
- Modify: `apps/admin/src-tauri/Cargo.toml`
- Modify: `apps/admin/src-tauri/src/lib.rs` (or `main.rs` if template uses only main)
- Modify: `apps/admin/src-tauri/capabilities/default.json`
- Optionally modify: frontend `openWindow` later only if `_blank` fails smoke — prefer Rust `on_navigation` / new-window deny + opener first

**Interfaces:**
- Consumes: Task 2 window config (label `main` by default)
- Produces: single-instance focus callback; menu parity; https links open in system browser

- [ ] **Step 1: Add plugins via CLI**

```powershell
cd apps/admin
pnpm exec tauri add single-instance
pnpm exec tauri add opener
```

Expected: Cargo.toml + capability permissions updated.

Ensure `capabilities/default.json` includes at least:

```json
{
  "identifier": "default",
  "description": "Main window capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

- [ ] **Step 2: Implement `lib.rs` shell behavior**

Replace builder setup with (adjust module path to match scaffold — many templates use `lib.rs` + `main.rs` calling `app_lib::run()`):

```rust
use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
  Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // single-instance MUST be first
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
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

      let zoom_in = PredefinedMenuItem::zoom_in(handle, Some("加大"))?;
      let zoom_out = PredefinedMenuItem::zoom_out(handle, Some("缩小"))?;
      let zoom_reset = PredefinedMenuItem::reset_zoom(handle, Some("默认大小"))?;
      let fullscreen = PredefinedMenuItem::fullscreen(handle, Some("进入全屏幕"))?;
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
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

If the scaffold already creates the window from `tauri.conf.json`, do **not** create a second window in setup. Prefer conf-driven window + menu only.

For external https links (Electron `setWindowOpenHandler` parity), register navigation/new-window handling. Prefer Tauri 2 webview builder hook if window is created in Rust; if window comes from config, use:

```rust
.on_page_load(|webview, _payload| {
  let _ = webview.eval(
    r#"
    (function () {
      if (window.__ll_open_patched) return;
      window.__ll_open_patched = true;
      const rawOpen = window.open;
      window.open = function (url, target, features) {
        if (typeof url === 'string' && /^https?:/i.test(url)) {
          window.__TAURI__?.core?.invoke('plugin:opener|open_url', { url })
            .catch(() => rawOpen.call(window, url, target, features));
          return null;
        }
        return rawOpen.call(window, url, target, features);
      };
    })();
    "#,
  );
})
```

Only use the eval patch if `withGlobalTauri` / opener JS API is enabled; cleaner approach for production:

1. Set `"app": { "withGlobalTauri": true }` temporarily for smoke, **or**
2. Add a tiny frontend helper in Task 4.

Preferred clean approach — in Task 4 patch `src/utils/index.ts` `openWindow` to use `@tauri-apps/plugin-opener` when `window.__TAURI_INTERNALS__` exists, and set `tauri.conf.json` `"app": { "withGlobalTauri": false }` with proper JS import.

Add frontend dep:

```json
"@tauri-apps/plugin-opener": "^2"
```

Update `openWindow`:

```typescript
export async function openWindow(
  url: string,
  opt?: {
    target?: TargetContext | string;
    noopener?: boolean;
    noreferrer?: boolean;
  }
) {
  // Tauri CS：外链走系统浏览器，对齐原 Electron setWindowOpenHandler
  if ("__TAURI_INTERNALS__" in window && /^https?:/i.test(url)) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  const { target = "__blank", noopener = true, noreferrer = true } = opt || {};
  const feature: string[] = [];
  noopener && feature.push("noopener=yes");
  noreferrer && feature.push("noreferrer=yes");
  window.open(url, target, feature.join(","));
}
```

Add file-header/why comment per comment-standards (platform branch).

- [ ] **Step 3: Icons**

```powershell
cd apps/admin
pnpm exec tauri icon public/icon.png
```

Expected: regenerates `src-tauri/icons/*`.

- [ ] **Step 4: Dev smoke**

```powershell
pnpm --filter @apps/admin run cs:dev
```

Expected: Vite starts on **9596**, WebView opens admin UI; second launch focuses first window.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src-tauri apps/admin/package.json apps/admin/src/utils/index.ts
git commit -m "feat(admin): add Tauri single-instance, opener, and app menu"
```

---

### Task 4: Production CS build + staging path

**Files:**
- Modify: `apps/admin/src-tauri/tauri.conf.json` / optional `tauri.staging.conf.json`
- Modify: `apps/admin/package.json` if staging override needed
- Test: installers under `apps/admin/src-tauri/target/release/bundle/`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: NSIS installer artifact for Win x64

- [ ] **Step 1: Production build**

```powershell
pnpm --filter @apps/admin run cs:build
```

Expected:
- `cs:vite-build` runs without Electron
- Rust compile succeeds
- Installer under `apps/admin/src-tauri/target/release/bundle/nsis/` (or `msi` if targets differ — keep `nsis`)

- [ ] **Step 2: Install & manual smoke checklist**

Run the generated installer on a Windows machine, then verify:

1. App launches; window min size ~1024×768
2. Login works against configured `VITE_BASE_URL`
3. Dynamic menu route opens a list page
4. Export download (`$file.download`) saves a file
5. Open an `https` link / `openWindow` uses system browser
6. Launch second instance → focuses existing window
7. Menu: zoom / fullscreen / quit work
8. Optional: MQTT page if used in prod; AMap demo route does not white-screen

- [ ] **Step 3: Staging build**

```powershell
pnpm --filter @apps/admin run cs:staging
```

Expected: same bundle flow with `mode staging` env (API base from `.env.staging` if present).

- [ ] **Step 4: Commit any conf fixes from smoke**

```bash
git add apps/admin/src-tauri apps/admin/package.json
git commit -m "fix(admin): harden Tauri CS production and staging builds"
```

---

### Task 5: Remove Electron toolchain

**Files:**
- Delete: `apps/admin/electron/` (entire tree)
- Delete: `apps/admin/electron-builder.json5`
- Delete: `apps/admin/build/vite/plugins/electron.ts`
- Modify: `apps/admin/package.json` (remove electron deps)
- Modify: `apps/admin/tsconfig.node.json`
- Modify: root `package.json` `pnpm.onlyBuiltDependencies`
- Modify: `apps/admin/build/icon.ts` comments only if still used; optional keep for non-Tauri assets — Tauri icons now via `tauri icon`; `icon` script can become `tauri icon public/icon.png` or remain unused

**Interfaces:**
- Consumes: Task 4 green CS build
- Produces: no electron packages in admin lock graph for CS

- [ ] **Step 1: Remove dependencies from `apps/admin/package.json`**

Delete from `devDependencies`:

- `electron`
- `electron-builder`
- `vite-plugin-electron`
- `vite-plugin-electron-renderer`

Keep `@tauri-apps/cli` and `@tauri-apps/plugin-opener`.

- [ ] **Step 2: Delete Electron files**

Delete paths listed above. Update `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["package.json"]
}
```

Root `package.json`:

```json
"onlyBuiltDependencies": []
```

(or remove the `electron` entry only; keep array if other packages are listed later).

Remove `electron_mirror` from `apps/admin/.npmrc` if present.

Update `icon` script to:

```json
"icon": "tauri icon public/icon.png"
```

and remove or archive `build/icon.ts` if unused — if deleted, drop `esno`/`icon-gen`/`jimp`/`args` only when nothing else imports them (grep first; do not remove shared tooling blindly).

- [ ] **Step 3: Reinstall + verify builds**

```powershell
pnpm install
pnpm --filter @apps/admin run bs:build
pnpm --filter @apps/admin run cs:build
```

Expected: both succeed; no electron download during install.

- [ ] **Step 4: Commit**

```bash
git add -A apps/admin package.json pnpm-lock.yaml apps/admin/.npmrc
git commit -m "chore(admin): remove Electron CS packaging in favor of Tauri"
```

---

### Task 6: Docs + Cursor rule

**Files:**
- Modify: `apps/docs/guide/admin.md` section 15
- Modify: `.cursor/rules/vue-admin.mdc` build-script bullet
- Optional: short note in `apps/docs/guide/deployment.md` that CS is local Tauri Win build (Web deploy unchanged)

**Interfaces:**
- Produces: docs match new toolchain

- [ ] **Step 1: Replace Electron section in admin guide**

```markdown
## 15. 桌面端（Tauri）说明

`admin` 除了浏览器模式（`bs:*`），还支持 Tauri 桌面打包（`cs:*`）。

- 日常页面开发用 `pnpm dev:admin` / `bs:*` 即可
- 桌面调试：`pnpm --filter @apps/admin cs:dev`（需本机 Rust + WebView2）
- 桌面生产包：`pnpm --filter @apps/admin cs:build`（Windows x64 NSIS）
- 壳代码在 `apps/admin/src-tauri/`；业务代码仍在 `src/`
```

- [ ] **Step 2: Update vue-admin rule**

Change:

```markdown
- 构建脚本区分 Web（`bs:*`）与 Electron 桌面端（`cs:*`）；改构建逻辑前确认目标形态。
```

To:

```markdown
- 构建脚本区分 Web（`bs:*`）与 Tauri 桌面端（`cs:*`）；改构建逻辑前确认目标形态。桌面壳在 `src-tauri/`。
```

- [ ] **Step 3: Commit**

```bash
git add apps/docs/guide/admin.md .cursor/rules/vue-admin.mdc
git commit -m "docs(admin): document Tauri CS packaging replacing Electron"
```

---

### Task 7: Final verification gate

**Files:** none (validation only)

- [ ] **Step 1: Regression matrix**

| Check | Command / action | Expected |
|-------|------------------|----------|
| Web build | `pnpm --filter @apps/admin run bs:build` | `dist/` OK |
| CS build | `pnpm --filter @apps/admin run cs:build` | NSIS under `src-tauri/target/release/bundle/` |
| Typecheck | `pnpm --filter @apps/admin run typecheck` | exit 0 |
| Lint | `pnpm --filter @apps/admin run lint` | exit 0 |
| No electron refs | `rg -i electron apps/admin --glob '!**/node_modules/**' --glob '!**/dist*/**' --glob '!**/release/**' --glob '!**/target/**'` | only historical docs if any; no runtime deps |
| Installer size | compare to old `apps/admin/release/0.0.1/*.exe` | Tauri package much smaller |

- [ ] **Step 2: Mark done only when matrix passes**

If any fail, fix in a follow-up commit before claiming complete.

---

## Self-review (plan author)

1. **Spec coverage:** Win-only Tauri 2 replace, menu/single-instance/opener, drop unused IPC, keep `bs:*`/`web.yml`, CSP for AMap/MQTT, disable gz for CS, docs/rules — all mapped to Tasks 1–7.
2. **Placeholders:** none intentional; staging CLI override has a concrete Windows-friendly alternative (`tauri.staging.conf.json`).
3. **Naming:** product `ll-admin`, id `com.ll.admin`, window label `main`, scripts `cs:dev`/`cs:build`/`cs:vite-build` consistent across tasks.

## Out of scope (do not implement in this plan)

- macOS/Linux bundles, code signing, notarization
- Tauri updater
- GitHub Actions `cs-win` workflow (optional follow-up)
- Porting `open-win` child windows
