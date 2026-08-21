"""
Protocol contract tests for icloudSync sidecar.

职责：锁定 Task 1 协议常量与关键事件结构，防止后续实现阶段改坏握手/目录事件格式。
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _load_agent(mock: bool) -> object:
    """按 mock 开关重载 agent 模块，避免环境变量在测试间串扰。"""
    if mock:
        os.environ["ICLOUD_SYNC_MOCK"] = "1"
    else:
        os.environ.pop("ICLOUD_SYNC_MOCK", None)
    if "agent" in sys.modules:
        return importlib.reload(sys.modules["agent"])
    return importlib.import_module("agent")


def test_version_payload() -> None:
    from protocol import version_event

    ev = version_event()
    assert ev["type"] == "version"
    assert ev["protocol"] == 1
    assert ev["agent"] == "0.1.0"


def test_catalog_done_event_style_in_mock() -> None:
    agent = _load_agent(mock=True)

    ev = agent._dispatch({"cmd": "catalog", "view": "library"})
    assert ev["type"] == "done"
    assert ev["cmd"] == "catalog"
    assert isinstance(ev["items"], list)
    assert len(ev["items"]) == 2


def test_catalog_live_binding_error_code() -> None:
    agent = _load_agent(mock=True)
    original_items = list(agent.MOCK_CATALOG_ITEMS)
    agent.MOCK_CATALOG_ITEMS = [
        {
            "asset_id": "A1",
            "filename": "IMG_1.HEIC",
            "media_kind": "live",
            "live_pair_id": "",
            "capture_at": "2024-01-01T12:00:00Z",
            "added_at": "2024-01-02T12:00:00Z",
            "parts": ["still", "mov"],
        }
    ]
    try:
        ev = agent._dispatch({"cmd": "catalog", "view": "library"})
    finally:
        agent.MOCK_CATALOG_ITEMS = original_items
    assert ev["type"] == "error"
    assert ev["cmd"] == "catalog"
    assert ev["code"] == "live_bind_missing"


def test_catalog_library_sort_missing_returns_catalog_sort_missing() -> None:
    agent = _load_agent(mock=True)
    original_items = list(agent.MOCK_CATALOG_ITEMS)
    agent.MOCK_CATALOG_ITEMS = [
        {
            "asset_id": "A1",
            "filename": "IMG_1.HEIC",
            "media_kind": "live",
            "live_pair_id": "L1",
            "capture_at": "",
            "added_at": "2024-01-02T12:00:00Z",
            "parts": ["still", "mov"],
        }
    ]
    try:
        ev = agent._dispatch({"cmd": "catalog", "view": "library"})
    finally:
        agent.MOCK_CATALOG_ITEMS = original_items
    assert ev["type"] == "error"
    assert ev["cmd"] == "catalog"
    assert ev["code"] == "catalog_sort_missing"


def test_catalog_recents_sort_missing_returns_catalog_sort_missing() -> None:
    agent = _load_agent(mock=True)
    original_items = list(agent.MOCK_CATALOG_ITEMS)
    agent.MOCK_CATALOG_ITEMS = [
        {
            "asset_id": "A1",
            "filename": "IMG_1.HEIC",
            "media_kind": "live",
            "live_pair_id": "L1",
            "capture_at": "2024-01-01T12:00:00Z",
            "added_at": None,
            "parts": ["still", "mov"],
        }
    ]
    try:
        ev = agent._dispatch({"cmd": "catalog", "view": "recents"})
    finally:
        agent.MOCK_CATALOG_ITEMS = original_items
    assert ev["type"] == "error"
    assert ev["cmd"] == "catalog"
    assert ev["code"] == "catalog_sort_missing"


def test_invalid_catalog_view_returns_invalid_request() -> None:
    agent = _load_agent(mock=True)
    ev = agent._dispatch({"cmd": "catalog", "view": "wrong"})
    assert ev["type"] == "error"
    assert ev["cmd"] == "catalog"
    assert ev["code"] == "invalid_request"


def test_non_mock_requires_explicit_auth_before_catalog_download() -> None:
    agent = _load_agent(mock=False)
    catalog_ev = agent._dispatch({"cmd": "catalog", "view": "library"})
    download_ev = agent._dispatch(
        {"cmd": "download", "asset_id": "A1", "part": "still", "dest_path": "out/IMG_1.HEIC"}
    )
    assert catalog_ev["code"] == "auth_failed"
    assert download_ev["code"] == "auth_failed"


def test_non_mock_auth_validates_required_fields_without_network() -> None:
    agent = _load_agent(mock=False)
    auth_ev = agent._dispatch({"cmd": "auth", "apple_id": "", "password": "", "session_dir": ""})
    assert auth_ev["code"] == "invalid_request"
