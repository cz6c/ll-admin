# iCloud Sync Sidecar（维护者）

Python 瘦 sidecar：`auth` / `catalog` / `download`，stdin/stdout 行式 JSON。  
**终端用户不安装 Python**；发布包使用 PyInstaller 捆绑 exe，随 Tauri 安装包分发。

| 模块 | 职责 |
|------|------|
| `agent.py` | 命令路由、认证态、catalog/download 编排 |
| `icloudAuth.py` | pyicloud_ipd 登录 / 2FA / session（icloudpd 同源） |
| `ipdPhotos.py` | PhotoAsset 分类与 `photo.download(session, url)`（icloudpd v1.32.3 对齐） |
| `protocol.py` | line-JSON 事件与错误码 |

## 开发（源码调试）

依赖 **icloudpd v1.32.3** 的 vendored `pyicloud_ipd`（见 `vendor/icloud_photos_downloader-1.32.3/src`）。`build.ps1` 会在缺失时自动下载官方 zip 解压。

```powershell
cd apps/admin/sidecar/icloudSync
py -3 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:ICLOUD_SYNC_MOCK = "1"
py -3 agent.py
```

Rust 在 **开发模式** 可通过环境变量跳过捆绑 exe，直接跑源码 agent：

```powershell
# 在 apps/admin 或 Tauri 启动 shell 中设置（路径按本机调整）
$env:ICLOUD_SYNC_AGENT_CMD = "py -3 E:\path\to\apps\admin\sidecar\icloudSync\agent.py"
pnpm run cs:dev
```

`ICLOUD_SYNC_AGENT_CMD` 为完整命令行（含解释器 + 脚本路径）；未设置时 Rust 从 `app.path().resource_dir()` 解析 `icloud-sync-agent.exe`。

## 构建 exe（发布前必跑）

从 `apps/admin`：

```powershell
pnpm run cs:sidecar-build
```

或直接：

```powershell
cd apps/admin/sidecar/icloudSync
.\build.ps1
```

产物：

| 阶段 | 路径 |
|------|------|
| PyInstaller 输出 | `sidecar/icloudSync/dist/icloud-sync-agent.exe` |
| Tauri 资源（复制目标） | `src-tauri/resources/icloud-sync-agent.exe` |

`pnpm run cs:build` 会自动先跑 `cs:sidecar-build` 再 `tauri build`；也可单独执行 `cs:sidecar-build` 做 sidecar 迭代。  
`icloud-sync-agent.exe` 已加入 `src-tauri/.gitignore`，勿提交大体积二进制。

首次构建会自动创建 `.venv` 并安装 `requirements.txt` + PyInstaller。

构建后冒烟：

```powershell
'{"cmd":"version"}' | .\..\..\src-tauri\resources\icloud-sync-agent.exe
# 期望: {"type":"version","protocol":1,"agent":"0.1.0"}
```

## 运行测试

`pytest` 仅用于开发测试，不放入生产依赖清单。

```powershell
cd apps/admin/sidecar/icloudSync
py -3 -m pip install --user pytest
py -3 -m pytest tests/ -v
```

**Git：** `__pycache__`、`.pytest_cache`、`vendor/icloud_photos_downloader-*`（构建时由 `build.ps1` 下载）、`spike/` 等已写入 `.gitignore`，勿提交。

## Spike / 设计文档

| 项 | 位置 |
|----|------|
| 设计 | [`docs/superpowers/specs/2026-08-21-admin-cs-icloud-sync-design.md`](../../../docs/superpowers/specs/2026-08-21-admin-cs-icloud-sync-design.md) |
| Spike 结论 | [`docs/superpowers/specs/2026-08-21-icloud-sync-spike-notes.md`](../../../docs/superpowers/specs/2026-08-21-icloud-sync-spike-notes.md) |
