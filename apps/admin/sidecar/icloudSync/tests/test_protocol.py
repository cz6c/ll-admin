"""
Protocol contract tests for icloudSync sidecar.

职责：锁定 Task 1 协议常量与关键事件结构，防止后续实现阶段改坏握手/目录事件格式。
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path

import icloudAuth as ipd_auth


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


def test_logout_clears_auth_state() -> None:
    agent = _load_agent(mock=False)
    agent._AUTH_STATE.api = object()
    agent._AUTH_STATE.apple_id = "a@b.com"
    agent._AUTH_STATE.session_dir = "/tmp/session"
    ev = agent._dispatch({"cmd": "logout"})
    assert ev["type"] == "done"
    assert ev["cmd"] == "logout"
    assert agent._AUTH_STATE.api is None
    assert agent._AUTH_STATE.apple_id == ""


def test_need_2fa_event_includes_delivery_method() -> None:
    from protocol import need_2fa_event

    ev = need_2fa_event("auth", "approve on device", delivery_method="trusted_device")
    assert ev["type"] == "need_2fa"
    assert ev["delivery_method"] == "trusted_device"
    assert ev["detail"] == "approve on device"


def test_is_fully_authenticated_requires_webauth() -> None:
    agent = _load_agent(mock=False)

    class _Cookies:
        def get(self, key: str) -> str | None:
            return "token" if key == "X-APPLE-WEBAUTH-TOKEN" else None

    class _Session:
        data: dict[str, str] = {"session_token": "abc"}

        def __init__(self) -> None:
            self.cookies = _Cookies()

    class _Api:
        session = _Session()

        def get_auth_status(self) -> dict[str, bool]:
            return {
                "authenticated": True,
                "trusted_session": True,
                "requires_2fa": False,
                "requires_2sa": False,
            }

    api = _Api()
    assert agent._is_fully_authenticated(api) is True
    assert agent._mfa_still_required(api) is False


def test_mfa_still_required_when_webauth_missing() -> None:
    agent = _load_agent(mock=False)

    class _Cookies:
        def get(self, _key: str) -> None:
            return None

    class _Session:
        data = {"session_token": "partial"}

        def __init__(self) -> None:
            self.cookies = _Cookies()

    class _Api:
        session = _Session()
        _requires_mfa = False
        requires_2fa = False
        requires_2sa = False

        def get_auth_status(self) -> dict[str, bool]:
            return {
                "authenticated": False,
                "trusted_session": False,
                "requires_2fa": False,
                "requires_2sa": False,
            }

    api = _Api()
    assert agent._is_fully_authenticated(api) is False
    assert agent._mfa_still_required(api) is True


def test_finalize_auth_does_not_rekickoff_mfa_when_already_waiting() -> None:
    agent = _load_agent(mock=False)

    kickoff_calls: list[str] = []

    class _Api:
        requires_2fa = True

        def get_auth_status(self) -> dict[str, bool]:
            return {
                "authenticated": False,
                "trusted_session": False,
                "requires_2fa": True,
                "requires_2sa": False,
            }

        def request_2fa_code(self) -> bool:
            kickoff_calls.append("kickoff")
            return True

        def two_factor_delivery_method(self) -> str:
            return "trusted_device"

    api = _Api()
    agent._AUTH_STATE.api = api
    agent._AUTH_STATE.waiting_2fa = True
    agent._AUTH_STATE.mfa_delivery_kicked_off = True
    agent._AUTH_STATE.delivery_method = "trusted_device"

    ev = agent._finalize_auth_or_need_2fa(api, "auth_probe", kickoff_delivery=False)
    assert ev["type"] == "need_2fa"
    assert ev["delivery_method"] == "trusted_device"
    assert kickoff_calls == []


def test_auth_probe_mock_mode() -> None:
    agent = _load_agent(mock=True)
    ev = agent._dispatch(
        {
            "cmd": "auth_probe",
            "apple_id": "a@b.com",
            "session_dir": "/tmp/session",
        }
    )
    assert ev["type"] == "done"
    assert ev["cmd"] == "auth_probe"


def test_trigger_2fa_push_notification_puts_securitycode() -> None:
    agent = _load_agent(mock=False)

    class _Api:
        last_trigger = False

        def trigger_push_notification(self) -> bool:
            self.last_trigger = True
            return True

    api = _Api()
    assert ipd_auth.kickoff_2fa_push(api) is True
    assert api.last_trigger is True


def test_auth_diagnostic_cmd_returns_report(tmp_path: Path) -> None:
    agent = _load_agent(mock=True)
    agent._reset_auth_state()
    session_dir = str(tmp_path)
    ev = agent._dispatch(
        {
            "cmd": "auth_diagnostic",
            "apple_id": "a@b.com",
            "session_dir": session_dir,
        }
    )
    assert ev["type"] == "done"
    assert ev["cmd"] == "auth_diagnostic"
    diagnostic = ev.get("diagnostic")
    assert isinstance(diagnostic, dict)
    assert diagnostic.get("stage") in ("auth_diagnostic", "auth_probe")
    assert "hints" in diagnostic


def test_auth_error_includes_diagnostic() -> None:
    agent = _load_agent(mock=True)
    agent._AUTH_STATE.apple_id = "user@icloud.com"
    agent._AUTH_STATE.session_dir = "/tmp/fake-session"
    ev = agent._auth_error("auth_2fa", "auth_failed", "验证码无效", stage="auth_2fa")
    assert ev["type"] == "error"
    assert ev["code"] == "auth_failed"
    diagnostic = ev.get("diagnostic")
    assert isinstance(diagnostic, dict)
    assert diagnostic.get("stage") == "auth_2fa"
    assert isinstance(diagnostic.get("hints"), list)


def test_has_webauth_token_accepts_ww_prefix() -> None:
    agent = _load_agent(mock=False)

    class _Cookies:
        def get(self, key: str) -> str | None:
            if key == "X-APPLE-WWEBAUTH-TOKEN":
                return "token-value"
            return None

        def __iter__(self):
            return iter([])

    class _Api:
        session = type("S", (), {"cookies": _Cookies()})()

    assert agent._has_webauth_token(_Api()) is True


def test_submit_2fa_retries_trust_when_validate_ok_but_webauth_missing(monkeypatch) -> None:
    agent = _load_agent(mock=False)
    monkeypatch.setattr(agent, "_WEBAUTH_SETTLE_SEC", 0)
    trust_calls: list[str] = []

    class _Cookies:
        def get(self, _key: str) -> None:
            return None

        def save(self) -> None:
            return None

        def __iter__(self):
            return iter([])

    class _Session:
        data = {"session_token": "tok", "trust_token": "trust"}

        def __init__(self) -> None:
            self.cookies = _Cookies()

    class _Api:
        webauth_ready = False

        def __init__(self) -> None:
            self.session = _Session()
            self.session_data = {"session_token": "tok", "trust_token": "trust"}

        def validate_2fa_code(self, _code: str) -> bool:
            return True

        def get_auth_status(self) -> dict[str, bool]:
            if self.webauth_ready:
                return {
                    "authenticated": True,
                    "trusted_session": True,
                    "requires_2fa": False,
                    "requires_2sa": False,
                }
            return {
                "authenticated": False,
                "trusted_session": False,
                "requires_2fa": False,
                "requires_2sa": False,
            }

        def trust_session(self) -> bool:
            trust_calls.append("trust")
            self.webauth_ready = True
            return True

    api = _Api()
    original_has = agent._has_webauth_token
    agent._has_webauth_token = lambda a: bool(getattr(a, "webauth_ready", False))  # type: ignore[method-assign]
    try:
        assert agent._submit_2fa_code(api, "123456", "unknown") is True
    finally:
        agent._has_webauth_token = original_has  # type: ignore[method-assign]

    assert trust_calls == ["trust"]
    assert agent._AUTH_STATE.last_validate_path == "validate_2fa_code:trust_retry"
