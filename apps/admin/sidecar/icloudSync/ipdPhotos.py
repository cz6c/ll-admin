#!/usr/bin/env python3
"""
pyicloud_ipd PhotoAsset 适配（对齐 icloudpd v1.32.3）

职责：
- 用 PhotoAsset.item_type + versions 识别 photo / video / live（与 icloudpd 一致）
- 通过 photo.download(session, version.url) 拉取 still / video / Live mov
- records/lookup 按 asset_id 拉新鲜 CPLMaster（CDN URL 刷新，对齐 mandarons/icloud-docker #492）
- P1：单文件重试、自适应 HTTP 超时

适用：sidecar agent catalog/download；Mock 模式不 import 本模块。
"""

from __future__ import annotations

import json
import random
import time
from typing import Any, Sequence
from urllib.parse import urlencode

from icloudAuth import _ensure_vendor_path
from protocol import LiveBindMissingError

_IPD_TYPES: tuple[type[Any], ...] | None = None

# P1：单文件最多 3 次尝试；退避秒数（不含 sidecar 外层 resume）
MAX_DOWNLOAD_ATTEMPTS = 3
RETRY_BACKOFF_SEC = (1.0, 2.0, 4.0)

# HTTP 超时：120s 起，按体积估算，上限 600s
MIN_DOWNLOAD_TIMEOUT_SEC = 120
MAX_DOWNLOAD_TIMEOUT_SEC = 600

# CloudKit records/lookup 单批 recordName 上限（过大易触发 Apple 限流）
PHOTO_LOOKUP_BATCH_SIZE = 32

# lookup 请求的 desiredKeys（与 pyicloud_ipd PhotoAlbum._list_query_gen / icloud-docker 对齐）
LOOKUP_DESIRED_KEYS: list[str] = [
    "resJPEGFullWidth",
    "resJPEGFullHeight",
    "resJPEGFullFileType",
    "resJPEGFullFingerprint",
    "resJPEGFullRes",
    "resJPEGLargeWidth",
    "resJPEGLargeHeight",
    "resJPEGLargeFileType",
    "resJPEGLargeFingerprint",
    "resJPEGLargeRes",
    "resJPEGMedWidth",
    "resJPEGMedHeight",
    "resJPEGMedFileType",
    "resJPEGMedFingerprint",
    "resJPEGMedRes",
    "resJPEGThumbWidth",
    "resJPEGThumbHeight",
    "resJPEGThumbFileType",
    "resJPEGThumbFingerprint",
    "resJPEGThumbRes",
    "resVidFullWidth",
    "resVidFullHeight",
    "resVidFullFileType",
    "resVidFullFingerprint",
    "resVidFullRes",
    "resVidMedWidth",
    "resVidMedHeight",
    "resVidMedFileType",
    "resVidMedFingerprint",
    "resVidMedRes",
    "resVidSmallWidth",
    "resVidSmallHeight",
    "resVidSmallFileType",
    "resVidSmallFingerprint",
    "resVidSmallRes",
    "resSidecarWidth",
    "resSidecarHeight",
    "resSidecarFileType",
    "resSidecarFingerprint",
    "resSidecarRes",
    "itemType",
    "dataClassType",
    "filenameEnc",
    "originalOrientation",
    "resOriginalWidth",
    "resOriginalHeight",
    "resOriginalFileType",
    "resOriginalFingerprint",
    "resOriginalRes",
    "resOriginalAltWidth",
    "resOriginalAltHeight",
    "resOriginalAltFileType",
    "resOriginalAltFingerprint",
    "resOriginalAltRes",
    "resOriginalVidComplWidth",
    "resOriginalVidComplHeight",
    "resOriginalVidComplFileType",
    "resOriginalVidComplFingerprint",
    "resOriginalVidComplRes",
    "isDeleted",
    "isExpunged",
    "dateExpunged",
    "remappedRef",
    "recordName",
    "recordType",
    "recordChangeTag",
    "masterRef",
    "adjustmentRenderType",
    "assetDate",
    "addedDate",
    "isFavorite",
    "isHidden",
    "orientation",
    "duration",
    "assetSubtype",
    "assetSubtypeV2",
    "assetHDRType",
    "burstFlags",
    "burstFlagsExt",
    "burstId",
    "captionEnc",
    "locationEnc",
    "locationV2Enc",
    "locationLatitude",
    "locationLongitude",
    "adjustmentType",
    "timeZoneOffset",
    "vidComplDurValue",
    "vidComplDurScale",
    "vidComplDispValue",
    "vidComplDispScale",
    "vidComplVisibilityState",
    "customRenderedValue",
    "containerId",
    "itemId",
    "position",
    "isKeyAsset",
]


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
        if "http 401" in msg or "http 403" in msg or "http 404" in msg or "http 410" in msg:
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


def _load_photo_asset_class() -> Any:
    """延迟加载 pyicloud_ipd PhotoAsset（构造 lookup 结果）。"""
    _ensure_vendor_path()
    from pyicloud_ipd.services.photos import PhotoAsset  # type: ignore

    return PhotoAsset


def _stub_asset_record(master_record: dict[str, Any]) -> dict[str, Any]:
    """
    lookup 仅返回 CPLMaster 时的 CPLAsset 占位。

    @note 下载 URL 在 master 的 res*Res 字段；versions 会回退读 master。
    """
    record_name = str(master_record.get("recordName", "")).strip()
    return {
        "recordType": "CPLAsset",
        "recordName": f"{record_name}-lookup-stub" if record_name else "lookup-stub",
        "fields": {},
    }


def _lookup_master_records(photos_service: Any, record_names: Sequence[str]) -> dict[str, Any]:
    """
    通过 CloudKit records/lookup 按 recordName 拉 CPLMaster。

    @note CPLMaster 不可 records/query（非 indexable）；lookup 是社区验证路径（icloud-docker #492）。
    @raises RuntimeError lookup 失败或响应不可解析
    """
    names = [str(name).strip() for name in record_names if str(name).strip()]
    if not names:
        return {}

    service_endpoint = getattr(photos_service, "service_endpoint", None)
    params = getattr(photos_service, "params", None)
    session = getattr(photos_service, "session", None)
    zone_id = getattr(photos_service, "zone_id", None)
    if not service_endpoint or not isinstance(params, dict) or session is None or not zone_id:
        raise RuntimeError("photos service missing lookup context")

    url = f"{service_endpoint}/records/lookup?{urlencode(params)}"
    payload = {
        "records": [{"recordName": name} for name in names],
        "desiredKeys": LOOKUP_DESIRED_KEYS,
        "zoneID": zone_id,
    }
    response = session.post(
        url,
        data=json.dumps(payload),
        headers={"Content-type": "text/plain"},
    )
    status = getattr(response, "status_code", None)
    if status is not None and int(status) >= 400:
        raise RuntimeError(f"photo lookup HTTP {status}")

    body = response.json() if hasattr(response, "json") else {}
    records = body.get("records") if isinstance(body, dict) else None
    if not isinstance(records, list):
        raise RuntimeError("photo lookup response missing records")

    photo_asset_cls = _load_photo_asset_class()
    found: dict[str, Any] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        if record.get("reason"):
            continue
        if record.get("recordType") != "CPLMaster":
            continue
        record_name = str(record.get("recordName", "")).strip()
        if not record_name:
            continue
        photo = photo_asset_cls(record, _stub_asset_record(record))
        if hasattr(photo, "_versions"):
            photo._versions = None  # noqa: SLF001
        found[record_name] = photo
    return found


def fetch_photo_assets_by_ids(api: Any, asset_ids: Sequence[str]) -> dict[str, Any]:
    """
    按 asset_id（CPLMaster recordName）经 records/lookup 获取带新 downloadURL 的 PhotoAsset。

    @returns asset_id → PhotoAsset；任一 ID 缺失则抛 RuntimeError
  """
    normalized = [str(asset_id).strip() for asset_id in asset_ids if str(asset_id).strip()]
    if not normalized:
        return {}

    unique = list(dict.fromkeys(normalized))
    photos_service = getattr(api, "photos", None)
    if photos_service is None:
        raise RuntimeError("photos service unavailable")

    found: dict[str, Any] = {}
    for offset in range(0, len(unique), PHOTO_LOOKUP_BATCH_SIZE):
        chunk = unique[offset : offset + PHOTO_LOOKUP_BATCH_SIZE]
        batch = _lookup_master_records(photos_service, chunk)
        found.update(batch)

    missing = [asset_id for asset_id in unique if asset_id not in found]
    if missing:
        sample = ", ".join(missing[:3])
        raise RuntimeError(f"photo lookup missing records: {sample}")

    return {asset_id: found[asset_id] for asset_id in unique}


def cpl_asset_meta_from_photo(photo: Any) -> dict[str, str]:
    """
    从枚举得到的 PhotoAsset 提取删云元数据（供 catalog 落库）。

    @returns 可能为空 dict（stub / 缺字段时）
    """
    if not has_real_cpl_asset_record(photo):
        return {}
    asset = photo._asset_record  # noqa: SLF001
    name = str(asset.get("recordName", "")).strip()
    tag = str(asset.get("recordChangeTag", "")).strip()
    out: dict[str, str] = {"cpl_asset_record_name": name}
    if tag:
        out["cpl_asset_change_tag"] = tag
    return out


def lookup_cpl_asset_change_tag(api: Any, record_name: str) -> str:
    """
    按 CPLAsset.recordName 定点 records/lookup 刷新 changeTag（O(1)，禁止扫库）。

    @raises RuntimeError 找不到或 HTTP 失败
    """
    name = str(record_name).strip()
    if not name:
        raise RuntimeError("cpl_asset_record_name required")

    photos_service = getattr(api, "photos", None)
    if photos_service is None:
        raise RuntimeError("photos service unavailable")

    service_endpoint = getattr(photos_service, "service_endpoint", None)
    params = getattr(photos_service, "params", None)
    session = getattr(photos_service, "session", None)
    zone_id = getattr(photos_service, "zone_id", None)
    if not service_endpoint or not isinstance(params, dict) or session is None or not zone_id:
        raise RuntimeError("photos service missing lookup context")

    url = f"{service_endpoint}/records/lookup?{urlencode(params)}"
    payload = {
        "records": [{"recordName": name}],
        "desiredKeys": ["recordName", "recordType", "recordChangeTag", "isDeleted", "masterRef"],
        "zoneID": zone_id,
    }
    response = session.post(
        url,
        data=json.dumps(payload),
        headers={"Content-type": "text/plain"},
    )
    status = getattr(response, "status_code", None)
    if status is not None and int(status) >= 400:
        raise RuntimeError(f"cpl asset lookup HTTP {status}")

    body = response.json() if hasattr(response, "json") else {}
    records = body.get("records") if isinstance(body, dict) else None
    if not isinstance(records, list) or not records:
        raise RuntimeError(f"cpl asset not found: {name}")

    record = records[0]
    if not isinstance(record, dict):
        raise RuntimeError(f"cpl asset lookup invalid: {name}")
    if record.get("reason") or record.get("serverErrorCode"):
        reason = record.get("reason") or record.get("serverErrorCode")
        # 已删除：调用方按幂等成功处理
        raise RuntimeError(f"cpl asset gone: {reason}")
    tag = str(record.get("recordChangeTag", "")).strip()
    if not tag:
        raise RuntimeError(f"cpl asset missing recordChangeTag: {name}")
    return tag


def delete_cpl_asset_by_record(
    api: Any,
    record_name: str,
    change_tag: str | None = None,
) -> None:
    """
    用落库的 CPLAsset.recordName 软删；tag 缺失或冲突时定点 lookup 刷新一次。

    @note 对齐 icloudpd delete_photo；不读进程 cache、不扫 photos.all。
    """
    name = str(record_name).strip()
    if not name:
        raise RuntimeError("cpl_asset_record_name required")

    photos_service = getattr(api, "photos", None)
    if photos_service is None:
        raise RuntimeError("photos service unavailable")

    service_endpoint = getattr(photos_service, "service_endpoint", None)
    params = getattr(photos_service, "params", None)
    session = getattr(photos_service, "session", None)
    zone_id = getattr(photos_service, "zone_id", None)
    if not service_endpoint or not isinstance(params, dict) or session is None or not zone_id:
        raise RuntimeError("photos service missing delete context")

    tag = (change_tag or "").strip()
    if not tag:
        tag = lookup_cpl_asset_change_tag(api, name)

    url = f"{service_endpoint}/records/modify?{urlencode(params)}"

    def _post(current_tag: str) -> Any:
        payload = {
            "atomic": True,
            "desiredKeys": ["isDeleted"],
            "operations": [
                {
                    "operationType": "update",
                    "record": {
                        "fields": {"isDeleted": {"value": 1}},
                        "recordChangeTag": current_tag,
                        "recordName": name,
                        "recordType": "CPLAsset",
                    },
                }
            ],
            "zoneID": zone_id,
        }
        return session.post(
            url,
            data=json.dumps(payload),
            headers={"Content-type": "application/json"},
        )

    response = _post(tag)
    status = getattr(response, "status_code", None)
    body = response.json() if hasattr(response, "json") else {}

    # changeTag 冲突：定点刷新后重试一次
    needs_retry = False
    if status is not None and int(status) >= 400:
        needs_retry = True
    elif isinstance(body, dict):
        for record in body.get("records") or []:
            if isinstance(record, dict) and (record.get("reason") or record.get("serverErrorCode")):
                reason = str(record.get("reason") or record.get("serverErrorCode") or "")
                if "GONE" in reason.upper() or "NOT_FOUND" in reason.upper():
                    return  # 已不存在 → 幂等成功
                needs_retry = True
                break

    if needs_retry:
        fresh = lookup_cpl_asset_change_tag(api, name)
        response = _post(fresh)
        status = getattr(response, "status_code", None)
        if status is not None and int(status) >= 400:
            raise RuntimeError(f"photo delete HTTP {status}")
        body = response.json() if hasattr(response, "json") else {}
        if isinstance(body, dict):
            for record in body.get("records") or []:
                if isinstance(record, dict) and (record.get("reason") or record.get("serverErrorCode")):
                    reason = record.get("reason") or record.get("serverErrorCode")
                    raise RuntimeError(f"photo delete rejected: {reason}")
        return

    if status is not None and int(status) >= 400:
        raise RuntimeError(f"photo delete HTTP {status}")
    if isinstance(body, dict):
        for record in body.get("records") or []:
            if isinstance(record, dict) and (record.get("reason") or record.get("serverErrorCode")):
                reason = record.get("reason") or record.get("serverErrorCode")
                raise RuntimeError(f"photo delete rejected: {reason}")


def has_real_cpl_asset_record(photo: Any) -> bool:
    """
    PhotoAsset 是否携带可删云用的真实 CPLAsset（含 recordChangeTag）。

    @note download 用的 records/lookup 只造 stub asset，不能用于 delete。
    """
    asset = getattr(photo, "_asset_record", None)
    if not isinstance(asset, dict):
        return False
    name = str(asset.get("recordName", "")).strip()
    if not name or name.endswith("-lookup-stub"):
        return False
    tag = asset.get("recordChangeTag")
    return tag is not None and str(tag).strip() != ""
