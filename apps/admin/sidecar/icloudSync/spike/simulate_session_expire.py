#!/usr/bin/env python3
"""
Session 失效探针 — 模拟 cookie / token 损坏并捕获 pyicloud 异常签名

职责：Spike Step 2；在已认证 session 目录上本地破坏持久化状态，触发 catalog/download 路径错误。
适用：开发机 + 真实 cookie_directory（无需重复输入密码时）。

安全：
- 默认 --dry-run 仅打印将修改的文件；--apply 才写入。
- 破坏前可选 --backup 复制 session 目录。
- 不打印 password；Apple ID 从环境变量读取。

用法：
  set ICLOUD_SPIKE_APPLE_ID=user@icloud.com
  set ICLOUD_SPIKE_COOKIE_DIR=C:\\path\\to\\session
  py -3 simulate_session_expire.py --method corrupt_token --dry-run
  py -3 simulate_session_expire.py --method corrupt_token --apply --probe photos
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Callable


@dataclass
class ProbeResult:
    """单次探针结果，便于回填 spike notes 映射表。"""

    method: str
    stage: str
    exceptionType: str | None
    exceptionMessage: str | None
    appleErrorCode: str | None
    httpStatus: int | None
    suggestedCode: str
    verified: bool = False


def _session_paths(cookie_dir: Path, apple_id: str) -> tuple[Path, Path]:
    """
    推断 pyicloud session 与 cookie 文件路径（与 pyicloud.base.PyiCloudService 一致）。
    @note 用户名过滤仅保留 \\w 字符
    """
    safe_name = "".join(c for c in apple_id if c.isalnum() or c in "_")
    session_path = cookie_dir / f"{safe_name}.session"
    cookie_path = cookie_dir / safe_name
    return session_path, cookie_path


def _backup_dir(cookie_dir: Path) -> Path:
    backup = cookie_dir.parent / f"{cookie_dir.name}.spike_backup"
    if backup.exists():
        shutil.rmtree(backup)
    shutil.copytree(cookie_dir, backup)
    return backup


def method_delete_session_file(session_path: Path, cookie_path: Path) -> None:
    if session_path.exists():
        session_path.unlink()


def method_corrupt_token(session_path: Path, cookie_path: Path) -> None:
    if not session_path.exists():
        raise FileNotFoundError(f"Session file missing: {session_path}")
    data = json.loads(session_path.read_text(encoding="utf-8"))
    data["session_token"] = "INVALID_SPIKE_TOKEN"
    session_path.write_text(json.dumps(data), encoding="utf-8")


def method_truncate_cookies(session_path: Path, cookie_path: Path) -> None:
    if cookie_path.exists():
        cookie_path.write_bytes(b"")


def method_corrupt_session_json(session_path: Path, cookie_path: Path) -> None:
    session_path.write_text("{ invalid json", encoding="utf-8")


METHODS: dict[str, Callable[[Path, Path], None]] = {
    "delete_session": method_delete_session_file,
    "corrupt_token": method_corrupt_token,
    "truncate_cookies": method_truncate_cookies,
    "corrupt_session_json": method_corrupt_session_json,
}


def _map_exception(exc: BaseException) -> ProbeResult:
    """
    将捕获的异常映射到产品 error code（与 spike notes 表一致，UNVERIFIED）。
    Task 1 应将此逻辑迁入 agent.py 并补单元测试。
    """
    exc_type = type(exc).__name__
    msg = str(exc)
    code: str | None = getattr(exc, "code", None)
    if code is not None:
        code = str(code)

    suggested = "auth_failed"
    if exc_type in ("PyiCloud2SARequiredException",):
        suggested = "need_2fa"
    elif exc_type in ("PyiCloudFailedLoginException",):
        suggested = "auth_failed"
    elif exc_type in ("PyiCloudAPIResponseException",):
        if code in ("AUTHENTICATION_FAILED", "421", "450", "500"):
            suggested = "session_expired"
        elif code == "ACCESS_DENIED":
            suggested = "rate_limited"
        elif code in ("ZONE_NOT_FOUND",):
            suggested = "auth_failed"
        elif code == "-20209" or (code and "-20209" in code):
            suggested = "account_locked"
        elif "Authentication required" in msg or "Invalid authentication token" in msg:
            suggested = "session_expired"
        else:
            suggested = "session_expired"
    elif "401" in msg:
        suggested = "session_expired"

    return ProbeResult(
        method="",
        stage="",
        exceptionType=exc_type,
        exceptionMessage=msg[:500],
        appleErrorCode=code,
        httpStatus=None,
        suggestedCode=suggested,
        verified=False,
    )


def _probe_photos(api: Any) -> ProbeResult:
    stage = "photos.all.first"
    try:
        next(iter(api.photos.all))
        return ProbeResult(
            method="",
            stage=stage,
            exceptionType=None,
            exceptionMessage="OK — session still valid (unexpected after corruption?)",
            appleErrorCode=None,
            httpStatus=None,
            suggestedCode="none",
            verified=False,
        )
    except Exception as exc:  # noqa: BLE001
        result = _map_exception(exc)
        result.stage = stage
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate iCloud session expiry for Spike Step 2")
    parser.add_argument(
        "--method",
        choices=list(METHODS.keys()),
        default="corrupt_token",
        help="Corruption strategy",
    )
    parser.add_argument("--apply", action="store_true", help="Apply corruption (default dry-run)")
    parser.add_argument("--backup", action="store_true", help="Backup cookie_dir before --apply")
    parser.add_argument(
        "--probe",
        choices=("none", "photos", "validate"),
        default="photos",
        help="After corruption, which API call to trigger",
    )
    args = parser.parse_args()

    apple_id = os.environ.get("ICLOUD_SPIKE_APPLE_ID", "").strip()
    cookie_dir_str = os.environ.get("ICLOUD_SPIKE_COOKIE_DIR", "").strip()
    password = os.environ.get("ICLOUD_SPIKE_PASSWORD", "")

    if not apple_id or not cookie_dir_str:
        print(
            "ERROR: Set ICLOUD_SPIKE_APPLE_ID and ICLOUD_SPIKE_COOKIE_DIR.\n"
            "Run after a successful auth that populated the session directory.",
            file=sys.stderr,
        )
        return 2

    cookie_dir = Path(cookie_dir_str)
    session_path, cookie_path = _session_paths(cookie_dir, apple_id)

    print(f"[plan] method={args.method} session={session_path} cookie={cookie_path}", file=sys.stderr)
    if not args.apply:
        print("[dry-run] No files modified. Pass --apply to execute.", file=sys.stderr)
        return 0

    if args.backup:
        backup = _backup_dir(cookie_dir)
        print(f"[backup] Copied to {backup}", file=sys.stderr)

    METHODS[args.method](session_path, cookie_path)
    print(f"[apply] Corruption applied: {args.method}", file=sys.stderr)

    if args.probe == "none":
        return 0

    try:
        from pyicloud import PyiCloudService
    except ImportError:
        print("ERROR: pyicloud not installed.", file=sys.stderr)
        return 2

    results: list[dict[str, Any]] = []
    try:
        api = PyiCloudService(apple_id, password or None, cookie_directory=str(cookie_dir))
        if args.probe == "validate":
            stage = "setup.validate"
            try:
                api.session.post(f"{api.SETUP_ENDPOINT}/validate", data="null")
                pr = ProbeResult(
                    method=args.method,
                    stage=stage,
                    exceptionType=None,
                    exceptionMessage="validate OK",
                    appleErrorCode=None,
                    httpStatus=None,
                    suggestedCode="none",
                )
            except Exception as exc:  # noqa: BLE001
                pr = _map_exception(exc)
                pr.method = args.method
                pr.stage = stage
            results.append(asdict(pr))
        if args.probe in ("photos",):
            pr = _probe_photos(api)
            pr.method = args.method
            results.append(asdict(pr))
    except Exception as exc:  # noqa: BLE001 — constructor/auth path
        pr = _map_exception(exc)
        pr.method = args.method
        pr.stage = "PyiCloudService.__init__"
        results.append(asdict(pr))

    print(json.dumps({"spikeStatus": "待真实账号验证", "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
