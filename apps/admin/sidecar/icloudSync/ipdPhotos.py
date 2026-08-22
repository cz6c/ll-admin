#!/usr/bin/env python3
"""
pyicloud_ipd PhotoAsset 适配（对齐 icloudpd v1.32.3）

职责：
- 用 PhotoAsset.item_type + versions 识别 photo / video / live（与 icloudpd 一致）
- 通过 photo.download(session, version.url) 拉取 still / video / Live mov
- P1：单文件重试、自适应 HTTP 超时

适用：sidecar agent catalog/download；Mock 模式不 import 本模块。
"""

from __future__ import annotations

import random
import sys
import time
from pathlib import Path
from typing import Any

from icloudAuth import ICLOUDPD_VENDOR_DIR, ICLOUDPD_VENDOR_TAG
from protocol import LiveBindMissingError

_IPD_TYPES: tuple[type[Any], ...] | None = None

# P1：单文件最多 3 次尝试；退避秒数（不含 sidecar 外层 resume）
MAX_DOWNLOAD_ATTEMPTS = 3
RETRY_BACKOFF_SEC = (1.0, 2.0, 4.0)

# HTTP 超时：120s 起，按体积估算，上限 600s
MIN_DOWNLOAD_TIMEOUT_SEC = 120
MAX_DOWNLOAD_TIMEOUT_SEC = 600


def _ensure_vendor_path() -> None:
    root = Path(__file__).resolve().parent
    vendor_src = root / "vendor" / ICLOUDPD_VENDOR_DIR / "src"
    if not vendor_src.is_dir():
        raise RuntimeError(
            f"icloudpd vendor missing at {vendor_src}; extract v{ICLOUDPD_VENDOR_TAG} zip"
        )
    path = str(vendor_src)
    if path not in sys.path:
        sys.path.insert(0, path)


def _load_ipd_types() -> tuple[Any, Any, Any, Any]:
    """延迟加载 pyicloud_ipd 枚举，避免 Mock 模式强依赖 vendor。"""
    global _IPD_TYPES
    if _IPD_TYPES is not None:
        return _IPD_TYPES
    _ensure_vendor_path()
    from pyicloud_ipd.item_type import AssetItemType  # type: ignore
    from pyicloud_ipd.raw_policy import RawTreatmentPolicy  # type: ignore
    from pyicloud_ipd.version_size import AssetVersionSize, LivePhotoVersionSize  # type: ignore

    _IPD_TYPES = (AssetItemType, AssetVersionSize, LivePhotoVersionSize, RawTreatmentPolicy)
    return _IPD_TYPES


def is_ipd_photo_asset(photo: Any) -> bool:
    """
    是否为 pyicloud_ipd.services.photos.PhotoAsset。

    @note 不用 picklepete/pyicloud 的 is_live_photo、无参 download() 等旧 API。
    """
    return (
        hasattr(photo, "versions")
        and hasattr(photo, "_master_record")
        and hasattr(photo, "item_type")
        and callable(getattr(photo, "download", None))
    )


def photo_asset_id(photo: Any) -> str:
    """读取 PhotoAsset.id（master recordName）。"""
    value = getattr(photo, "id", None)
    if value:
        return str(value).strip()
    return ""


def ipd_asset_versions(photo: Any) -> dict[Any, Any]:
    """
    返回应用 RAW 策略后的 versions 字典。

    @note 与 icloudpd CLI 默认 `--align-raw as-is` 一致。
    """
    _, _, _, RawTreatmentPolicy = _load_ipd_types()
    if hasattr(photo, "versions_with_raw_policy"):
        return photo.versions_with_raw_policy(RawTreatmentPolicy.AS_IS)
    return photo.versions


def ipd_media_kind(photo: Any) -> tuple[str, str | None]:
    """
    识别 sidecar catalog 媒体类型。

    @returns (media_kind, live_pair_id)
    @note live 判定：IMAGE 且 versions 含 LivePhotoVersionSize.ORIGINAL（icloudpd 同源）
    """
    AssetItemType, _, LivePhotoVersionSize, _ = _load_ipd_types()
    item_type = photo.item_type
    versions = ipd_asset_versions(photo)

    if item_type == AssetItemType.MOVIE:
        return "video", None

    if LivePhotoVersionSize.ORIGINAL in versions:
        asset_id = photo_asset_id(photo)
        if not asset_id:
            raise LiveBindMissingError("live photo missing bindable id")
        return "live", asset_id

    return "photo", None


def ipd_photos_session(api: Any) -> Any:
    """获取 Photos 服务使用的 requests Session（与 icloudpd download_media 一致）。"""
    photos = getattr(api, "photos", None)
    if photos is None:
        raise RuntimeError("photos service unavailable")
    session = getattr(photos, "session", None)
    if session is not None:
        return session
    session = getattr(api, "session", None)
    if session is not None:
        return session
    raise RuntimeError("photos session unavailable")


def timeout_for_size(size_bytes: int) -> int:
    """
    按资源体积估算 HTTP 超时（秒）。

    @note 大视频/HDR 原片需长于 Rust 侧默认 120s 等待窗口。
    """
    if size_bytes <= 0:
        return MIN_DOWNLOAD_TIMEOUT_SEC
    estimated = 60 + size_bytes // (500 * 1024)
    return max(MIN_DOWNLOAD_TIMEOUT_SEC, min(MAX_DOWNLOAD_TIMEOUT_SEC, estimated))


def _download_asset_with_timeout(session: Any, url: str, size_bytes: int) -> Any:
    """带 Range 与自适应超时的 GET（对齐 icloudpd download_asset，补 timeout）。"""
    timeout = timeout_for_size(size_bytes)
    headers = {"Range": "bytes=0-"}
    return session.get(url, headers=headers, stream=True, timeout=timeout)


def is_retryable_download_error(exc: BaseException) -> bool:
    """
    判断是否应对单文件下载重试。

    @note auth / 绑定 / 参数类错误不重试，避免放大 Apple 压力。
    """
    if isinstance(exc, (ValueError, LiveBindMissingError)):
        return False
    if isinstance(exc, RuntimeError):
        msg = str(exc).lower()
        if "http 401" in msg or "http 403" in msg or "http 404" in msg:
            return False
        if "http 5" in msg or "timeout" in msg or "connection" in msg:
            return True
        if "missing" in msg:
            return False
        return True
    return True


def ipd_download_response(api: Any, photo: Any, part: str) -> Any:
    """
    按 Rust 队列 part 拉取 HTTP Response（stream）。

    @param part `still` | `video` | `mov`
    @raises ValueError part 与资产类型不匹配
    @raises LiveBindMissingError Live 缺 mov 版本
    """
    AssetItemType, AssetVersionSize, LivePhotoVersionSize, _ = _load_ipd_types()
    session = ipd_photos_session(api)
    versions = ipd_asset_versions(photo)
    part = part.strip().lower()

    if part == "still":
        if photo.item_type == AssetItemType.MOVIE:
            raise ValueError("part=still not allowed for video assets")
        if AssetVersionSize.ORIGINAL not in versions:
            raise RuntimeError("still original version missing")
        version = versions[AssetVersionSize.ORIGINAL]
        response = _download_asset_with_timeout(session, version.url, int(version.size))
        _ensure_response_ok(response, "still")
        return response

    if part == "video":
        if photo.item_type != AssetItemType.MOVIE:
            raise ValueError("part=video only allowed for video assets")
        if AssetVersionSize.ORIGINAL not in versions:
            raise RuntimeError("video original version missing")
        version = versions[AssetVersionSize.ORIGINAL]
        response = _download_asset_with_timeout(session, version.url, int(version.size))
        _ensure_response_ok(response, "video")
        return response

    if part == "mov":
        if LivePhotoVersionSize.ORIGINAL not in versions:
            raise LiveBindMissingError("live asset has no video download version")
        version = versions[LivePhotoVersionSize.ORIGINAL]
        response = _download_asset_with_timeout(session, version.url, int(version.size))
        _ensure_response_ok(response, "live mov")
        return response

    raise ValueError("part must be still, mov, or video")


def ipd_download_response_with_retry(api: Any, photo: Any, part: str) -> Any:
    """
    带有限重试的下载。

    @note 最多 MAX_DOWNLOAD_ATTEMPTS 次；退避 + 小幅 jitter 降并发冲突。
    """
    last_exc: BaseException | None = None
    for attempt in range(MAX_DOWNLOAD_ATTEMPTS):
        try:
            return ipd_download_response(api, photo, part)
        except BaseException as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= MAX_DOWNLOAD_ATTEMPTS - 1 or not is_retryable_download_error(exc):
                raise
            backoff = RETRY_BACKOFF_SEC[min(attempt, len(RETRY_BACKOFF_SEC) - 1)]
            time.sleep(backoff + random.uniform(0, 0.3))
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("download retry exhausted")


def _ensure_response_ok(response: Any, label: str) -> None:
    """校验 HTTP 响应；与 icloudpd download_media 的 response.ok 检查一致。"""
    ok = getattr(response, "ok", None)
    if ok is False:
        status = getattr(response, "status_code", "?")
        raise RuntimeError(f"{label} download HTTP {status}")
    if ok is None and not hasattr(response, "iter_content"):
        raise RuntimeError(f"{label} download returned unsupported payload")
