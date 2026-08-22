#!/usr/bin/env python3
"""
iCloud 认证适配层（icloudpd / pyicloud_ipd）

职责：
- 构造 pyicloud_ipd.PyiCloudService（与 icloudpd authentication.py 同源）。
- 对齐 icloudpd request_2fa：trigger_push_notification → validate_2fa_code / SMS 路径。
- 提供 session 快照、WEBAUTH 检测，供 agent 与 authDiagnostic 复用。

适用：sidecar agent.py；Mock 模式不 import 本模块。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Callable

ICLOUDPD_VENDOR_TAG = "1.32.3"
ICLOUDPD_VENDOR_DIR = "icloud_photos_downloader-1.32.3"
DEFAULT_ICLOUD_DOMAIN = "com"
SUPPORTED_ICLOUD_DOMAINS = ("com", "cn")


def _ensure_vendor_path() -> None:
    """
    将 vendored icloudpd src 加入 sys.path（含 pyicloud_ipd + foundation）。

    @note 避免 pip git clone（国内网络不稳定）；build.ps1 可下载 zip 解压到 vendor/。
    """
    root = Path(__file__).resolve().parent
    vendor_src = root / "vendor" / ICLOUDPD_VENDOR_DIR / "src"
    if not vendor_src.is_dir():
        raise RuntimeError(
            f"icloudpd vendor missing at {vendor_src}; run build.ps1 or extract v{ICLOUDPD_VENDOR_TAG} zip"
        )
    path = str(vendor_src)
    if path not in sys.path:
        sys.path.insert(0, path)


def load_service_class() -> type[Any]:
    """延迟导入 pyicloud_ipd.PyiCloudService。"""
    _ensure_vendor_path()
    try:
        from pyicloud_ipd.base import PyiCloudService  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"pyicloud_ipd import failed: {exc}") from exc
    return PyiCloudService


def load_connection_exception_class() -> type[BaseException]:
    """延迟导入 PyiCloudConnectionException（domain 不匹配时抛出）。"""
    _ensure_vendor_path()
    from pyicloud_ipd.exceptions import PyiCloudConnectionException  # type: ignore

    return PyiCloudConnectionException


class IcloudIncompleteAuthError(RuntimeError):
    """
    accountLogin / validate 后缺少 dsInfo（常见于旧 pyicloud 半成品 session）。

    @note agent 应引导用户退出登录后重新输入密码，而非重复点登录。
    """


class IcloudDomainMismatchError(RuntimeError):
    """
    用户选择的 iCloud 根域与 Apple 账号要求不一致。

    @note UI 应提示切换「iCloud 区域」后重新登录，勿在后端静默换域重试。
    """

    def __init__(self, selected: str, required: str | None = None) -> None:
        self.selected = selected.strip().lower()
        self.required = (required or ("cn" if self.selected == "com" else "com")).strip().lower()
        super().__init__(format_domain_mismatch_message(self.selected, self.required))


def format_domain_mismatch_message(selected: str, required: str) -> str:
    """将 com/cn 转为面向用户的区域切换提示。"""
    labels = {
        "com": "国际（iCloud.com）",
        "cn": "中国大陆（iCloud.com.cn）",
    }
    selected_label = labels.get(selected.strip().lower(), selected)
    required_label = labels.get(required.strip().lower(), required)
    return (
        f"当前选择的是{selected_label}，但该 Apple ID 需使用{required_label}。"
        f"请切换「iCloud 区域」后重新登录"
    )


def normalize_icloud_domain(raw: Any) -> str | None:
    """
    规整 iCloud 根域参数。

    @returns `com` / `cn` / None（未指定）
    """
    value = str(raw or "").strip().lower()
    if value in SUPPORTED_ICLOUD_DOMAINS:
        return value
    return None


def _session_file_stem(apple_id: str) -> str:
    """与 pyicloud_ipd 一致的 session / cookiejar 文件名 stem。"""
    return "".join(c for c in apple_id.strip() if re.match(r"\w", c))


def session_artifact_paths(session_dir: str, apple_id: str) -> tuple[Path, Path]:
    """返回 (cookiejar_path, session_json_path)。"""
    stem = _session_file_stem(apple_id)
    base = Path(session_dir)
    return base / stem, base / f"{stem}.session"


def clear_session_artifacts(session_dir: str, apple_id: str, *, include_cookies: bool = True) -> None:
    """
    删除指定 Apple ID 的落盘 session / cookiejar。

    @note 从 pyicloud 2.x 迁移到 pyicloud_ipd 时，旧 token 可能触发 authenticate() 内 KeyError('dsInfo')。
    """
    cookiejar_path, session_path = session_artifact_paths(session_dir, apple_id)
    targets = [session_path]
    if include_cookies:
        targets.append(cookiejar_path)
    for target in targets:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass


def domain_hint_path(session_dir: str, apple_id: str) -> Path:
    """落盘的 iCloud 根域偏好（com / cn）。"""
    stem = _session_file_stem(apple_id)
    return Path(session_dir) / f"{stem}.icloud-domain"


def load_domain_hint(session_dir: str, apple_id: str) -> str | None:
    """
    读取上次成功登录使用的 iCloud 域。

    @returns `com` / `cn` / None
    """
    path = domain_hint_path(session_dir, apple_id)
    try:
        value = path.read_text(encoding="utf-8").strip().lower()
    except OSError:
        return None
    return value if value in SUPPORTED_ICLOUD_DOMAINS else None


def save_domain_hint(session_dir: str, apple_id: str, domain: str) -> None:
    """持久化账号对应的 iCloud 根域（中国大陆账号通常为 cn）。"""
    normalized = domain.strip().lower()
    if normalized not in SUPPORTED_ICLOUD_DOMAINS:
        return
    path = domain_hint_path(session_dir, apple_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(normalized, encoding="utf-8")
    except OSError:
        pass


def parse_required_domain(exc: BaseException) -> str | None:
    """
    从 PyiCloudConnectionException 解析 Apple 要求的根域。

    @note 典型消息：Apple insists on using iCloud.com.cn for your request.
    """
    msg = str(exc).lower()
    if "icloud.com.cn" in msg:
        return "cn"
    if "domain" in msg and " cn" in f" {msg}":
        return "cn"
    return None


def is_domain_mismatch_exception(exc: BaseException) -> bool:
    """是否为 iCloud 根域不匹配（需切换 com/cn）。"""
    if parse_required_domain(exc) is not None:
        return True
    try:
        conn_exc = load_connection_exception_class()
        if isinstance(exc, conn_exc):
            return "domain parameter" in str(exc).lower()
    except Exception:
        pass
    return type(exc).__name__ == "PyiCloudConnectionException"


def build_domain_attempt_order(session_dir: str, apple_id: str) -> list[str]:
    """构造 domain 尝试顺序：优先已落盘偏好，其次 com → cn。"""
    saved = load_domain_hint(session_dir, apple_id)
    order: list[str] = []
    if saved:
        order.append(saved)
    for domain in SUPPORTED_ICLOUD_DOMAINS:
        if domain not in order:
            order.append(domain)
    return order


def api_domain(api: Any) -> str:
    """读取 PyiCloudService 当前使用的根域。"""
    value = str(getattr(api, "domain", DEFAULT_ICLOUD_DOMAIN) or DEFAULT_ICLOUD_DOMAIN).lower()
    return value if value in SUPPORTED_ICLOUD_DOMAINS else DEFAULT_ICLOUD_DOMAIN


def _is_dsinfo_key_error(exc: BaseException) -> bool:
    return isinstance(exc, KeyError) and exc.args and exc.args[0] == "dsInfo"


def _persist_session_data(api: Any) -> None:
    """将 session_data 写回 .session 文件（丢弃 stale token 时用）。"""
    session_path = getattr(api, "session_path", None)
    data = session_data(api)
    if not session_path or not isinstance(data, dict):
        return
    try:
        with open(session_path, "w", encoding="utf-8") as outfile:
            json.dump(data, outfile)
    except OSError:
        pass


def _drop_stale_session_tokens(api: Any) -> None:
    """清除 validate 路径残留的 session_token，强制走完整 SRP。"""
    data = session_data(api)
    data.pop("session_token", None)
    data.pop("trust_token", None)
    _persist_session_data(api)


def load_sidecar_service_class() -> type[Any]:
    """
    返回 sidecar 专用 PyiCloudService 子类。

    @note 修复 vendor authenticate() 在 stale session 上 KeyError('dsInfo') 导致 UI 显示原始 KeyError 的问题。
    """
    base_cls = load_service_class()

    class SidecarPyiCloudService(base_cls):  # type: ignore[misc,valid-type]
        def authenticate(self, force_refresh: bool = False) -> None:
            try:
                super().authenticate(force_refresh)
            except KeyError as exc:
                if not _is_dsinfo_key_error(exc):
                    raise
                # validate 复用了旧 session_token，但响应缺少 dsInfo — 清 token 后重走 SRP
                if self.session_data.get("session_token") and not force_refresh:
                    _drop_stale_session_tokens(self)
                    super().authenticate(force_refresh=True)
                    return
                raise IcloudIncompleteAuthError(
                    "Apple 登录响应缺少 dsInfo（旧 session 不兼容或 2FA 未完成）"
                ) from exc

        @property
        def requires_2fa(self) -> bool:
            data = getattr(self, "data", None)
            if not isinstance(data, dict):
                return False
            ds_info = data.get("dsInfo")
            if not isinstance(ds_info, dict):
                return False
            return (
                ds_info.get("hsaVersion", 0) == 2
                and (data.get("hsaChallengeRequired", False) or not self.is_trusted_session)
                and ds_info.get("hasICloudQualifyingDevice", False)
            )

    return SidecarPyiCloudService


def build_api(
    apple_id: str,
    password: str,
    session_dir: str,
    *,
    icloud_domain: str | None = None,
    allow_domain_fallback: bool = False,
) -> Any:
    """
    创建 icloudpd PyiCloudService 客户端。

    @param icloud_domain 用户显式选择的根域（`com` / `cn`）；未指定时读落盘偏好或默认 com。
    @param allow_domain_fallback 为 True 时在 domain 不匹配时自动切换并重试（仅兼容旧路径）。
    @note stale session 导致 IcloudIncompleteAuthError 时会清盘并重试一次（同域内）。
    """
    Service = load_sidecar_service_class()
    pwd = password
    aid = apple_id.strip()

    def password_provider() -> str | None:
        return pwd or None

    explicit = normalize_icloud_domain(icloud_domain)
    if explicit:
        domains = [explicit]
    elif allow_domain_fallback:
        domains = build_domain_attempt_order(session_dir, aid)
    else:
        domains = [load_domain_hint(session_dir, aid) or DEFAULT_ICLOUD_DOMAIN]

    last_exc: Exception | None = None
    for domain in domains:
        for stale_attempt in range(2):
            try:
                api = Service(
                    domain,
                    aid,
                    password_provider,
                    None,
                    cookie_directory=session_dir,
                )
                save_domain_hint(session_dir, aid, domain)
                return api
            except IcloudIncompleteAuthError as exc:
                last_exc = exc
                if stale_attempt == 0:
                    clear_session_artifacts(session_dir, aid)
                    continue
                raise
            except Exception as exc:
                if is_domain_mismatch_exception(exc):
                    required = parse_required_domain(exc) or ("cn" if domain == "com" else "com")
                    last_exc = exc
                    clear_session_artifacts(session_dir, aid)
                    if allow_domain_fallback and required != domain and len(domains) > 1:
                        break
                    if allow_domain_fallback and required != domain and domain == domains[-1]:
                        continue
                    if not allow_domain_fallback or len(domains) == 1:
                        raise IcloudDomainMismatchError(domain, required) from exc
                    break
                raise
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("build_api failed without exception")


def session_data(api: Any) -> dict[str, Any]:
    """读取 pyicloud_ipd session_data（scnt / session_token / trust_token 等）。"""
    data = getattr(api, "session_data", None)
    if isinstance(data, dict):
        return data
    session = getattr(api, "session", None)
    legacy = getattr(session, "data", None) if session is not None else None
    return legacy if isinstance(legacy, dict) else {}


def has_webauth_token(api: Any) -> bool:
    """session 是否已写入 Photos 所需的 X-APPLE-WWEBAUTH-* cookie。"""
    try:
        session = getattr(api, "session", None)
        if session is None:
            return False
        cookies = session.cookies
        getter = getattr(cookies, "get", None)
        if callable(getter):
            if getter("X-APPLE-WWEBAUTH-TOKEN") or getter("X-APPLE-WEBAUTH-TOKEN"):
                return True
        for cookie in cookies:
            name = str(getattr(cookie, "name", "") or "")
            if "WEBAUTH" in name.upper():
                return True
    except Exception:
        return False
    return False


def _safe_bool_property(api: Any, name: str) -> bool:
    """读取 pyicloud_ipd 布尔 property；KeyError('dsInfo') 时视为 MFA 未完成。"""
    try:
        return bool(getattr(api, name, False))
    except KeyError as exc:
        if _is_dsinfo_key_error(exc):
            return name == "requires_2fa"
        raise


def auth_snapshot(api: Any) -> dict[str, Any]:
    """
    pyicloud_ipd 鉴权快照（无 get_auth_status 时的等价实现）。

    @note authenticated 以 WEBAUTH + trusted_session 为准，与 agent 登录完成判定一致。
    """
    trusted = bool(getattr(api, "is_trusted_session", False))
    webauth = has_webauth_token(api)
    return {
        "authenticated": webauth and trusted,
        "trusted_session": trusted,
        "requires_2fa": _safe_bool_property(api, "requires_2fa"),
        "requires_2sa": _safe_bool_property(api, "requires_2sa"),
    }


def kickoff_2fa_push(api: Any) -> bool:
    """
    触发受信任设备 2FA 推送（icloudpd request_2fa / request_2fa_web 第一步）。

    @note 对应 pyicloud_ipd.trigger_push_notification；失败非致命。
    """
    fn = getattr(api, "trigger_push_notification", None)
    if not callable(fn):
        return False
    try:
        return bool(fn())
    except Exception:
        return False


def infer_delivery_method(api: Any, cached: str = "") -> str:
    """
    推断 2FA 投递方式。

    @note pyicloud_ipd 无 two_factor_delivery_method；icloudpd 默认 PUT 后走设备验证码。
    @returns `sms` / `trusted_device` / `unknown`
    """
    if cached.strip():
        return cached.strip()
    legacy = getattr(api, "two_factor_delivery_method", None)
    if callable(legacy):
        value = str(legacy() or "").strip()
        if value:
            return value
    try:
        phones_fn = getattr(api, "get_trusted_phone_numbers", None)
        if callable(phones_fn):
            phones = phones_fn()
            if phones:
                # 账号支持 SMS，但 icloudpd 默认仍先 PUT 设备验证；UI 按 trusted_device 引导
                return "trusted_device"
    except Exception:
        pass
    return "trusted_device"


def supports_trusted_device_bridge(api: Any) -> bool:
    """icloudpd 路径不使用 pyicloud bridge 二次推送；诊断字段保留为 False。"""
    fn = getattr(api, "_supports_trusted_device_bridge", None)
    if callable(fn):
        return bool(fn())
    return False


def submit_sms_code(api: Any, code: str, device_id: int | None) -> bool:
    """
    SMS 2FA：send_2fa_code_sms + validate_2fa_code_sms（icloudpd request_2fa SMS 分支）。

    @param device_id 为空时取第一个受信手机号。
    """
    validate_fn = getattr(api, "validate_2fa_code_sms", None)
    if not callable(validate_fn):
        return False
    resolved_id = device_id
    phones_fn = getattr(api, "get_trusted_phone_numbers", None)
    if resolved_id is None and callable(phones_fn):
        phones = phones_fn()
        if phones:
            resolved_id = int(getattr(phones[0], "id", 0) or 0) or None
    if resolved_id is None:
        return False
    send_fn = getattr(api, "send_2fa_code_sms", None)
    if callable(send_fn):
        send_fn(resolved_id)
    return bool(validate_fn(resolved_id, code))


def load_2fa_exception_classes() -> tuple[type[BaseException], ...]:
    """pyicloud_ipd 2FA/2SA 相关异常类型。"""
    _ensure_vendor_path()
    classes: list[type[BaseException]] = []
    try:
        from pyicloud_ipd.exceptions import PyiCloud2SARequiredException  # type: ignore

        classes.append(PyiCloud2SARequiredException)
    except Exception:
        pass
    for attr in ("PyiCloud2FARequiredException", "PyiCloudTwoStepAuthRequiredException"):
        try:
            module = __import__("pyicloud_ipd.exceptions", fromlist=[attr])
            exc_cls = getattr(module, attr, None)
            if isinstance(exc_cls, type) and issubclass(exc_cls, BaseException):
                classes.append(exc_cls)
        except Exception:
            pass
    return tuple(classes)


def map_api_exception(exc: BaseException, *, is_2fa_required: Callable[[BaseException], bool]) -> str | None:
    """
    将 pyicloud_ipd 异常映射为 protocol 错误码；无法识别时返回 None 交 agent 兜底。
    """
    from protocol import (
        CODE_ACCOUNT_LOCKED,
        CODE_AUTH_FAILED,
        CODE_DOMAIN_MISMATCH,
        CODE_NEED_2FA,
        CODE_RATE_LIMITED,
        CODE_SESSION_EXPIRED,
    )

    if is_2fa_required(exc):
        return CODE_NEED_2FA

    exc_type = type(exc).__name__
    if exc_type == "IcloudIncompleteAuthError" or _is_dsinfo_key_error(exc):
        return CODE_SESSION_EXPIRED
    if exc_type == "IcloudDomainMismatchError":
        return CODE_DOMAIN_MISMATCH
    if exc_type == "PyiCloudConnectionException" or is_domain_mismatch_exception(exc):
        return CODE_DOMAIN_MISMATCH
    msg = str(exc)
    code = str(getattr(exc, "code", "") or "")

    if exc_type in ("PyiCloudFailedLoginException",):
        return CODE_AUTH_FAILED
    if exc_type in ("PyiCloudFailedMFAException",):
        return CODE_AUTH_FAILED
    if exc_type in ("PyiCloudAPIResponseException",):
        if code in ("AUTHENTICATION_FAILED", "421", "450", "500"):
            return CODE_SESSION_EXPIRED
        if code == "ACCESS_DENIED":
            return CODE_RATE_LIMITED
        if "Authentication required" in msg or "Invalid authentication token" in msg:
            return CODE_SESSION_EXPIRED
        return CODE_SESSION_EXPIRED
    if "-20209" in code or "-20209" in msg:
        return CODE_ACCOUNT_LOCKED
    return None
