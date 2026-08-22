#!/usr/bin/env python3
"""
iCloud Sync sidecar protocol constants and event builders.

职责：
- 定义 sidecar 与宿主通信的协议版本、agent 版本、错误码常量。
- 提供统一 event 构造函数，避免各命令分支手写 JSON 结构造成漂移。

适用场景：
- `agent.py` 主循环输出 line-JSON。
- 单测验证协议负载稳定性。
"""

from __future__ import annotations

from typing import Any

PROTOCOL = 1
AGENT_VERSION = "0.1.0"

CODE_AUTH_FAILED = "auth_failed"
CODE_NEED_2FA = "need_2fa"
CODE_SESSION_EXPIRED = "session_expired"
CODE_ACCOUNT_LOCKED = "account_locked"
CODE_RATE_LIMITED = "rate_limited"
CODE_INVALID_REQUEST = "invalid_request"
CODE_NOT_IMPLEMENTED = "not_implemented"
CODE_CATALOG_SORT_MISSING = "catalog_sort_missing"
CODE_LIVE_BIND_MISSING = "live_bind_missing"
CODE_DOWNLOAD_FAILED = "download_failed"
CODE_DOMAIN_MISMATCH = "domain_mismatch"


class CatalogSortMissingError(RuntimeError):
    """catalog 条目缺少视图所需排序字段。"""


class LiveBindMissingError(RuntimeError):
    """Live Photo 缺少强绑定 id 或 mov 下载版本。"""


def version_event() -> dict[str, Any]:
    """构造版本握手事件。"""
    return {"type": "version", "protocol": PROTOCOL, "agent": AGENT_VERSION}


def need_2fa_event(
    cmd: str = "auth",
    detail: str = "",
    delivery_method: str = "",
) -> dict[str, Any]:
    """
    构造需要二次验证事件。

    @param cmd 触发该状态的命令名
    @param detail 可选补充说明（不含敏感信息）
    @param delivery_method pyicloud 投递路径：`sms` / `trusted_device` / `security_key` 等
    """
    payload: dict[str, Any] = {"type": "need_2fa", "cmd": cmd, "code": CODE_NEED_2FA}
    if detail:
        payload["detail"] = detail
    if delivery_method:
        payload["delivery_method"] = delivery_method
    return payload


def progress_event(cmd: str, step: str, detail: str = "") -> dict[str, Any]:
    """
    构造进度事件。

    @note 目前用于占位主流程状态回传，避免前端依赖私有字段名。
    """
    payload: dict[str, Any] = {"type": "progress", "cmd": cmd, "step": step}
    if detail:
        payload["detail"] = detail
    return payload


def done_event(cmd: str, **extra: Any) -> dict[str, Any]:
    """构造完成事件，`extra` 会原样并入输出。"""
    payload: dict[str, Any] = {"type": "done", "cmd": cmd}
    payload.update(extra)
    return payload


def error_event(cmd: str, code: str, message: str = "", **extra: Any) -> dict[str, Any]:
    """
    构造错误事件。

    @param cmd 出错命令名
    @param code 机读错误码（由协议常量定义）
    @param message 面向日志/诊断的简短描述（禁止包含明文密码）
    """
    payload: dict[str, Any] = {"type": "error", "cmd": cmd, "code": code}
    if message:
        payload["message"] = message
    payload.update(extra)
    return payload
