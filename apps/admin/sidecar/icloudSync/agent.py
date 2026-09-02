#!/usr/bin/env python3
"""
iCloud Sync sidecar agent skeleton (line-JSON over stdin/stdout).

职责：
- 读取宿主逐行 JSON 命令并输出逐行 JSON 事件。
- 提供 ICLOUD_SYNC_MOCK=1 的离线路径，确保无网络环境可验证协议。
- 将 pyicloud_ipd（icloudpd）异常映射到稳定机读错误码。

适用场景：
- Task 1 协议联调与离线测试。
- 后续 Task 5/6 在此骨架上接入真实 catalog/download。
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

from protocol import (
    CODE_ACCOUNT_LOCKED,
    CODE_AUTH_FAILED,
    CODE_CATALOG_SORT_MISSING,
    CODE_DELETE_FAILED,
    CODE_DOMAIN_MISMATCH,
    CODE_INVALID_REQUEST,
    CODE_LIVE_BIND_MISSING,
    CODE_NEED_2FA,
    CODE_RATE_LIMITED,
    CODE_SESSION_EXPIRED,
    CODE_DOWNLOAD_FAILED,
    CatalogSortMissingError,
    LiveBindMissingError,
    done_event,
    error_event,
    need_2fa_event,
    version_event,
)

import authDiagnostic as auth_diag
import icloudAuth as ipd_auth
import ipdPhotos as ipd_photos

CATALOG_VIEWS = {"library", "recents"}

MOCK_CATALOG_ITEMS: list[dict[str, Any]] = [
    {
        "asset_id": "A1",
        "filename": "IMG_1.HEIC",
        "media_kind": "live",
        "live_pair_id": "L1",
        "capture_at": "2024-01-01T12:00:00Z",
        "added_at": "2024-01-02T12:00:00Z",
        "parts": ["still", "mov"],
        "cpl_asset_record_name": "CPL-A1",
        "cpl_asset_change_tag": "tag-a1",
    },
    {
        "asset_id": "A2",
        "filename": "IMG_2.JPG",
        "media_kind": "photo",
        "live_pair_id": None,
        "capture_at": "2024-01-03T12:00:00Z",
        "added_at": "2024-01-04T12:00:00Z",
        "parts": ["still"],
        "cpl_asset_record_name": "CPL-A2",
        "cpl_asset_change_tag": "tag-a2",
    },
]


@dataclass
class AuthState:
    """缓存当前 sidecar 进程内的认证状态与待提交 2FA 会话。"""

    api: Any | None = None
    apple_id: str = ""
    session_dir: str = ""
    waiting_2fa: bool = False
    # 是否已对当前 challenge 触发过 request_2fa；避免重复推送导致设备弹窗风暴
    mfa_delivery_kicked_off: bool = False
    # auth 阶段记录的投递方式；bridge 超时后 pyicloud 可能丢 delivery_method
    delivery_method: str = ""
    last_kickoff_path: str = ""
    last_validate_path: str = ""
    # SMS 路径：pyicloud_ipd validate_2fa_code_sms 所需 device id
    sms_device_id: int | None = None
    # 当前会话使用的 iCloud 根域（com / cn）
    icloud_domain: str = ""
    # download 前 records/lookup 写入的 asset_id → PhotoAsset（仅进程内缓存）
    photo_cache: dict[str, Any] | None = None
    # 每个 asset_id 最近一次 lookup 时刻（monotonic）；10min 内复用，410 后 invalidate
    photo_url_fetched_at: dict[str, float] = field(default_factory=dict)


_AUTH_STATE = AuthState()

# 2FA 收尾：单次 trust_session（社区 icloudpd 标准）；establish 阶段不再循环打 Apple API
_WEBAUTH_SETTLE_SEC = 1.0
# 同 asset 在窗口内不重复 records/lookup，降 Apple API 压力；410 会强制刷新
PHOTO_URL_CACHE_TTL_SEC = 600
_PHOTO_URL_REFRESH_LOCK = threading.Lock()


def _configure_stdio_utf8() -> None:
    """
    Windows 下 PyInstaller 子进程 stdout 默认可能是 GBK，catalog 含 emoji/中文文件名时会
    UnicodeEncodeError 直接杀进程（宿主侧表现为 stdout reader disconnected）。
    """
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _write_event(event: dict[str, Any]) -> None:
    """
    输出单行 JSON 事件并立即 flush。

    @note line-JSON flush 是宿主端实时读取与状态机推进的前提。
    @note 优先写 UTF-8 bytes，避免 Windows 管道默认 GBK 编码崩溃。
    """
    payload = json.dumps(event, ensure_ascii=False) + "\n"
    buffer = getattr(sys.stdout, "buffer", None)
    if buffer is not None:
        buffer.write(payload.encode("utf-8"))
        buffer.flush()
        return
    sys.stdout.write(payload)
    sys.stdout.flush()


def _read_cmd(line: str) -> dict[str, Any]:
    """解析输入命令 JSON。"""
    payload = json.loads(line)
    if not isinstance(payload, dict):
        raise ValueError("command payload must be a JSON object")
    return payload


def _is_mock_mode() -> bool:
    """判断是否启用离线 mock 模式。"""
    return os.environ.get("ICLOUD_SYNC_MOCK", "").strip() == "1"


def _load_pycloud_service() -> Any:
    """延迟导入 pyicloud_ipd.PyiCloudService（icloudpd 同源库）。"""
    return ipd_auth.load_service_class()


_PYICLOUD_2FA_EXCEPTIONS: tuple[type[BaseException], ...] | None = None


def _get_pycloud_2fa_exception_classes() -> tuple[type[BaseException], ...]:
    """延迟加载 pyicloud_ipd 2FA/2SA 相关异常类型。"""
    global _PYICLOUD_2FA_EXCEPTIONS
    if _PYICLOUD_2FA_EXCEPTIONS is not None:
        return _PYICLOUD_2FA_EXCEPTIONS
    _PYICLOUD_2FA_EXCEPTIONS = ipd_auth.load_2fa_exception_classes()
    return _PYICLOUD_2FA_EXCEPTIONS


def _is_2fa_required_exception(exc: BaseException) -> bool:
    """
    判断异常是否表示需要 2FA/2SA 验证。

    @note pyicloud 有时抛 PyiCloud2SARequiredException 而非设置 requires_2fa 标志。
    """
    for exc_cls in _get_pycloud_2fa_exception_classes():
        if isinstance(exc, exc_cls):
            return True

    exc_type = type(exc).__name__
    if exc_type in ("PyiCloud2SARequiredException",):
        return True
    if "2SARequired" in exc_type or "2FARequired" in exc_type:
        return True
    return False


def _code_to_str(raw_code: Any) -> str:
    """统一将异常 code 规整为字符串。"""
    if raw_code is None:
        return ""
    return str(raw_code)


def _map_exception(exc: BaseException) -> str:
    """
    将异常映射到稳定机读错误码（占位映射，后续可按实测收敛）。

    @note 这里对异常 message/code 做多条件兜底，是为兼容 pyicloud 在不同路径下
          抛出类型一致但 detail 差异较大的现实情况。
    """
    exc_type = type(exc).__name__
    msg = str(exc)
    code = _code_to_str(getattr(exc, "code", None))
    lowered_msg = msg.lower()

    if _is_2fa_required_exception(exc):
        return CODE_NEED_2FA
    mapped = ipd_auth.map_api_exception(exc, is_2fa_required=_is_2fa_required_exception)
    if mapped:
        return mapped
    if isinstance(exc, ipd_auth.IcloudDomainMismatchError) or ipd_auth.is_domain_mismatch_exception(exc):
        return CODE_DOMAIN_MISMATCH
    if exc_type in ("PyiCloudFailedLoginException",):
        return CODE_AUTH_FAILED
    if _is_stale_download_url_error(exc):
        return CODE_DOWNLOAD_FAILED
    if exc_type in ("PyiCloudAPIResponseException",):
        if code in ("410", "404", "GONE") or "gone (410)" in lowered_msg:
            return CODE_DOWNLOAD_FAILED
        if code in ("AUTHENTICATION_FAILED", "421", "450", "500"):
            return CODE_SESSION_EXPIRED
        if code == "ACCESS_DENIED":
            return CODE_RATE_LIMITED
        if code in ("ZONE_NOT_FOUND",):
            return CODE_AUTH_FAILED
        if code == "-20209" or "-20209" in code:
            return CODE_ACCOUNT_LOCKED
        if "Authentication required" in msg or "Invalid authentication token" in msg:
            return CODE_SESSION_EXPIRED
        return CODE_SESSION_EXPIRED
    if "-20209" in code or "-20209" in msg:
        return CODE_ACCOUNT_LOCKED
    if any(
        phrase in lowered_msg
        for phrase in (
            "account locked",
            "security reasons",
            "temporarily disabled",
            "your account has been disabled",
        )
    ):
        return CODE_ACCOUNT_LOCKED
    if "401" in msg:
        return CODE_SESSION_EXPIRED
    return CODE_AUTH_FAILED


def _is_stale_download_url_error(exc: BaseException) -> bool:
    """
    iCloud Photos CDN 签名 URL 过期（HTTP 410/404 或 Gone）。

    @note 与 session_expired 不同：此时 WEBAUTH / trustedSession 往往仍有效。
    """
    msg = str(exc).lower()
    code = _code_to_str(getattr(exc, "code", None))
    if code in ("410", "404", "GONE"):
        return True
    if "gone (410)" in msg or "http 410" in msg or "http 404" in msg:
        return True
    return False


def _map_download_exception(exc: BaseException) -> str:
    """下载阶段异常映射，避免 CDN 410 误判为 session_expired 导致整 job 暂停。"""
    if _is_stale_download_url_error(exc):
        return CODE_DOWNLOAD_FAILED
    return _map_exception(exc)


def _photo_cache_bucket() -> dict[str, Any]:
    """获取可写的 asset_id → PhotoAsset 缓存桶。"""
    cache = _AUTH_STATE.photo_cache
    if not isinstance(cache, dict):
        cache = {}
        _AUTH_STATE.photo_cache = cache
    return cache


def _merge_photos_into_cache(photos: dict[str, Any]) -> None:
    """将 lookup PhotoAsset 写入进程内 cache（仅服务 download URL；删云不读此 cache）。"""
    if not photos:
        return
    cache = _photo_cache_bucket()
    now = time.monotonic()
    for asset_id, photo in photos.items():
        normalized = str(asset_id).strip()
        if normalized:
            cache[normalized] = photo
            _AUTH_STATE.photo_url_fetched_at[normalized] = now


def _asset_lookup_is_fresh(asset_id: str) -> bool:
    """cache 中已有且 lookup 未超过 PHOTO_URL_CACHE_TTL_SEC。"""
    normalized = str(asset_id).strip()
    if not normalized:
        return False
    cache = _AUTH_STATE.photo_cache
    if not isinstance(cache, dict) or normalized not in cache:
        return False
    fetched_at = _AUTH_STATE.photo_url_fetched_at.get(normalized, 0.0)
    if fetched_at <= 0:
        return False
    return (time.monotonic() - fetched_at) <= PHOTO_URL_CACHE_TTL_SEC


def _lookup_needed_asset_ids(asset_ids: Sequence[str], *, force: bool = False) -> list[str]:
    """筛选需要 records/lookup 的 asset_id（缺失、过期或 force）。"""
    needed: list[str] = []
    seen: set[str] = set()
    for asset_id in asset_ids:
        normalized = str(asset_id).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        if force or not _asset_lookup_is_fresh(normalized):
            needed.append(normalized)
    return needed


def _invalidate_asset_lookup(asset_id: str) -> None:
    """410/404 后清除 lookup 时间戳，强制下次 refresh。"""
    normalized = str(asset_id).strip()
    if normalized:
        _AUTH_STATE.photo_url_fetched_at.pop(normalized, None)


def _unique_asset_ids_from_items(items: Iterable[dict[str, Any]]) -> list[str]:
    """从 download_batch items 提取去重后的 asset_id 列表（保持首次出现顺序）。"""
    ordered: list[str] = []
    seen: set[str] = set()
    for item in items:
        asset_id = str(item.get("asset_id", "")).strip()
        if asset_id and asset_id not in seen:
            seen.add(asset_id)
            ordered.append(asset_id)
    return ordered


def _refresh_asset_urls(api: Any, asset_ids: Sequence[str], *, force: bool = False) -> None:
    """
    经 records/lookup 拉取 downloadURL。

    @note 10min 内同 asset 复用 cache；force=True 或 410 invalidate 后必 lookup。
    """
    unique = list(dict.fromkeys(str(asset_id).strip() for asset_id in asset_ids if str(asset_id).strip()))
    if not unique:
        return
    with _PHOTO_URL_REFRESH_LOCK:
        needed = _lookup_needed_asset_ids(unique, force=force)
        if not needed:
            return
        photos = ipd_photos.fetch_photo_assets_by_ids(api, needed)
        _merge_photos_into_cache(photos)


def _ensure_batch_download_assets(api: Any, items: list[dict[str, Any]]) -> None:
    """download_batch 开始前：对本批去重 asset_id 做 records/lookup（10min 内跳过已缓存）。"""
    _refresh_asset_urls(api, _unique_asset_ids_from_items(items))


def _refresh_photo_cache_on_stale_url(api: Any, asset_ids: Sequence[str]) -> None:
    """遇 410/404 时 invalidate 并强制重新 lookup。"""
    for asset_id in asset_ids:
        _invalidate_asset_lookup(asset_id)
    _refresh_asset_urls(api, asset_ids, force=True)


def _session_files_present(session_dir: str, apple_id: str) -> bool:
    """session 目录是否已有当前账号落盘文件。"""
    if not session_dir or not apple_id.strip():
        return False
    stem = "".join(c for c in apple_id.strip() if c.isalnum() or c == "_")
    base = Path(session_dir)
    return (base / f"{stem}.session").is_file() or (base / stem).is_file()


def _build_diagnostic(
    *,
    stage: str,
    code: str,
    message: str,
    exc: Exception | None = None,
    apple_id: str | None = None,
    session_dir: str | None = None,
    api: Any | None = None,
) -> dict[str, Any]:
    """封装 authDiagnostic.build_auth_diagnostic，注入 agent 侧依赖。"""
    resolved_apple = (apple_id if apple_id is not None else _AUTH_STATE.apple_id).strip()
    resolved_session = (session_dir if session_dir is not None else _AUTH_STATE.session_dir).strip()
    resolved_api = _AUTH_STATE.api if api is None else api
    return auth_diag.build_auth_diagnostic(
        stage=stage,
        code=code,
        message=message,
        apple_id=resolved_apple,
        session_dir=resolved_session,
        api=resolved_api,
        auth_state=_AUTH_STATE,
        has_webauth=_has_webauth_token,
        session_auth_snapshot=_session_auth_snapshot,
        supports_bridge=_supports_trusted_device_bridge,
        delivery_method=_two_factor_delivery_method,
        session_files_present=_session_files_present(resolved_session, resolved_apple),
        validate_path=_AUTH_STATE.last_validate_path,
        kickoff_path=_AUTH_STATE.last_kickoff_path,
        exc=exc,
    )


def _record_diagnostic(
    stage: str,
    code: str,
    message: str,
    *,
    exc: Exception | None = None,
    apple_id: str | None = None,
    session_dir: str | None = None,
    api: Any | None = None,
) -> dict[str, Any]:
    """
    全流程诊断落盘；成功 / 挑战 / 失败均覆盖 auth-diagnostic.json。

    @returns 诊断 dict；session_dir 为空时跳过落盘并返回空 dict
    """
    resolved_session = (session_dir if session_dir is not None else _AUTH_STATE.session_dir).strip()
    if not resolved_session:
        return {}
    return _build_diagnostic(
        stage=stage,
        code=code,
        message=message,
        exc=exc,
        apple_id=apple_id,
        session_dir=session_dir,
        api=api,
    )


def _record_auth_success(stage: str, message: str, *, api: Any | None = None) -> dict[str, Any]:
    """登录 / probe / catalog 成功节点落盘，覆盖先前的 need_2fa 快照。"""
    if not _AUTH_STATE.session_dir.strip():
        return {}
    return auth_diag.record_success_snapshot(
        stage=stage,
        message=message,
        apple_id=_AUTH_STATE.apple_id,
        session_dir=_AUTH_STATE.session_dir,
        api=_AUTH_STATE.api if api is None else api,
        auth_state=_AUTH_STATE,
        has_webauth=_has_webauth_token,
        session_auth_snapshot=_session_auth_snapshot,
        supports_bridge=_supports_trusted_device_bridge,
        delivery_method=_two_factor_delivery_method,
    )


def _auth_error(
    cmd: str,
    code: str,
    message: str,
    *,
    stage: str,
    exc: Exception | None = None,
) -> dict[str, Any]:
    """构造带 diagnostic 的 error 事件并落盘。"""
    diagnostic = _build_diagnostic(stage=stage, code=code, message=message, exc=exc)
    return error_event(cmd, code, message, diagnostic=diagnostic)


def _reset_auth_state() -> None:
    """清空进程内认证状态，等待用户显式重新 auth。"""
    _AUTH_STATE.api = None
    _AUTH_STATE.apple_id = ""
    _AUTH_STATE.session_dir = ""
    _AUTH_STATE.waiting_2fa = False
    _AUTH_STATE.mfa_delivery_kicked_off = False
    _AUTH_STATE.delivery_method = ""
    _AUTH_STATE.last_kickoff_path = ""
    _AUTH_STATE.last_validate_path = ""
    _AUTH_STATE.sms_device_id = None
    _AUTH_STATE.icloud_domain = ""
    _AUTH_STATE.photo_cache = None
    _AUTH_STATE.photo_url_fetched_at = {}


def _has_webauth_token(api: Any) -> bool:
    return ipd_auth.has_webauth_token(api)


def _session_auth_snapshot(api: Any) -> dict[str, Any]:
    """读取 pyicloud_ipd 当前鉴权快照。"""
    if hasattr(api, "get_auth_status"):
        status = api.get_auth_status()
        if isinstance(status, dict):
            return dict(status)
    return ipd_auth.auth_snapshot(api)


def _is_fully_authenticated(api: Any) -> bool:
    """登录是否完成到可访问 Photos 的程度（含 WEBAUTH cookie）。"""
    snap = _session_auth_snapshot(api)
    if snap.get("authenticated"):
        return True
    return _has_webauth_token(api) and bool(snap.get("trusted_session"))


def _mfa_still_required(api: Any) -> bool:
    """
    是否仍处于 MFA 未完成态。

    @note 主号「受信任设备弹窗」时 requires_2fa 可能为 False，但 WEBAUTH 仍缺失。
    """
    if _is_fully_authenticated(api):
        return False
    snap = _session_auth_snapshot(api)
    if snap.get("requires_2fa") or snap.get("requires_2sa"):
        return True
    if bool(getattr(api, "_requires_mfa", False)):
        return True
    try:
        sd = ipd_auth.session_data(api)
        if sd.get("session_token") and not _has_webauth_token(api):
            return True
    except Exception:
        pass
    return False


def _two_factor_delivery_method(api: Any) -> str:
    """当前 HSA2 验证投递方式（对齐 icloudpd infer）。"""
    return ipd_auth.infer_delivery_method(api, _AUTH_STATE.delivery_method)


def _delivery_detail(api: Any) -> str:
    """面向用户的 2FA 引导文案（不含敏感信息）。"""
    method = _two_factor_delivery_method(api)
    notice = getattr(api, "two_factor_delivery_notice", None)
    if method == "sms":
        return "请输入发送到受信任设备或手机的 6 位验证码"
    if method == "security_key":
        return "此账号需使用安全密钥完成验证，当前客户端暂不支持"
    if notice:
        return str(notice)
    # trusted_device / unknown：iPhone 上通常显示「设备验证」→ 点允许 → 6 位码
    return (
        "iPhone 将弹出「设备验证」或登录请求：请先在手机上点「允许」，"
        "再将设备上显示的 6 位验证码输入下方"
    )


def _trigger_2fa_push_notification(api: Any) -> bool:
    """icloudpd trigger_push_notification 包装。"""
    return ipd_auth.kickoff_2fa_push(api)


def _supports_trusted_device_bridge(api: Any) -> bool:
    return ipd_auth.supports_trusted_device_bridge(api)


def _kickoff_mfa_delivery(api: Any) -> None:
    """
    触发 2FA 推送（对齐 icloudpd request_2fa / request_2fa_web）。

    @note 仅 trigger_push_notification（PUT）；不再叠加 bridge / request_2fa_code。
    """
    ok = ipd_auth.kickoff_2fa_push(api)
    _AUTH_STATE.last_kickoff_path = "ipd_put" if ok else "ipd_put_failed"


def _try_finalize_trusted_session(api: Any) -> bool:
    """
    2FA 验证码接受后，单次 trust_session 换取 WEBAUTH cookie。

    @note trust_session = GET /2sv/trust + accountLogin；仅 session_token，不走 SRP 密码登录。
    @note pyicloud validate_2fa_code 内置 trust 可能失败但仍返回 True，调用方需补调本函数。
    @returns trust_session 是否返回 True
    """
    if not hasattr(api, "trust_session"):
        return False
    return bool(api.trust_session())


def _try_account_login_with_token(api: Any) -> bool:
    """
    仅用 session_token + trust_token 走 setup accountLogin（不触发 SRP 密码登录）。

    @note 当 validate POST 已写入 trust_token 但 trust_session 内 GET /2sv/trust 失败时的兜底。
    """
    session_data = getattr(getattr(api, "session", None), "data", None)
    if session_data is None:
        session_data = getattr(api, "session_data", {}) or {}
    if not session_data.get("session_token"):
        return False
    auth_fn = getattr(api, "_authenticate_with_token", None)
    if not callable(auth_fn):
        return False
    try:
        auth_fn()
        return True
    except Exception:
        return False


def _persist_session_cookies(api: Any) -> None:
    """将 pyicloud cookie jar 落盘，供后续 catalog/download 复用。"""
    try:
        cookies = api.session.cookies
        if hasattr(cookies, "save"):
            cookies.save()
    except Exception:
        pass


def _establish_webauth_after_2fa(
    api: Any,
    *,
    allow_trust_retry: bool = False,
    validate_stage: str = "",
) -> bool:
    """
    验证码路径完成后确认 WEBAUTH（锁号优先）。

    @param allow_trust_retry validate_2fa_code 返回 True 但 WEBAUTH 仍缺失时，补 trust / accountLogin。
    @note 仅使用 session_token + trust_token，禁止 authenticate(force_refresh=True)。
    """
    import time

    if _is_fully_authenticated(api):
        _persist_session_cookies(api)
        return True

    time.sleep(_WEBAUTH_SETTLE_SEC)
    if _is_fully_authenticated(api):
        _persist_session_cookies(api)
        return True

    if not allow_trust_retry:
        return False

    if _try_finalize_trusted_session(api):
        suffix = f"{validate_stage}:trust_retry" if validate_stage else "trust_retry"
        _AUTH_STATE.last_validate_path = suffix
    if _is_fully_authenticated(api):
        _persist_session_cookies(api)
        return True

    if _try_account_login_with_token(api):
        suffix = f"{validate_stage}:account_login_retry" if validate_stage else "account_login_retry"
        _AUTH_STATE.last_validate_path = suffix
    if _is_fully_authenticated(api):
        _persist_session_cookies(api)
        return True

    if validate_stage:
        _AUTH_STATE.last_validate_path = f"{validate_stage}:webauth_pending"
    return False


def _maybe_rekickoff_mfa_for_retry(api: Any) -> None:
    """
    验证码已被 Apple 接受但 WEBAUTH 未就绪时，重新 PUT 推送设备验证。

    @note 允许用户在同弹窗内点「允许」换码，无需 logout 重登。
    """
    path = _AUTH_STATE.last_validate_path
    if path == "validate_2fa_code:false" or path.startswith("sms"):
        return
    if not path.startswith("validate_2fa_code"):
        return
    _trigger_2fa_push_notification(api)
    _AUTH_STATE.last_kickoff_path = "ipd_put_retry"
    _AUTH_STATE.mfa_delivery_kicked_off = True


def _auth_2fa_failure_message() -> str:
    """按 last_validate_path 返回更精确的 auth_2fa 失败文案。"""
    path = _AUTH_STATE.last_validate_path
    if path == "validate_2fa_code:false":
        return "验证码错误；请确认 iPhone 上显示的 6 位数字与当前弹窗一致"
    if path.endswith(":webauth_pending") or path.endswith(":trust_retry") or path.endswith(
        ":account_login_retry"
    ):
        return (
            "验证码已被接受但 Photos session 未就绪；已在 iPhone 重新推送「设备验证」，"
            "请点「允许」并尽快输入新验证码"
        )
    if path == "validate_2fa_code":
        return (
            "验证码已被接受但 session 未完全建立；请在 iPhone 重新点「允许」并尽快输入新验证码"
        )
    return "验证码无效或 session 未就绪；请在设备上重新点「允许」并尽快输入新验证码"


def _submit_2fa_code(api: Any, code: str, delivery_method: str) -> bool:
    """
    提交 2FA 验证码（锁号优先 · pyicloud 社区标准）。

    @note trusted_device / unknown：validate_2fa_code（bridge 或 legacy POST + 内置单次 trust）。
    @note sms：_validate_sms_code + 至多一次补 trust。
    """
    method = (delivery_method or _two_factor_delivery_method(api) or "unknown").strip()

    try:
        if method == "sms":
            _AUTH_STATE.last_validate_path = "sms"
            if not ipd_auth.submit_sms_code(api, code, _AUTH_STATE.sms_device_id):
                _AUTH_STATE.last_validate_path = "sms:false"
                return False
            return _establish_webauth_after_2fa(api, allow_trust_retry=True)
        if hasattr(api, "validate_2fa_code"):
            _AUTH_STATE.last_validate_path = "validate_2fa_code"
            if not bool(api.validate_2fa_code(code)):
                _AUTH_STATE.last_validate_path = "validate_2fa_code:false"
                return False
        else:
            _AUTH_STATE.last_validate_path = "validate:unsupported"
            return False
    except Exception as exc:
        _AUTH_STATE.last_validate_path = f"validate_exception:{type(exc).__name__}"
        if _is_fully_authenticated(api):
            _persist_session_cookies(api)
            return True
        raise

    if _is_fully_authenticated(api):
        _persist_session_cookies(api)
        return True
    return _establish_webauth_after_2fa(
        api,
        allow_trust_retry=True,
        validate_stage="validate_2fa_code",
    )


def _poll_trusted_device_completion(
    api: Any,
    *,
    timeout_sec: float = 6.0,
    interval_sec: float = 2.0,
) -> bool:
    """
    轮询受信任设备「允许」后的 session 完成态。

    @note UI 始终要求输入验证码，此路径极少触发；限制轮次与 trust 调用，避免长时间打 Apple API。
    """
    import time

    deadline = time.monotonic() + timeout_sec
    trusted_once = False
    while time.monotonic() < deadline:
        if _is_fully_authenticated(api):
            return True
        if not trusted_once:
            trusted_once = True
            _try_finalize_trusted_session(api)
        if _is_fully_authenticated(api):
            return True
        time.sleep(interval_sec)
    return False


def _need_2fa_response(api: Any, cmd: str) -> dict[str, Any]:
    """构造 need_2fa 事件并缓存 delivery_method 供后续 auth_2fa 使用。"""
    method = _AUTH_STATE.delivery_method or _two_factor_delivery_method(api)
    if method and method != "unknown":
        _AUTH_STATE.delivery_method = method
    return need_2fa_event(cmd, _delivery_detail(api), delivery_method=method or "unknown")


def _finalize_auth_or_need_2fa(api: Any, cmd: str, *, kickoff_delivery: bool = True) -> dict[str, Any]:
    """
    auth/auth_2fa 共用：已完全登录则 done，否则进入 need_2fa。

    @param kickoff_delivery 为 False 时不再 request_2fa，避免重复推送（如同步前 probe、待输入验证码时）。
    """
    if _is_fully_authenticated(api):
        _AUTH_STATE.waiting_2fa = False
        _AUTH_STATE.mfa_delivery_kicked_off = False
        _AUTH_STATE.delivery_method = ""
        _record_auth_success(cmd, f"{cmd} completed; session ready", api=api)
        return done_event(cmd)

    _AUTH_STATE.waiting_2fa = True
    if kickoff_delivery and not _AUTH_STATE.mfa_delivery_kicked_off:
        try:
            _kickoff_mfa_delivery(api)
            _AUTH_STATE.mfa_delivery_kicked_off = True
            method = _two_factor_delivery_method(api)
            if method and method != "unknown":
                _AUTH_STATE.delivery_method = method
        except Exception:
            pass
    return _attach_challenge_diagnostic(_need_2fa_response(api, cmd), api, cmd)


def _attach_challenge_diagnostic(event: dict[str, Any], api: Any, stage: str) -> dict[str, Any]:
    """need_2fa 事件附带 challenge 快照，便于与后续失败一次对比。"""
    event["diagnostic"] = auth_diag.record_challenge_snapshot(
        stage=stage,
        apple_id=_AUTH_STATE.apple_id,
        session_dir=_AUTH_STATE.session_dir,
        api=api,
        auth_state=_AUTH_STATE,
        has_webauth=_has_webauth_token,
        session_auth_snapshot=_session_auth_snapshot,
        supports_bridge=_supports_trusted_device_bridge,
        delivery_method=_two_factor_delivery_method,
        kickoff_path=_AUTH_STATE.last_kickoff_path,
    )
    return event


def _to_iso8601(value: Any) -> str | None:
    """将 pyicloud 可能返回的时间值统一成 UTC ISO8601 字符串。"""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value) / 1000.0, tz=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        return value
    return None


def _photo_asset_id(photo: Any) -> str:
    """读取 PhotoAsset 稳定 id（pyicloud_ipd PhotoAsset.id）。"""
    if ipd_photos.is_ipd_photo_asset(photo):
        return ipd_photos.photo_asset_id(photo)
    for attr in ("id", "asset_id"):
        value = getattr(photo, attr, None)
        if value:
            return str(value).strip()
    return ""


def _catalog_item_from_photo(photo: Any, view: str) -> dict[str, Any]:
    """将 pyicloud_ipd PhotoAsset 转换为 sidecar catalog item。"""
    if not ipd_photos.is_ipd_photo_asset(photo):
        raise RuntimeError("unsupported photo asset type; expected pyicloud_ipd PhotoAsset")

    capture_at = _to_iso8601(getattr(photo, "asset_date", None))
    added_at = _to_iso8601(getattr(photo, "added_date", None))
    media_kind, live_pair_id = ipd_photos.ipd_media_kind(photo)

    if view == "library" and not capture_at:
        raise CatalogSortMissingError("missing capture_at for library view")
    if view == "recents" and not added_at:
        raise CatalogSortMissingError("missing added_at for recents view")

    parts = ["still", "mov"] if media_kind == "live" else (["video"] if media_kind == "video" else ["still"])

    asset_id = _photo_asset_id(photo)
    if not asset_id:
        raise LiveBindMissingError("asset id missing")

    item: dict[str, Any] = {
        "asset_id": asset_id,
        "filename": getattr(photo, "filename", "") or f"{asset_id}.bin",
        "media_kind": media_kind,
        "live_pair_id": live_pair_id,
        "capture_at": capture_at,
        "added_at": added_at,
        "parts": parts,
        **ipd_photos.cpl_asset_meta_from_photo(photo),
    }
    latitude, longitude = ipd_photos.catalog_location_from_photo(photo)
    if latitude is not None and longitude is not None:
        item["latitude"] = latitude
        item["longitude"] = longitude
    return item


def _iter_view_assets(api: Any, view: str) -> Any:
    """按视图返回 pyicloud 资产可迭代对象。"""
    photos = getattr(api, "photos", None)
    if photos is None:
        raise RuntimeError("photos service unavailable")
    if view == "library":
        return photos.all
    root_library = getattr(photos, "_root_library", None)
    if root_library is not None and hasattr(root_library, "recently_added"):
        return root_library.recently_added()
    if hasattr(photos, "recently_added"):
        return photos.recently_added()
    albums = getattr(photos, "albums", None) or {}
    album = albums.get("Recents") or albums.get("Recently Added")
    if not album:
        raise RuntimeError("recents album unavailable")
    return album


def _active_api() -> Any:
    """获取当前认证会话（仅内存态，无则抛错）。"""
    api = _AUTH_STATE.api
    if api is None:
        raise RuntimeError("not authenticated")
    return api


def _ensure_api(apple_id: str = "", session_dir: str = "") -> Any:
    """
    获取已认证 pyicloud 客户端。

    优先复用进程内 _AUTH_STATE（须 apple_id 一致）；否则用 session_dir 恢复。
    @note sidecar 进程重启后 catalog/download 仍可通过 session 文件续用登录态。
    """
    aid = (apple_id or _AUTH_STATE.apple_id).strip()
    sd = (session_dir or _AUTH_STATE.session_dir).strip()
    if not aid or not sd:
        raise RuntimeError("not authenticated")

    if (
        _AUTH_STATE.api is not None
        and _AUTH_STATE.apple_id.strip() == aid
        and _AUTH_STATE.session_dir.strip() == sd
        and not _AUTH_STATE.waiting_2fa
    ):
        return _AUTH_STATE.api

    if _AUTH_STATE.api is not None and _AUTH_STATE.apple_id.strip() != aid:
        _reset_auth_state()

    api = _build_api(
        apple_id=aid,
        password="",
        session_dir=sd,
        icloud_domain=_AUTH_STATE.icloud_domain
        or ipd_auth.load_domain_hint(sd, aid)
        or ipd_auth.DEFAULT_ICLOUD_DOMAIN,
    )
    _AUTH_STATE.api = api
    _AUTH_STATE.apple_id = aid
    _AUTH_STATE.session_dir = sd
    _AUTH_STATE.waiting_2fa = False
    return api


def _resolve_icloud_domain(cmd: dict[str, Any], session_dir: str, apple_id: str) -> str:
    """从 auth 命令或落盘偏好解析 iCloud 根域（默认 com）。"""
    explicit = ipd_auth.normalize_icloud_domain(cmd.get("icloud_domain"))
    if explicit:
        return explicit
    return ipd_auth.load_domain_hint(session_dir, apple_id) or ipd_auth.DEFAULT_ICLOUD_DOMAIN


def _build_api(
    apple_id: str,
    password: str,
    session_dir: str,
    *,
    icloud_domain: str,
    allow_domain_fallback: bool = False,
) -> Any:
    """创建 pyicloud_ipd API 客户端（icloudpd 同源）。"""
    return ipd_auth.build_api(
        apple_id,
        password,
        session_dir,
        icloud_domain=icloud_domain,
        allow_domain_fallback=allow_domain_fallback,
    )


def _write_stream_atomic(response: Any, dest_path: str) -> None:
    """
    原子落盘：先写 .partial，再 os.replace 到最终文件。

    @note 失败会清理残留 partial，避免 Rust 将损坏文件误判为已完成。
    """
    destination = Path(dest_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial_path = destination.with_name(destination.name + ".partial")

    try:
        with partial_path.open("wb") as fh:
            if hasattr(response, "iter_content"):
                for chunk in response.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        fh.write(chunk)
            elif hasattr(response, "raw") and hasattr(response.raw, "read"):
                while True:
                    chunk = response.raw.read(1024 * 128)
                    if not chunk:
                        break
                    fh.write(chunk)
            elif hasattr(response, "content"):
                fh.write(response.content)
            else:
                raise RuntimeError("unsupported response payload")
        os.replace(str(partial_path), str(destination))
    except Exception:
        if partial_path.exists():
            partial_path.unlink()
        raise


def _locate_photo_by_asset_id(api: Any, asset_id: str) -> Any | None:
    """按 asset_id 从 cache 取 PhotoAsset；缺失由 download_batch 预取负责。"""
    cache = _AUTH_STATE.photo_cache
    if isinstance(cache, dict):
        return cache.get(asset_id)
    return None


def _download_response(api: Any, photo: Any, part: str) -> Any:
    """按 part 拉取 HTTP Response（stream）；含 P1 有限重试。"""
    if not ipd_photos.is_ipd_photo_asset(photo):
        raise RuntimeError("unsupported photo asset type; expected pyicloud_ipd PhotoAsset")
    return ipd_photos.ipd_download_response_with_retry(api, photo, part)


def _execute_download_item(api: Any, item: dict[str, Any]) -> dict[str, Any]:
    """
    下载单条资产并落盘。

    @returns 供 download_batch 聚合的结果 dict（不含敏感信息）
    """
    asset_id = str(item.get("asset_id", "")).strip()
    part = str(item.get("part", "")).strip()
    dest_path = str(item.get("dest_path", "")).strip()
    row_id = item.get("row_id")
    base: dict[str, Any] = {
        "row_id": row_id,
        "asset_id": asset_id,
        "part": part,
    }
    if not asset_id or not part or not dest_path:
        return {**base, "ok": False, "code": CODE_INVALID_REQUEST, "message": "asset_id, part and dest_path are required"}

    refreshed_url = False
    while True:
        try:
            photo = _locate_photo_by_asset_id(api, asset_id)
            if photo is None:
                return {
                    **base,
                    "ok": False,
                    "code": CODE_INVALID_REQUEST,
                    "message": f"asset not found: {asset_id}",
                }
            response = _download_response(api, photo, part)
            _write_stream_atomic(response, dest_path)
            return {**base, "ok": True}
        except ValueError as exc:
            return {**base, "ok": False, "code": CODE_INVALID_REQUEST, "message": str(exc)[:500]}
        except LiveBindMissingError as exc:
            return {**base, "ok": False, "code": CODE_LIVE_BIND_MISSING, "message": str(exc)[:500]}
        except RuntimeError as exc:
            if str(exc) == "not authenticated":
                return {
                    **base,
                    "ok": False,
                    "code": CODE_AUTH_FAILED,
                    "message": "explicit auth is required before download",
                }
            if not refreshed_url and _is_stale_download_url_error(exc):
                _refresh_photo_cache_on_stale_url(api, [asset_id])
                refreshed_url = True
                continue
            return {**base, "ok": False, "code": CODE_DOWNLOAD_FAILED, "message": str(exc)[:500]}
        except Exception as exc:  # noqa: BLE001
            if not refreshed_url and _is_stale_download_url_error(exc):
                _refresh_photo_cache_on_stale_url(api, [asset_id])
                refreshed_url = True
                continue
            mapped = _map_download_exception(exc)
            return {**base, "ok": False, "code": mapped, "message": str(exc)[:500]}


def _handle_delete_assets(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    批量删云（P3）：软删 CPLAsset → 「最近删除」。

    @note 宿主必须传入 catalog 落库的 cpl_asset_record_name；禁止 cache / 扫库补齐。
    @note Live still/mov 共享同一 CPLAsset recordName，同一 name 只删一次。
    """
    raw_items = cmd.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return error_event("delete_assets", CODE_INVALID_REQUEST, "items must be a non-empty array")

    items = [item for item in raw_items if isinstance(item, dict)]
    if not items:
        return error_event("delete_assets", CODE_INVALID_REQUEST, "items must be a non-empty array")

    if _is_mock_mode():
        mock_results = [
            {
                "asset_id": str(item.get("asset_id", "")),
                "part": str(item.get("part", "")),
                "ok": True,
                "mock": True,
            }
            for item in items
        ]
        return done_event("delete_assets", results=mock_results)

    try:
        api = _ensure_api(
            str(cmd.get("apple_id", "")).strip(),
            str(cmd.get("session_dir", "")).strip(),
        )
    except RuntimeError as exc:
        if str(exc) == "not authenticated":
            return error_event(
                "delete_assets",
                CODE_AUTH_FAILED,
                "explicit auth is required before delete_assets",
            )
        return error_event("delete_assets", CODE_DELETE_FAILED, str(exc)[:500])

    # record_name → 首次出现的 change_tag（同 Live 多 part 去重）
    delete_by_name: dict[str, str | None] = {}
    ordered: list[dict[str, str | None]] = []
    for item in items:
        asset_id = str(item.get("asset_id", "")).strip()
        part = str(item.get("part", "")).strip()
        record_name = str(item.get("cpl_asset_record_name") or "").strip()
        change_tag = str(item.get("cpl_asset_change_tag") or "").strip() or None
        ordered.append(
            {
                "asset_id": asset_id,
                "part": part,
                "cpl_asset_record_name": record_name or None,
                "cpl_asset_change_tag": change_tag,
            }
        )
        if record_name and record_name not in delete_by_name:
            delete_by_name[record_name] = change_tag

    name_results: dict[str, dict[str, Any]] = {}
    try:
        for record_name, change_tag in delete_by_name.items():
            try:
                ipd_photos.delete_cpl_asset_by_record(api, record_name, change_tag)
                name_results[record_name] = {"ok": True}
            except Exception as exc:  # noqa: BLE001
                mapped = _map_exception(exc)
                if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
                    _record_diagnostic("delete_assets", mapped, str(exc)[:500], exc=exc)
                    _reset_auth_state()
                    return error_event("delete_assets", mapped, str(exc)[:500])
                name_results[record_name] = {
                    "ok": False,
                    "code": CODE_DELETE_FAILED if mapped == CODE_AUTH_FAILED else mapped,
                    "message": str(exc)[:500],
                }
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _record_diagnostic("delete_assets", mapped, str(exc)[:500], exc=exc)
            _reset_auth_state()
        return error_event(
            "delete_assets",
            mapped if mapped != CODE_AUTH_FAILED else CODE_DELETE_FAILED,
            str(exc)[:500],
        )

    results: list[dict[str, Any]] = []
    for row in ordered:
        asset_id = row["asset_id"] or ""
        part = row["part"] or ""
        record_name = row["cpl_asset_record_name"]
        base = {"asset_id": asset_id, "part": part}
        if not asset_id or not part:
            results.append(
                {
                    **base,
                    "ok": False,
                    "code": CODE_INVALID_REQUEST,
                    "message": "asset_id and part required",
                }
            )
            continue
        if not record_name:
            results.append(
                {
                    **base,
                    "ok": False,
                    "code": CODE_INVALID_REQUEST,
                    "message": "cpl_asset_record_name missing; re-run catalog",
                }
            )
            continue
        outcome = name_results.get(record_name) or {
            "ok": False,
            "code": CODE_DELETE_FAILED,
            "message": "delete result missing",
        }
        if outcome.get("ok"):
            results.append({**base, "ok": True})
            _invalidate_asset_lookup(asset_id)
        else:
            results.append(
                {
                    **base,
                    "ok": False,
                    "code": str(outcome.get("code") or CODE_DELETE_FAILED),
                    "message": str(outcome.get("message") or "")[:500],
                }
            )

    return done_event("delete_assets", results=results)


def _handle_download(cmd: dict[str, Any]) -> dict[str, Any]:
    """处理 download 命令（单条；测试与 mock 用）。"""
    asset_id = str(cmd.get("asset_id", "")).strip()
    part = str(cmd.get("part", "")).strip()
    dest_path = str(cmd.get("dest_path", "")).strip()

    if _is_mock_mode():
        return done_event("download", asset_id=asset_id, part=part, dest_path=dest_path, mock=True)
    if not asset_id or not part or not dest_path:
        return error_event("download", CODE_INVALID_REQUEST, "asset_id, part and dest_path are required")

    try:
        api = _ensure_api(
            str(cmd.get("apple_id", "")).strip(),
            str(cmd.get("session_dir", "")).strip(),
        )
        item = {"asset_id": asset_id, "part": part, "dest_path": dest_path}
        _ensure_batch_download_assets(api, [item])
        result = _execute_download_item(api, item)
        if result.get("ok"):
            return done_event("download", asset_id=asset_id, part=part, dest_path=dest_path)
        code = str(result.get("code") or CODE_DOWNLOAD_FAILED)
        message = str(result.get("message") or "")
        if code in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _record_diagnostic("download", code, message)
            _reset_auth_state()
        return error_event("download", code, message)
    except RuntimeError as exc:
        if str(exc) == "not authenticated":
            return error_event("download", CODE_AUTH_FAILED, "explicit auth is required before download")
        return error_event("download", CODE_DOWNLOAD_FAILED, str(exc)[:500])
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _record_diagnostic("download", mapped, str(exc)[:500], exc=exc)
            _reset_auth_state()
        return error_event("download", mapped, str(exc)[:500])


def _handle_download_batch(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    批量并行 download（P1 并发）。

    @note sidecar 内 ThreadPoolExecutor；Rust 仍单进程单 sidecar 会话。
    """
    raw_items = cmd.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return error_event("download_batch", CODE_INVALID_REQUEST, "items must be a non-empty array")

    concurrency = min(3, max(1, int(cmd.get("concurrency", 1))))
    items = [item for item in raw_items if isinstance(item, dict)]

    if _is_mock_mode():
        mock_results = [
            {
                "row_id": item.get("row_id"),
                "asset_id": item.get("asset_id"),
                "part": item.get("part"),
                "ok": True,
                "mock": True,
            }
            for item in items
        ]
        return done_event("download_batch", results=mock_results)

    try:
        api = _ensure_api(
            str(cmd.get("apple_id", "")).strip(),
            str(cmd.get("session_dir", "")).strip(),
        )
    except RuntimeError as exc:
        if str(exc) == "not authenticated":
            return error_event("download_batch", CODE_AUTH_FAILED, "explicit auth is required before download")
        return error_event("download_batch", CODE_DOWNLOAD_FAILED, str(exc)[:500])

    view = str(cmd.get("view", "library")).strip()
    try:
        _ensure_batch_download_assets(api, items)
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        diagnostic = _record_diagnostic("download_batch", mapped, str(exc)[:500], exc=exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
        return error_event("download_batch", mapped, str(exc)[:500], diagnostic=diagnostic or None)

    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(_execute_download_item, api, item) for item in items]
        for future in as_completed(futures):
            results.append(future.result())

    if any(r.get("code") in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED) for r in results):
        auth_hit = next(
            r for r in results if r.get("code") in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED)
        )
        _record_diagnostic(
            "download_batch",
            str(auth_hit.get("code") or CODE_SESSION_EXPIRED),
            str(auth_hit.get("message") or "download auth failure"),
        )
        _reset_auth_state()

    results.sort(key=lambda r: (r.get("row_id") is None, r.get("row_id") or 0))
    return done_event("download_batch", results=results)


def _handle_auth(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    处理 auth 命令。

    @note 非 mock 走 pyicloud 登录并复用 session_dir；如需 2FA，则返回 need_2fa，等待显式 auth_2fa。
    """
    apple_id = str(cmd.get("apple_id", "")).strip()
    session_dir = str(cmd.get("session_dir", "")).strip()
    # 明确读取但不输出 password，避免日志泄漏凭据。
    password = str(cmd.get("password", ""))

    if _is_mock_mode():
        return done_event("auth", mock=True)
    if not apple_id or not session_dir:
        return error_event("auth", CODE_INVALID_REQUEST, "apple_id and session_dir are required")

    if (
        _AUTH_STATE.api is not None
        and _AUTH_STATE.apple_id == apple_id
        and _AUTH_STATE.session_dir == session_dir
    ):
        if _is_fully_authenticated(_AUTH_STATE.api):
            _AUTH_STATE.waiting_2fa = False
            _record_auth_success("auth", "auth session reused")
            return done_event("auth", reused=True)
        if _AUTH_STATE.waiting_2fa:
            # 已有 pending challenge：不再 request_2fa，避免 iPhone 重复弹窗
            return _attach_challenge_diagnostic(
                _need_2fa_response(_AUTH_STATE.api, "auth"),
                _AUTH_STATE.api,
                "auth",
            )
        return _finalize_auth_or_need_2fa(_AUTH_STATE.api, "auth")

    if _AUTH_STATE.api is not None and _AUTH_STATE.apple_id.strip() != apple_id:
        _reset_auth_state()

    Path(session_dir).mkdir(parents=True, exist_ok=True)
    icloud_domain = _resolve_icloud_domain(cmd, session_dir, apple_id)

    api: Any | None = None
    try:
        api = _build_api(
            apple_id=apple_id,
            password=password,
            session_dir=session_dir,
            icloud_domain=icloud_domain,
        )
        _AUTH_STATE.api = api
        _AUTH_STATE.apple_id = apple_id
        _AUTH_STATE.session_dir = session_dir
        _AUTH_STATE.icloud_domain = ipd_auth.api_domain(api)

        if _is_fully_authenticated(api):
            _AUTH_STATE.waiting_2fa = False
            _AUTH_STATE.mfa_delivery_kicked_off = False
            _AUTH_STATE.delivery_method = ""
            _record_auth_success("auth", "password login completed; session ready", api=api)
            return done_event("auth")

        if _mfa_still_required(api) or not _has_webauth_token(api):
            return _finalize_auth_or_need_2fa(api, "auth")

        _AUTH_STATE.waiting_2fa = False
        _record_auth_success("auth", "auth completed without additional 2FA", api=api)
        return done_event("auth")
    except Exception as exc:  # noqa: BLE001
        if isinstance(exc, ipd_auth.IcloudIncompleteAuthError) or ipd_auth._is_dsinfo_key_error(exc):
            if session_dir and apple_id:
                ipd_auth.clear_session_artifacts(session_dir, apple_id)
            _reset_auth_state()
            return _auth_error(
                "auth",
                CODE_SESSION_EXPIRED,
                "登录会话已损坏或不完整（旧版缓存不兼容），请退出登录后重新输入密码",
                stage="auth",
                exc=exc,
            )
        if _is_2fa_required_exception(exc):
            # pyicloud 可能在构造/鉴权阶段直接抛 2SA 异常而非设置 requires_2fa 标志。
            if api is not None:
                _AUTH_STATE.api = api
                _AUTH_STATE.apple_id = apple_id
                _AUTH_STATE.session_dir = session_dir
                return _finalize_auth_or_need_2fa(api, "auth")

        _reset_auth_state()
        code = _map_exception(exc)
        message = str(exc)[:500]
        if ipd_auth._is_dsinfo_key_error(exc) or isinstance(exc, ipd_auth.IcloudIncompleteAuthError):
            message = "登录会话已损坏或不完整（旧版缓存不兼容），请退出登录后重新输入密码"
        elif isinstance(exc, ipd_auth.IcloudDomainMismatchError):
            message = str(exc)
        elif ipd_auth.is_domain_mismatch_exception(exc):
            required = ipd_auth.parse_required_domain(exc) or "cn"
            message = ipd_auth.format_domain_mismatch_message(icloud_domain, required)
        return _auth_error("auth", code, message, stage="auth", exc=exc)


def _handle_auth_2fa(cmd: dict[str, Any]) -> dict[str, Any]:
    """处理 auth_2fa 命令。"""
    code = str(cmd.get("code", "")).strip()
    if _is_mock_mode():
        return done_event("auth_2fa", mock=True)
    if _AUTH_STATE.api is None or not _AUTH_STATE.waiting_2fa:
        return _auth_error(
            "auth_2fa",
            CODE_AUTH_FAILED,
            "auth_2fa requested without pending challenge",
            stage="auth_2fa",
        )

    delivery_method = _AUTH_STATE.delivery_method or _two_factor_delivery_method(_AUTH_STATE.api)

    try:
        if code:
            if not _submit_2fa_code(_AUTH_STATE.api, code, delivery_method):
                _maybe_rekickoff_mfa_for_retry(_AUTH_STATE.api)
                return _auth_error(
                    "auth_2fa",
                    CODE_AUTH_FAILED,
                    _auth_2fa_failure_message(),
                    stage="auth_2fa",
                )
        elif delivery_method == "trusted_device":
            if not _poll_trusted_device_completion(_AUTH_STATE.api):
                return _auth_error(
                    "auth_2fa",
                    CODE_AUTH_FAILED,
                    "受信任设备确认超时；请在设备上点「允许」后重试",
                    stage="auth_2fa",
                )
        else:
            return _auth_error(
                "auth_2fa",
                CODE_INVALID_REQUEST,
                "2fa code is required",
                stage="auth_2fa",
            )

        if not _is_fully_authenticated(_AUTH_STATE.api):
            return _auth_error(
                "auth_2fa",
                CODE_AUTH_FAILED,
                "验证码已接受但 Photos session 未就绪；请在 iPhone 上重新点「允许」并尽快输入新验证码",
                stage="auth_2fa",
            )

        _persist_session_cookies(_AUTH_STATE.api)
        _AUTH_STATE.waiting_2fa = False
        _AUTH_STATE.mfa_delivery_kicked_off = False
        _AUTH_STATE.delivery_method = ""
        _record_auth_success("auth_2fa", "2FA completed; session ready")
        return done_event("auth_2fa", delivery_method=delivery_method)
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
        return _auth_error("auth_2fa", mapped, str(exc)[:500], stage="auth_2fa", exc=exc)


def _handle_auth_diagnostic(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    返回最近一次认证诊断（无需再次登录、不触发 Apple API）。

    @note 优先读请求 session_dir 落盘文件；内存态仅在同目录时 fallback。
    """
    session_dir = str(cmd.get("session_dir", "")).strip() or _AUTH_STATE.session_dir
    diagnostic: dict[str, Any] | None = None
    if session_dir:
        diagnostic = auth_diag.load_auth_diagnostic_from_disk(session_dir)
    if diagnostic is None and (
        not session_dir or session_dir == _AUTH_STATE.session_dir.strip()
    ):
        diagnostic = auth_diag.get_last_auth_diagnostic()
    if diagnostic is None:
        diagnostic = {
            "stage": "auth_diagnostic",
            "code": "no_data",
            "message": "尚无认证诊断记录；请先尝试登录或提交验证码",
        }
    return done_event("auth_diagnostic", diagnostic=diagnostic)


def _handle_auth_probe(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    探测 session 是否可用于 catalog/download（不发送密码、不触发 SRP 重登）。

    @note 供 start_job / resume 前置检查；符合设计铁律「之后全程靠 session」。
    """
    apple_id = str(cmd.get("apple_id", "")).strip()
    session_dir = str(cmd.get("session_dir", "")).strip()

    if _is_mock_mode():
        return done_event("auth_probe", mock=True)

    if not apple_id or not session_dir:
        return error_event("auth_probe", CODE_INVALID_REQUEST, "apple_id and session_dir are required")

    icloud_domain = _resolve_icloud_domain(cmd, session_dir, apple_id)

    if (
        _AUTH_STATE.api is not None
        and _AUTH_STATE.apple_id == apple_id
        and _AUTH_STATE.session_dir == session_dir
    ):
        api = _AUTH_STATE.api
    else:
        if _AUTH_STATE.api is not None and _AUTH_STATE.apple_id.strip() != apple_id:
            _reset_auth_state()
        try:
            api = _build_api(
                apple_id=apple_id,
                password="",
                session_dir=session_dir,
                icloud_domain=icloud_domain,
            )
            _AUTH_STATE.api = api
            _AUTH_STATE.apple_id = apple_id
            _AUTH_STATE.session_dir = session_dir
            _AUTH_STATE.icloud_domain = ipd_auth.api_domain(api)
        except Exception as exc:  # noqa: BLE001
            code = _map_exception(exc)
            diagnostic = _record_diagnostic(
                "auth_probe",
                code,
                str(exc)[:500],
                exc=exc,
                apple_id=apple_id,
                session_dir=session_dir,
            )
            return error_event(
                "auth_probe",
                code,
                str(exc)[:500],
                diagnostic=diagnostic or None,
            )

    if _is_fully_authenticated(api):
        _AUTH_STATE.waiting_2fa = False
        _record_auth_success("auth_probe", "session valid for catalog/download", api=api)
        return done_event("auth_probe", has_webauth=True)

    if _mfa_still_required(api) or _AUTH_STATE.waiting_2fa:
        return _finalize_auth_or_need_2fa(api, "auth_probe", kickoff_delivery=False)

    diagnostic = _record_diagnostic(
        "auth_probe",
        CODE_SESSION_EXPIRED,
        "session invalid or expired; explicit login required",
        apple_id=apple_id,
        session_dir=session_dir,
        api=api,
    )
    return error_event(
        "auth_probe",
        CODE_SESSION_EXPIRED,
        "session invalid or expired; explicit login required",
        diagnostic=diagnostic or None,
    )


def _handle_logout(_cmd: dict[str, Any]) -> dict[str, Any]:
    """清空进程内认证态；宿主换号 / 登出时调用。"""
    _record_diagnostic("logout", "logout", "sidecar auth state cleared")
    _reset_auth_state()
    return done_event("logout")


def _validate_catalog_items(items: list[dict[str, Any]], view: str) -> tuple[bool, str]:
    """
    校验目录数据排序关键字段与 Live 强绑定字段。

    @returns (is_valid, error_code)
    """
    sort_field = "capture_at" if view == "library" else "added_at"
    for item in items:
        if item.get(sort_field) in (None, ""):
            return False, CODE_CATALOG_SORT_MISSING
        if item.get("media_kind") == "live" and not item.get("live_pair_id"):
            return False, CODE_LIVE_BIND_MISSING
    return True, ""


def _handle_catalog(cmd: dict[str, Any]) -> dict[str, Any]:
    """
    处理 catalog 命令。

    @note 目录结果事件风格锁定为单个 done：{"type":"done","cmd":"catalog","items":[...]}。
    """
    view = str(cmd.get("view", "")).strip()
    if view not in CATALOG_VIEWS:
        return error_event("catalog", CODE_INVALID_REQUEST, "view must be library or recents")

    try:
        if _is_mock_mode():
            items = [dict(item) for item in MOCK_CATALOG_ITEMS]
        else:
            api = _ensure_api(
                str(cmd.get("apple_id", "")).strip(),
                str(cmd.get("session_dir", "")).strip(),
            )
            items = [_catalog_item_from_photo(photo, view) for photo in _iter_view_assets(api, view)]

        ok, err_code = _validate_catalog_items(items, view)
        if not ok:
            return error_event("catalog", err_code, "catalog validation failed")
        if not _is_mock_mode():
            _record_auth_success("catalog", f"catalog completed: {len(items)} items (view={view})")
        return done_event("catalog", items=items)
    except CatalogSortMissingError as exc:
        return error_event("catalog", CODE_CATALOG_SORT_MISSING, str(exc))
    except LiveBindMissingError as exc:
        return error_event("catalog", CODE_LIVE_BIND_MISSING, str(exc))
    except RuntimeError as exc:
        if str(exc) == "not authenticated":
            return error_event("catalog", CODE_AUTH_FAILED, "explicit auth is required before catalog")
        return error_event("catalog", CODE_AUTH_FAILED, str(exc)[:500])
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        diagnostic = _record_diagnostic("catalog", mapped, str(exc)[:500], exc=exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
        return error_event("catalog", mapped, str(exc)[:500], diagnostic=diagnostic or None)


def _handle_vendor_probe(_cmd: dict[str, Any]) -> dict[str, Any]:
    """验证 PyInstaller 包内 pyicloud_ipd / vendor 可被加载（构建冒烟用）。"""
    from icloudAuth import load_service_class

    service_cls = load_service_class()
    return {"type": "vendor_probe", "ok": True, "service": service_cls.__name__}


def _dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    """按 cmd 路由到对应处理器。"""
    name = str(cmd.get("cmd", "")).strip()
    if name == "version":
        return version_event()
    if name == "vendor_probe":
        return _handle_vendor_probe(cmd)
    if name == "auth":
        return _handle_auth(cmd)
    if name == "auth_probe":
        return _handle_auth_probe(cmd)
    if name == "auth_diagnostic":
        return _handle_auth_diagnostic(cmd)
    if name == "auth_2fa":
        return _handle_auth_2fa(cmd)
    if name == "logout":
        return _handle_logout(cmd)
    if name == "catalog":
        return _handle_catalog(cmd)
    if name == "download":
        return _handle_download(cmd)
    if name == "download_batch":
        return _handle_download_batch(cmd)
    if name == "delete_assets":
        return _handle_delete_assets(cmd)
    return error_event(name or "unknown", CODE_INVALID_REQUEST, f"unknown cmd: {name}")


def run() -> int:
    """
    sidecar 主循环：逐行读命令，逐行写事件。

    @returns 进程退出码；正常处理到 EOF 返回 0。
    @note stdin 必须按 UTF-8 读：Windows 管道默认 GBK 会把 dest_path 里的中文路径写错文件名。
    """
    for raw in sys.stdin.buffer:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            cmd = _read_cmd(line)
            event = _dispatch(cmd)
        except Exception as exc:  # noqa: BLE001
            event = error_event("unknown", _map_exception(exc), str(exc)[:500])
        try:
            _write_event(event)
        except Exception as exc:  # noqa: BLE001
            # 二次兜底：写 stdout 仍失败时尽量输出 ASCII 错误行
            fallback = error_event("unknown", "sidecar_crashed", str(exc)[:500])
            sys.stdout.buffer.write(
                (json.dumps(fallback, ensure_ascii=True) + "\n").encode("ascii", errors="replace")
            )
            sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    _configure_stdio_utf8()
    raise SystemExit(run())
