#!/usr/bin/env python3
"""
iCloud Sync sidecar agent skeleton (line-JSON over stdin/stdout).

职责：
- 读取宿主逐行 JSON 命令并输出逐行 JSON 事件。
- 提供 ICLOUD_SYNC_MOCK=1 的离线路径，确保无网络环境可验证协议。
- 将 pyicloud 异常映射到稳定机读错误码。

适用场景：
- Task 1 协议联调与离线测试。
- 后续 Task 5/6 在此骨架上接入真实 catalog/download。
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from protocol import (
    CODE_ACCOUNT_LOCKED,
    CODE_AUTH_FAILED,
    CODE_CATALOG_SORT_MISSING,
    CODE_INVALID_REQUEST,
    CODE_LIVE_BIND_MISSING,
    CODE_NEED_2FA,
    CODE_RATE_LIMITED,
    CODE_SESSION_EXPIRED,
    CODE_DOWNLOAD_FAILED,
    done_event,
    error_event,
    need_2fa_event,
    version_event,
)

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
    },
    {
        "asset_id": "A2",
        "filename": "IMG_2.JPG",
        "media_kind": "photo",
        "live_pair_id": None,
        "capture_at": "2024-01-03T12:00:00Z",
        "added_at": "2024-01-04T12:00:00Z",
        "parts": ["still"],
    },
]


@dataclass
class AuthState:
    """缓存当前 sidecar 进程内的认证状态与待提交 2FA 会话。"""

    api: Any | None = None
    apple_id: str = ""
    session_dir: str = ""
    waiting_2fa: bool = False


_AUTH_STATE = AuthState()


class CatalogSortMissingError(RuntimeError):
    """目录项缺少视图要求的排序字段。"""


class LiveBindMissingError(RuntimeError):
    """检测到 Live 迹象但无法生成强绑定 live_pair_id。"""


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
    """
    延迟导入 pyicloud。

    @note 测试环境可能不安装 pyicloud，故仅在非 mock 且真实命令路径触发导入。
    """
    try:
        from pyicloud import PyiCloudService  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"pyicloud import failed: {exc}") from exc
    return PyiCloudService


_PYICLOUD_2FA_EXCEPTIONS: tuple[type[BaseException], ...] | None = None


def _get_pycloud_2fa_exception_classes() -> tuple[type[BaseException], ...]:
    """
    延迟加载 pyicloud 2FA/2SA 相关异常类型。

    @note pyicloud 未安装时返回空 tuple，调用方需配合异常类型名兜底。
    """
    global _PYICLOUD_2FA_EXCEPTIONS
    if _PYICLOUD_2FA_EXCEPTIONS is not None:
        return _PYICLOUD_2FA_EXCEPTIONS

    classes: list[type[BaseException]] = []
    try:
        from pyicloud.exceptions import PyiCloud2SARequiredException  # type: ignore

        classes.append(PyiCloud2SARequiredException)
    except Exception:
        pass

    # 兼容 fork/旧版命名；当前上游仅公开 PyiCloud2SARequiredException。
    for attr in ("PyiCloud2FARequiredException", "PyiCloudTwoStepAuthRequiredException"):
        try:
            module = __import__("pyicloud.exceptions", fromlist=[attr])
            exc_cls = getattr(module, attr, None)
            if isinstance(exc_cls, type) and issubclass(exc_cls, BaseException):
                classes.append(exc_cls)
        except Exception:
            pass

    _PYICLOUD_2FA_EXCEPTIONS = tuple(classes)
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
    if exc_type in ("PyiCloudFailedLoginException",):
        return CODE_AUTH_FAILED
    if exc_type in ("PyiCloudAPIResponseException",):
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


def _reset_auth_state() -> None:
    """清空进程内认证状态，等待用户显式重新 auth。"""
    _AUTH_STATE.api = None
    _AUTH_STATE.apple_id = ""
    _AUTH_STATE.session_dir = ""
    _AUTH_STATE.waiting_2fa = False


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


def _is_cloudkit_photo(photo: Any) -> bool:
    """是否为 pyicloud CloudKit PhotoAsset（非 legacy dict 记录）。"""
    return hasattr(photo, "is_live_photo") and hasattr(photo, "item_type")


def _photo_asset_id(photo: Any) -> str:
    """读取 PhotoAsset 稳定 id。"""
    for attr in ("id", "asset_id"):
        value = getattr(photo, attr, None)
        if value:
            return str(value).strip()
    return ""


def _cloudkit_media_kind(photo: Any) -> tuple[str, str | None]:
    """
    CloudKit PhotoAsset 媒体类型识别。

    @returns (media_kind, live_pair_id)
    """
    if bool(getattr(photo, "is_live_photo", False)):
        asset_id = _photo_asset_id(photo)
        live_pair_id = str(getattr(photo, "master_id", asset_id) or asset_id)
        if not live_pair_id:
            raise LiveBindMissingError("live photo missing bindable id")
        return "live", live_pair_id
    if getattr(photo, "item_type", "") == "movie":
        return "video", None
    return "photo", None


def _legacy_record_pair(photo: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """legacy pyicloud：将 _master/_asset_record 规整为 dict。"""
    master_record = getattr(photo, "_master_record", None)
    asset_record = getattr(photo, "_asset_record", None)
    if not isinstance(master_record, dict):
        master_record = {}
    if not isinstance(asset_record, dict):
        asset_record = {}
    return master_record, asset_record


def _asset_field(asset_record: dict[str, Any], key: str) -> Any:
    """读取 CPLAsset 字段值（legacy dict 记录）。"""
    wrapped = (asset_record.get("fields") or {}).get(key)
    if isinstance(wrapped, dict):
        return wrapped.get("value")
    return None


def _master_field(master_record: dict[str, Any], key: str) -> Any:
    """读取 CPLMaster 字段值（legacy dict 记录）。"""
    wrapped = (master_record.get("fields") or {}).get(key)
    if isinstance(wrapped, dict):
        return wrapped.get("value")
    return None
    """读取 CPLAsset 字段值。"""
    wrapped = (asset_record.get("fields") or {}).get(key)
    if isinstance(wrapped, dict):
        return wrapped.get("value")
    return None


def _master_field(master_record: dict[str, Any], key: str) -> Any:
    """读取 CPLMaster 字段值。"""
    wrapped = (master_record.get("fields") or {}).get(key)
    if isinstance(wrapped, dict):
        return wrapped.get("value")
    return None


def _has_live_indicator(master_record: dict[str, Any], asset_record: dict[str, Any], versions: Any) -> bool:
    """
    判断资产是否呈现 Live 迹象。

    @note UNVERIFIED：当前按 Spike 候选字段接线；后续需真实账号回填验证。
    """
    master_fields = master_record.get("fields") or {}
    if any(key.startswith("resOriginalVidCompl") for key in master_fields):
        return True

    subtype = _asset_field(asset_record, "assetSubtype")
    subtype_v2 = _asset_field(asset_record, "assetSubtypeV2")
    if subtype not in (None, "", 0) or subtype_v2 not in (None, "", 0):
        # UNVERIFIED：subtype 值域尚未在真实账号上确认；此处仅作为“可能是 Live”的保守信号。
        return True

    version_keys = list((versions or {}).keys()) if isinstance(versions, dict) else []
    return any("live" in str(key).lower() for key in version_keys)


def _detect_media_kind(photo: Any, master_record: dict[str, Any], asset_record: dict[str, Any]) -> tuple[str, str | None]:
    """
    识别媒体类型与 live_pair_id。

    @returns (media_kind, live_pair_id)
    """
    versions = getattr(photo, "versions", None)
    is_live = _has_live_indicator(master_record, asset_record, versions)
    if is_live:
        live_pair_id = str(getattr(photo, "id", "")).strip()
        if not live_pair_id:
            # UNVERIFIED P0：Live 强绑定优先使用 PhotoAsset.id/master recordName。
            live_pair_id = str(master_record.get("recordName", "")).strip()
        if not live_pair_id:
            raise LiveBindMissingError("live indicator found but no bindable id")
        return "live", live_pair_id

    item_type = str(_master_field(master_record, "itemType") or "").lower()
    filename = str(getattr(photo, "filename", "") or "").lower()
    if item_type.startswith("public.movie") or filename.endswith((".mov", ".mp4", ".m4v", ".avi")):
        return "video", None
    return "photo", None


def _catalog_item_from_photo(photo: Any, view: str) -> dict[str, Any]:
    """将 pyicloud PhotoAsset 转换为 sidecar catalog item。"""
    if _is_cloudkit_photo(photo):
        capture_at = _to_iso8601(getattr(photo, "asset_date", None))
        added_at = _to_iso8601(getattr(photo, "added_date", None))
        media_kind, live_pair_id = _cloudkit_media_kind(photo)
    else:
        master_record, asset_record = _legacy_record_pair(photo)
        capture_at = _to_iso8601(getattr(photo, "asset_date", None) or _asset_field(asset_record, "assetDate"))
        added_at = _to_iso8601(getattr(photo, "added_date", None) or _asset_field(asset_record, "addedDate"))
        media_kind, live_pair_id = _detect_media_kind(photo, master_record, asset_record)

    if view == "library" and not capture_at:
        raise CatalogSortMissingError("missing capture_at for library view")
    if view == "recents" and not added_at:
        raise CatalogSortMissingError("missing added_at for recents view")

    parts = ["still", "mov"] if media_kind == "live" else (["video"] if media_kind == "video" else ["still"])

    asset_id = _photo_asset_id(photo)
    if not asset_id:
        raise LiveBindMissingError("asset id missing")

    return {
        "asset_id": asset_id,
        "filename": getattr(photo, "filename", "") or f"{asset_id}.bin",
        "media_kind": media_kind,
        "live_pair_id": live_pair_id,
        "capture_at": capture_at,
        "added_at": added_at,
        "parts": parts,
    }


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

    优先复用进程内 _AUTH_STATE；否则用 session_dir 中 cookie 恢复（password 为空）。
    @note sidecar 进程重启后 catalog/download 仍可通过 session 文件续用登录态。
    """
    if _AUTH_STATE.api is not None:
        return _AUTH_STATE.api

    aid = (apple_id or _AUTH_STATE.apple_id).strip()
    sd = (session_dir or _AUTH_STATE.session_dir).strip()
    if not aid or not sd:
        raise RuntimeError("not authenticated")

    api = _build_api(apple_id=aid, password="", session_dir=sd)
    _AUTH_STATE.api = api
    _AUTH_STATE.apple_id = aid
    _AUTH_STATE.session_dir = sd
    _AUTH_STATE.waiting_2fa = False
    return api


def _build_api(apple_id: str, password: str, session_dir: str) -> Any:
    """创建 pyicloud API 客户端，session 复用目录由调用方传入。"""
    PyiCloudService = _load_pycloud_service()
    return PyiCloudService(apple_id, password or None, cookie_directory=session_dir)


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
    """按 asset_id 在 all photos 中查找目标资产。"""
    for photo in api.photos.all:
        if str(getattr(photo, "id", "")).strip() == asset_id:
            return photo
    return None


def _live_video_download_url(photo: Any) -> str | None:
    """提取 Live MOV 下载链接（legacy dict 记录）。"""
    if _is_cloudkit_photo(photo):
        url = photo.download_url("original_video")
        return str(url) if url else None
    master_record, _ = _legacy_record_pair(photo)
    fields = master_record.get("fields") or {}
    for key in ("resOriginalVidComplRes", "resOriginalVidCompl"):
        wrapped = fields.get(key)
        value = wrapped.get("value") if isinstance(wrapped, dict) else None
        if isinstance(value, dict):
            url = value.get("downloadURL")
            if url:
                return str(url)
    return None


def _write_bytes_atomic(data: bytes, dest_path: str) -> None:
    """字节内容原子落盘（CloudKit photo.download 返回 bytes）。"""
    destination = Path(dest_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial_path = destination.with_name(destination.name + ".partial")
    try:
        partial_path.write_bytes(data)
        os.replace(str(partial_path), str(destination))
    except Exception:
        if partial_path.exists():
            partial_path.unlink()
        raise


def _cloudkit_download_response(api: Any, photo: Any, part: str) -> Any:
    """CloudKit PhotoAsset 下载：still/video 返回 bytes，live mov 返回 stream response。"""
    if part == "still":
        data = photo.download("original")
        if not data:
            raise RuntimeError("still download returned empty")
        return data
    if part == "video":
        if getattr(photo, "item_type", "") != "movie":
            raise ValueError("part=video only allowed for video assets")
        data = photo.download("original")
        if not data:
            raise RuntimeError("video download returned empty")
        return data
    if part == "mov":
        if not getattr(photo, "is_live_photo", False):
            raise ValueError("part=mov only allowed for live assets")
        url = photo.download_url("original_video")
        if not url:
            raise LiveBindMissingError("live asset has no video download URL")
        response = api.session.get(url, stream=True, timeout=120)
        if hasattr(response, "raise_for_status"):
            response.raise_for_status()
        return response
    raise ValueError("part must be still, mov, or video")


def _download_response(api: Any, photo: Any, part: str) -> Any:
    """根据 part 拉取对应资源响应对象。"""
    if _is_cloudkit_photo(photo):
        return _cloudkit_download_response(api, photo, part)

    if part == "still":
        return photo.download()

    if part == "video":
        master_record, asset_record = _legacy_record_pair(photo)
        media_kind, _ = _detect_media_kind(photo, master_record, asset_record)
        if media_kind != "video":
            raise ValueError("part=video only allowed for video assets")
        return photo.download()

    if part == "mov":
        master_record, asset_record = _legacy_record_pair(photo)
        media_kind, _ = _detect_media_kind(photo, master_record, asset_record)
        if media_kind != "live":
            raise ValueError("part=mov only allowed for live assets")
        url = _live_video_download_url(photo)
        if not url:
            raise LiveBindMissingError("live asset has no video download URL")
        response = api.session.get(url, stream=True, timeout=120)
        if hasattr(response, "raise_for_status"):
            response.raise_for_status()
        return response

    raise ValueError("part must be still, mov, or video")


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
        and not _AUTH_STATE.waiting_2fa
    ):
        return done_event("auth", reused=True)

    Path(session_dir).mkdir(parents=True, exist_ok=True)

    api: Any | None = None
    try:
        api = _build_api(apple_id=apple_id, password=password, session_dir=session_dir)
        _AUTH_STATE.api = api
        _AUTH_STATE.apple_id = apple_id
        _AUTH_STATE.session_dir = session_dir
        _AUTH_STATE.waiting_2fa = bool(getattr(api, "requires_2fa", False) or getattr(api, "requires_2sa", False))

        if _AUTH_STATE.waiting_2fa:
            return need_2fa_event("auth", "2FA/2SA verification required")

        return done_event("auth")
    except Exception as exc:  # noqa: BLE001
        if _is_2fa_required_exception(exc):
            # pyicloud 可能在构造/鉴权阶段直接抛 2SA 异常而非设置 requires_2fa 标志。
            if api is not None:
                _AUTH_STATE.api = api
            _AUTH_STATE.apple_id = apple_id
            _AUTH_STATE.session_dir = session_dir
            _AUTH_STATE.waiting_2fa = True
            return need_2fa_event("auth", "2FA/2SA verification required")

        _reset_auth_state()
        code = _map_exception(exc)
        return error_event("auth", code, str(exc)[:500])


def _handle_auth_2fa(cmd: dict[str, Any]) -> dict[str, Any]:
    """处理 auth_2fa 命令。"""
    code = str(cmd.get("code", "")).strip()
    if _is_mock_mode():
        return done_event("auth_2fa", mock=True)
    if not code:
        return error_event("auth_2fa", CODE_INVALID_REQUEST, "2fa code is required")
    if _AUTH_STATE.api is None or not _AUTH_STATE.waiting_2fa:
        return error_event("auth_2fa", CODE_AUTH_FAILED, "auth_2fa requested without pending challenge")

    try:
        valid = bool(_AUTH_STATE.api.validate_2fa_code(code))
        if not valid:
            return error_event("auth_2fa", CODE_AUTH_FAILED, "invalid 2fa code")

        trusted = False
        if hasattr(_AUTH_STATE.api, "trust_session"):
            trusted = bool(_AUTH_STATE.api.trust_session())
        _AUTH_STATE.waiting_2fa = False
        return done_event("auth_2fa", trusted=trusted)
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
        return error_event("auth_2fa", mapped, str(exc)[:500])


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
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
        return error_event("catalog", mapped, str(exc)[:500])


def _handle_download(cmd: dict[str, Any]) -> dict[str, Any]:
    """处理 download 命令。"""
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
        photo = _locate_photo_by_asset_id(api, asset_id)
        if photo is None:
            return error_event("download", CODE_INVALID_REQUEST, f"asset not found: {asset_id}")
        response = _download_response(api, photo, part)
        if isinstance(response, (bytes, bytearray)):
            _write_bytes_atomic(bytes(response), dest_path)
        else:
            _write_stream_atomic(response, dest_path)
        return done_event("download", asset_id=asset_id, part=part, dest_path=dest_path)
    except ValueError as exc:
        return error_event("download", CODE_INVALID_REQUEST, str(exc))
    except LiveBindMissingError as exc:
        return error_event("download", CODE_LIVE_BIND_MISSING, str(exc))
    except RuntimeError as exc:
        if str(exc) == "not authenticated":
            return error_event("download", CODE_AUTH_FAILED, "explicit auth is required before download")
        return error_event("download", CODE_DOWNLOAD_FAILED, str(exc)[:500])
    except Exception as exc:  # noqa: BLE001
        mapped = _map_exception(exc)
        if mapped in (CODE_SESSION_EXPIRED, CODE_ACCOUNT_LOCKED):
            _reset_auth_state()
            return error_event("download", mapped, str(exc)[:500])
        return error_event("download", CODE_DOWNLOAD_FAILED, str(exc)[:500])


def _dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    """按 cmd 路由到对应处理器。"""
    name = str(cmd.get("cmd", "")).strip()
    if name == "version":
        return version_event()
    if name == "auth":
        return _handle_auth(cmd)
    if name == "auth_2fa":
        return _handle_auth_2fa(cmd)
    if name == "catalog":
        return _handle_catalog(cmd)
    if name == "download":
        return _handle_download(cmd)
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
