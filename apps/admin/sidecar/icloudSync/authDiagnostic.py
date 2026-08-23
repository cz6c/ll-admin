#!/usr/bin/env python3
"""
iCloud Sync 认证诊断：采集 auth / 同步全链路状态，供一次定位多类失败根因。

职责：
- 在登录、2FA、auth_probe、catalog、download 鉴权失败、登出等节点快照 session 状态。
- 规则引擎输出 hints / userActions（对齐社区已知问题码）。
- 每次快照覆盖落盘 session_dir/auth-diagnostic.json（以 at 时间戳区分先后）。

适用：sidecar agent.py；禁止写入密码、验证码明文。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import icloudAuth as ipd_auth

_LAST_AUTH_DIAGNOSTIC: dict[str, Any] | None = None

# 已知 hint → 用户可执行动作（锁号优先：均避免重复 SRP 登录）
_HINT_ACTIONS: dict[str, str] = {
    "WEBAUTH_MISSING_AFTER_2FA": "验证码可能已过期或 trust 未完成：在 iPhone 重新点「允许」，换一组新 6 位码提交；勿重复点「登录」",
    "MISSING_SCNT_OR_SESSION_ID": "2FA session 已断裂：请退出登录 → 等待数分钟 → 仅发起一轮完整登录",
    "BRIDGE_INACTIVE_AT_VALIDATE": "设备验证窗口可能已超时：在 iPhone 重新点「允许」并 30 秒内输入新验证码",
    "DELIVERY_METHOD_UNKNOWN": "未识别 2FA 投递方式；若 iPhone 弹出「设备验证」，按受信任设备流程点允许后输入码",
    "NO_PENDING_2FA": "sidecar 无 pending challenge：退出登录后重新登录一次（勿连点）",
    "PARTIAL_SESSION_ON_DISK": "存在半成品 session：先退出登录清 session，再重新登录",
    "STALE_SESSION_MISSING_DSINFO": "旧版 pyicloud session 与 pyicloud_ipd 不兼容：已自动清理，请重新输入密码登录",
    "ICLOUD_CN_DOMAIN_REQUIRED": "中国大陆 Apple ID 需走 iCloud.com.cn；已自动切换 cn 域，请重新登录一次",
    "ACCOUNT_MAY_BE_RATE_LIMITED": "可能触发 Apple 限流：停止一切登录尝试数小时，先用 icloud.com 确认账号正常",
    "SRP_ALREADY_RAN": "已完成密码登录；2FA 阶段请只提交验证码，勿再点「登录」",
    "KICKOFF_PUT_ONLY": "已用 icloudpd PUT 触发设备验证；请在 iPhone 点「允许」后输入码",
    "KICKOFF_PUT_RETRY": "已重新推送设备验证；请在 iPhone 再次点「允许」后输入新验证码",
    "KICKOFF_IPD_PUT": "已用 pyicloud_ipd trigger_push_notification 触发设备验证",
    "KICKOFF_BRIDGE": "已走 pyicloud bridge 推送；请在 iPhone 点「允许」后尽快输入码",
    "VALIDATE_RETURNED_FALSE": "Apple 拒绝了验证码：确认码未过期且与当前「允许」弹窗对应",
    "VALIDATE_OK_WEBAUTH_PENDING": "验证码已被 Apple 接受，但 trust/accountLogin 未完成；请重新点「允许」换码",
    "EXCEPTION_DURING_VALIDATE": "校验过程异常：查看 exceptionDetail，通常需新 challenge（退出后重登）",
    "AUTH_SESSION_READY": "登录 session 已就绪，可开始或继续同步",
    "AUTH_PROBE_OK": "session 探测通过，可 catalog / download",
    "AUTH_LOGGED_OUT": "sidecar 内存态已清空；若需彻底登出请同时在应用内点「退出登录」",
    "CATALOG_OK": "图库扫描完成，可进入下载阶段",
    "DOWNLOAD_AUTH_FAILED": "下载阶段鉴权失败：请退出登录后重新登录，再续传",
}


def get_last_auth_diagnostic() -> dict[str, Any] | None:
    """返回进程内最近一次诊断报告（可能为空）。"""
    return _LAST_AUTH_DIAGNOSTIC


def load_auth_diagnostic_from_disk(session_dir: str) -> dict[str, Any] | None:
    """从 session 目录读取上次落盘诊断（sidecar 重启后仍可用）。"""
    if not session_dir:
        return None
    path = Path(session_dir) / "auth-diagnostic.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def mask_apple_id(apple_id: str) -> str:
    """Apple ID 脱敏展示。"""
    trimmed = apple_id.strip()
    if "@" not in trimmed:
        return trimmed[:2] + "***" if trimmed else ""
    local, domain = trimmed.split("@", 1)
    head = local[:2] if len(local) > 2 else (local[:1] if local else "")
    return f"{head}***@{domain}"


def _is_dsinfo_exception(exc: Exception) -> bool:
    """是否为 pyicloud_ipd authenticate() 缺少 dsInfo 的 KeyError / 包装异常。"""
    if isinstance(exc, ipd_auth.IcloudIncompleteAuthError):
        return True
    return ipd_auth._is_dsinfo_key_error(exc)


def _is_domain_mismatch_exception(exc: Exception) -> bool:
    """是否为 iCloud 根域不匹配（com/cn）。"""
    return ipd_auth.is_domain_mismatch_exception(exc)


def build_session_flags(
    api: Any | None,
    *,
    has_webauth: Callable[[Any], bool],
    session_auth_snapshot: Callable[[Any], dict[str, Any]],
    supports_bridge: Callable[[Any], bool],
    delivery_method: Callable[[Any], str],
    auth_state: Any,
) -> dict[str, Any]:
    """采集当前 pyicloud session 诊断字段（无敏感信息）。"""
    if api is None:
        return {
            "hasApi": False,
            "waiting2fa": bool(getattr(auth_state, "waiting_2fa", False)),
            "mfaDeliveryKickedOff": bool(getattr(auth_state, "mfa_delivery_kicked_off", False)),
            "deliveryMethodCached": str(getattr(auth_state, "delivery_method", "") or ""),
        }

    session = getattr(api, "session", None)
    session_data = getattr(api, "session_data", None)
    if not isinstance(session_data, dict):
        session_data = getattr(session, "data", {}) if session is not None else {}
    session_data = session_data or {}
    bridge_state = getattr(api, "_trusted_device_bridge_state", None)
    snap = session_auth_snapshot(api)

    return {
        "hasApi": True,
        "hasSessionToken": bool(session_data.get("session_token")),
        "hasScnt": bool(session_data.get("scnt")),
        "hasSessionId": bool(session_data.get("session_id")),
        "hasTrustToken": bool(session_data.get("trust_token")),
        "hasWebauthToken": has_webauth(api),
        "authenticated": bool(snap.get("authenticated")),
        "trustedSession": bool(snap.get("trusted_session")),
        "requires2fa": bool(snap.get("requires_2fa")),
        "requires2sa": bool(snap.get("requires_2sa")),
        "bridgeActive": bridge_state is not None,
        "bridgeSupported": supports_bridge(api),
        "deliveryMethodLive": delivery_method(api),
        "waiting2fa": bool(getattr(auth_state, "waiting_2fa", False)),
        "mfaDeliveryKickedOff": bool(getattr(auth_state, "mfa_delivery_kicked_off", False)),
        "deliveryMethodCached": str(getattr(auth_state, "delivery_method", "") or ""),
    }


def _infer_hints(
    stage: str,
    code: str,
    flags: dict[str, Any],
    *,
    validate_path: str = "",
    kickoff_path: str = "",
    exc: Exception | None = None,
) -> list[str]:
    hints: list[str] = []

    if flags.get("hasApi") and flags.get("hasSessionToken") and not flags.get("hasWebauthToken"):
        hints.append("WEBAUTH_MISSING_AFTER_2FA")
    if flags.get("hasApi") and not flags.get("hasScnt") and not flags.get("hasSessionId"):
        hints.append("MISSING_SCNT_OR_SESSION_ID")
    if stage == "auth_2fa" and flags.get("bridgeSupported") and not flags.get("bridgeActive"):
        hints.append("BRIDGE_INACTIVE_AT_VALIDATE")
    if not flags.get("deliveryMethodCached") and flags.get("deliveryMethodLive") in ("", "unknown", None):
        hints.append("DELIVERY_METHOD_UNKNOWN")
    if stage == "auth_2fa" and not flags.get("waiting2fa"):
        hints.append("NO_PENDING_2FA")
    if kickoff_path in ("put", "ipd_put"):
        hints.append("KICKOFF_IPD_PUT")
    if kickoff_path == "bridge":
        hints.append("KICKOFF_BRIDGE")
    if validate_path == "validate_2fa_code:false":
        hints.append("VALIDATE_RETURNED_FALSE")
    if validate_path.endswith(":webauth_pending") or validate_path.endswith(":trust_retry"):
        hints.append("VALIDATE_OK_WEBAUTH_PENDING")
    if kickoff_path in ("put_retry", "ipd_put_retry"):
        hints.append("KICKOFF_PUT_RETRY")
    if exc is not None:
        hints.append("EXCEPTION_DURING_VALIDATE")
        if _is_dsinfo_exception(exc):
            hints.insert(0, "STALE_SESSION_MISSING_DSINFO")
        if _is_domain_mismatch_exception(exc):
            hints.insert(0, "ICLOUD_CN_DOMAIN_REQUIRED")
    if code in ("account_locked", "rate_limited"):
        hints.append("ACCOUNT_MAY_BE_RATE_LIMITED")
    if code == "ok" and flags.get("authenticated"):
        if stage == "auth_probe":
            hints.append("AUTH_PROBE_OK")
        elif stage in ("auth", "auth_2fa"):
            hints.append("AUTH_SESSION_READY")
        elif stage == "catalog":
            hints.append("CATALOG_OK")
    if code == "logout":
        hints.append("AUTH_LOGGED_OUT")
    if stage in ("download", "download_batch") and code in (
        "session_expired",
        "auth_failed",
        "account_locked",
    ):
        hints.append("DOWNLOAD_AUTH_FAILED")
    if stage in ("auth", "auth_2fa") and code == "need_2fa" and flags.get("hasSessionToken"):
        hints.append("SRP_ALREADY_RAN")

    # 去重保序
    seen: set[str] = set()
    ordered: list[str] = []
    for item in hints:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def build_auth_diagnostic(
    *,
    stage: str,
    code: str,
    message: str,
    apple_id: str,
    session_dir: str,
    api: Any | None,
    auth_state: Any,
    has_webauth: Callable[[Any], bool],
    session_auth_snapshot: Callable[[Any], dict[str, Any]],
    supports_bridge: Callable[[Any], bool],
    delivery_method: Callable[[Any], str],
    session_files_present: bool = False,
    validate_path: str = "",
    kickoff_path: str = "",
    exc: Exception | None = None,
) -> dict[str, Any]:
    """构建完整诊断报告并落盘。"""
    global _LAST_AUTH_DIAGNOSTIC

    flags = build_session_flags(
        api,
        has_webauth=has_webauth,
        session_auth_snapshot=session_auth_snapshot,
        supports_bridge=supports_bridge,
        delivery_method=delivery_method,
        auth_state=auth_state,
    )
    if session_files_present and not flags.get("hasWebauthToken"):
        flags["partialSessionOnDisk"] = True

    hints = _infer_hints(
        stage,
        code,
        flags,
        validate_path=validate_path,
        kickoff_path=kickoff_path,
        exc=exc,
    )
    if flags.get("partialSessionOnDisk"):
        hints.insert(0, "PARTIAL_SESSION_ON_DISK")

    user_actions = [_HINT_ACTIONS[h] for h in hints if h in _HINT_ACTIONS]

    if code == "ok":
        outcome = "success"
    elif code == "need_2fa":
        outcome = "challenge"
    elif code == "logout":
        outcome = "info"
    else:
        outcome = "failure"

    report: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "outcome": outcome,
        "stage": stage,
        "code": code,
        "message": message[:500],
        "appleIdMasked": mask_apple_id(apple_id),
        "sessionDir": session_dir,
        "flags": flags,
        "validatePath": validate_path or None,
        "kickoffPath": kickoff_path or None,
        "hints": hints,
        "userActions": user_actions,
        "exceptionType": type(exc).__name__ if exc else None,
        "exceptionDetail": str(exc)[:400] if exc else None,
    }

    _LAST_AUTH_DIAGNOSTIC = report
    if session_dir:
        try:
            directory = Path(session_dir)
            directory.mkdir(parents=True, exist_ok=True)
            (directory / "auth-diagnostic.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass
    return report


def record_success_snapshot(
    *,
    stage: str,
    message: str,
    apple_id: str,
    session_dir: str,
    api: Any | None,
    auth_state: Any,
    has_webauth: Callable[[Any], bool],
    session_auth_snapshot: Callable[[Any], dict[str, Any]],
    supports_bridge: Callable[[Any], bool],
    delivery_method: Callable[[Any], str],
) -> dict[str, Any]:
    """登录 / probe / catalog 等成功节点落盘诊断，覆盖先前的 need_2fa 快照。"""
    return build_auth_diagnostic(
        stage=stage,
        code="ok",
        message=message,
        apple_id=apple_id,
        session_dir=session_dir,
        api=api,
        auth_state=auth_state,
        has_webauth=has_webauth,
        session_auth_snapshot=session_auth_snapshot,
        supports_bridge=supports_bridge,
        delivery_method=delivery_method,
    )


def record_challenge_snapshot(
    *,
    stage: str,
    apple_id: str,
    session_dir: str,
    api: Any | None,
    auth_state: Any,
    has_webauth: Callable[[Any], bool],
    session_auth_snapshot: Callable[[Any], dict[str, Any]],
    supports_bridge: Callable[[Any], bool],
    delivery_method: Callable[[Any], str],
    kickoff_path: str = "",
) -> dict[str, Any]:
    """need_2fa 时记录 challenge 快照，便于与后续失败对比。"""
    return build_auth_diagnostic(
        stage=stage,
        code="need_2fa",
        message="2FA challenge active",
        apple_id=apple_id,
        session_dir=session_dir,
        api=api,
        auth_state=auth_state,
        has_webauth=has_webauth,
        session_auth_snapshot=session_auth_snapshot,
        supports_bridge=supports_bridge,
        delivery_method=delivery_method,
        kickoff_path=kickoff_path,
    )
