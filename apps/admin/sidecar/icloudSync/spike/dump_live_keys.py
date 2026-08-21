#!/usr/bin/env python3
"""
Live Photo 元数据探针 — 导出 pyicloud PhotoAsset 原始 CloudKit 字段

职责：在开发机对真实 iCloud 账号 dump CPLMaster / CPLAsset 字段，供 Spike Step 1 判定 live_pair_id。
适用：Task 0 调查；需本机已安装 pyicloud（pip install pyicloud）。

安全：
- 凭据仅经环境变量 ICLOUD_SPIKE_APPLE_ID / ICLOUD_SPIKE_PASSWORD 传入；禁止写入日志或 stdout 全量密码。
- 输出 JSON 不含 password；Apple ID 可脱敏（--redact-id）。

用法：
  set ICLOUD_SPIKE_APPLE_ID=user@icloud.com
  set ICLOUD_SPIKE_PASSWORD=***
  set ICLOUD_SPIKE_COOKIE_DIR=C:\\path\\to\\session   # 可选，复用已有 session
  py -3 dump_live_keys.py --limit 20 --output live_dump.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any


def _redact_apple_id(apple_id: str) -> str:
    """Apple ID 脱敏：保留首字符与 @ 后域名。"""
    if "@" not in apple_id:
        return "***"
    local, domain = apple_id.split("@", 1)
    if len(local) <= 1:
        masked_local = "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 1)
    return f"{masked_local}@{domain}"


def _field_keys(record: dict[str, Any] | None) -> list[str]:
    if not record:
        return []
    fields = record.get("fields") or {}
    return sorted(fields.keys())


def _has_live_video_fields(master_record: dict[str, Any]) -> bool:
    fields = master_record.get("fields") or {}
    return any(k.startswith("resOriginalVidCompl") for k in fields)


def _serialize_record(record: dict[str, Any] | None, include_values: bool) -> dict[str, Any]:
    if not record:
        return {}
    out: dict[str, Any] = {
        "recordName": record.get("recordName"),
        "recordType": record.get("recordType"),
        "fieldKeys": _field_keys(record),
    }
    if include_values:
        # 仅导出 fields 结构；大 blob（res*）只保留 presence + size/url 摘要
        slim_fields: dict[str, Any] = {}
        for key, wrapper in (record.get("fields") or {}).items():
            val = wrapper.get("value") if isinstance(wrapper, dict) else wrapper
            if isinstance(val, dict) and "downloadURL" in val:
                slim_fields[key] = {
                    "type": wrapper.get("type"),
                    "size": val.get("size"),
                    "hasDownloadURL": True,
                }
            elif isinstance(val, (str, int, float, bool)):
                slim_fields[key] = val
            else:
                slim_fields[key] = {"type": wrapper.get("type"), "repr": str(val)[:120]}
        out["fields"] = slim_fields
    return out


def _probe_asset(photo: Any, include_values: bool) -> dict[str, Any]:
    """从 pyicloud PhotoAsset 提取 Spike 关心的绑定与排序字段。"""
    master = getattr(photo, "_master_record", None)
    asset = getattr(photo, "_asset_record", None)
    master_fields = (master or {}).get("fields") or {}
    asset_fields = (asset or {}).get("fields") or {}

    asset_date_ms = (asset_fields.get("assetDate") or {}).get("value")
    added_date_ms = (asset_fields.get("addedDate") or {}).get("value")

    return {
        "id": getattr(photo, "id", None),
        "filename": getattr(photo, "filename", None),
        "hasLiveVideoFields": _has_live_video_fields(master or {}),
        "hasResVidSmall": "resVidSmallRes" in master_fields,
        "itemType": (master_fields.get("itemType") or {}).get("value"),
        "assetSubtype": (asset_fields.get("assetSubtype") or {}).get("value"),
        "assetSubtypeV2": (asset_fields.get("assetSubtypeV2") or {}).get("value"),
        "itemId": (asset_fields.get("itemId") or {}).get("value"),
        "burstId": (asset_fields.get("burstId") or {}).get("value"),
        "masterRef": (asset_fields.get("masterRef") or {}).get("value"),
        "assetDateMs": asset_date_ms,
        "addedDateMs": added_date_ms,
        "assetDateIso": (
            datetime.utcfromtimestamp(asset_date_ms / 1000.0).replace(tzinfo=timezone.utc).isoformat()
            if asset_date_ms
            else None
        ),
        "addedDateIso": (
            datetime.utcfromtimestamp(added_date_ms / 1000.0).replace(tzinfo=timezone.utc).isoformat()
            if added_date_ms
            else None
        ),
        "masterRecord": _serialize_record(master, include_values),
        "assetRecord": _serialize_record(asset, include_values),
        "versionKeys": list((getattr(photo, "versions", None) or {}).keys()),
    }


def _collect_live_album(api: Any, limit: int) -> list[Any]:
    """优先从 Live 智能相册取样；失败则回退 All Photos 过滤。"""
    photos_mod = api.photos
    candidates: list[Any] = []
    try:
        live_album = photos_mod.albums.get("Live")
        if live_album:
            for photo in live_album:
                candidates.append(photo)
                if len(candidates) >= limit:
                    return candidates
    except Exception as exc:  # noqa: BLE001 — spike 脚本需捕获并报告
        print(f"[warn] Live album iteration failed: {exc}", file=sys.stderr)

    for photo in photos_mod.all:
        master = getattr(photo, "_master_record", {})
        if _has_live_video_fields(master):
            candidates.append(photo)
            if len(candidates) >= limit:
                break
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump pyicloud Live Photo metadata for Spike Step 1")
    parser.add_argument("--limit", type=int, default=10, help="Max Live-like assets to dump")
    parser.add_argument("--output", type=str, default="", help="Write JSON to file (default stdout)")
    parser.add_argument("--include-values", action="store_true", help="Include slim field values in output")
    parser.add_argument("--redact-id", action="store_true", help="Redact Apple ID in output")
    parser.add_argument("--also-all-photos", type=int, default=0, help="Also sample N from All Photos (non-Live)")
    args = parser.parse_args()

    apple_id = os.environ.get("ICLOUD_SPIKE_APPLE_ID", "").strip()
    password = os.environ.get("ICLOUD_SPIKE_PASSWORD", "")
    cookie_dir = os.environ.get("ICLOUD_SPIKE_COOKIE_DIR", "").strip() or None

    if not apple_id:
        print(
            "ERROR: Set ICLOUD_SPIKE_APPLE_ID (and ICLOUD_SPIKE_PASSWORD or existing cookie dir).\n"
            "This spike script does not prompt for credentials.",
            file=sys.stderr,
        )
        return 2

    try:
        from pyicloud import PyiCloudService
    except ImportError:
        print("ERROR: pyicloud not installed. Run: pip install pyicloud", file=sys.stderr)
        return 2

    print("[info] Connecting (network auth — 待真实账号验证)...", file=sys.stderr)
    api = PyiCloudService(apple_id, password or None, cookie_directory=cookie_dir)

    if getattr(api, "requires_2fa", False) or getattr(api, "requires_2sa", False):
        print(
            "ERROR: Account requires 2FA/2SA. Complete trust in browser or use validated cookie_dir.",
            file=sys.stderr,
        )
        return 3

    live_samples = [_probe_asset(p, args.include_values) for p in _collect_live_album(api, args.limit)]

    all_samples: list[dict[str, Any]] = []
    if args.also_all_photos > 0:
        for i, photo in enumerate(api.photos.all):
            if i >= args.also_all_photos:
                break
            all_samples.append(_probe_asset(photo, args.include_values))

    report = {
        "spikeStatus": "待真实账号验证",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "appleId": _redact_apple_id(apple_id) if args.redact_id else apple_id,
        "livePairIdCandidates": [
            "master_record.recordName (PhotoAsset.id) — P0 if still+mov same master",
            "asset_record.fields.itemId — P1 UNVERIFIED",
        ],
        "liveSamples": live_samples,
        "allPhotosSamples": all_samples,
        "notes": [
            "If hasLiveVideoFields=true on a single asset, live_pair_id likely = id (master recordName).",
            "If Live appears as two catalog rows, document shared key or escalate live_bind_missing.",
        ],
    }

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print(f"[info] Wrote {args.output}", file=sys.stderr)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
