# Session 失效模拟 — 操作说明

**状态：** 待真实账号验证  
**脚本：** [`simulate_session_expire.py`](./simulate_session_expire.py)

## 前置

1. 已完成一次 pyicloud 登录，`ICLOUD_SPIKE_COOKIE_DIR` 下存在 `.session` 与 cookie jar。
2. **先备份** session 目录（脚本 `--backup` 或手动复制）。

## 推荐流程

```powershell
cd apps/admin/sidecar/icloudSync/spike

$env:ICLOUD_SPIKE_APPLE_ID = "your@icloud.com"
$env:ICLOUD_SPIKE_COOKIE_DIR = "C:\path\to\icloud-sync\session"

# 1. 预览
py -3 simulate_session_expire.py --method corrupt_token --dry-run

# 2. 破坏 + 探针
py -3 simulate_session_expire.py --method corrupt_token --apply --backup --probe photos
```

## 方法对照

| `--method` | 模拟场景 |
|------------|---------|
| `corrupt_token` | session token 无效（中途过期近似） |
| `truncate_cookies` | cookie jar 清空（Web auth cookie 丢失） |
| `delete_session` | 删除 `.session` 文件 |
| `corrupt_session_json` | session 文件损坏 |

## 回填 spike notes

将脚本 stdout JSON 中 `results[].exceptionType` / `appleErrorCode` / `suggestedCode` 填入  
[`docs/superpowers/specs/2026-08-21-icloud-sync-spike-notes.md`](../../../../docs/superpowers/specs/2026-08-21-icloud-sync-spike-notes.md) Step 2 映射表，并将对应行 `UNVERIFIED` 改为已验证。

## 真实失效（可选）

在 https://appleid.apple.com 或 iCloud 网页「退出所有浏览器会话」后，对**未中断的** sidecar 进程发 `catalog`/`download`，观察是否与 `corrupt_token` 同类异常。
