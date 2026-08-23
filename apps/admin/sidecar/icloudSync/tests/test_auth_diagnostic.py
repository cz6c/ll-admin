"""
authDiagnostic 单元测试：hint 推断与落盘（无真实 Apple 请求）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import authDiagnostic as diag  # noqa: E402


def test_mask_apple_id() -> None:
    assert diag.mask_apple_id("1272654068@qq.com") == "12***@qq.com"


def test_infer_webauth_missing_hint() -> None:
    flags = {
        "hasApi": True,
        "hasSessionToken": True,
        "hasWebauthToken": False,
        "hasScnt": True,
        "hasSessionId": True,
        "deliveryMethodCached": "",
        "deliveryMethodLive": "unknown",
        "waiting2fa": True,
        "bridgeSupported": True,
        "bridgeActive": False,
    }
    hints = diag._infer_hints("auth_2fa", "auth_failed", flags, kickoff_path="ipd_put")
    assert "WEBAUTH_MISSING_AFTER_2FA" in hints
    assert "BRIDGE_INACTIVE_AT_VALIDATE" in hints
    assert "KICKOFF_IPD_PUT" in hints


def test_success_snapshot_overwrites_challenge(tmp_path: Path) -> None:
    """成功节点应覆盖先前的 need_2fa 快照，避免排查误判为未完成 2FA。"""
    session_dir = str(tmp_path)
    auth_state = SimpleNamespace(
        waiting_2fa=False,
        mfa_delivery_kicked_off=False,
        delivery_method="",
        last_validate_path="validate_2fa_code",
        last_kickoff_path="ipd_put",
    )

    diag.record_challenge_snapshot(
        stage="auth",
        apple_id="test@icloud.com",
        session_dir=session_dir,
        api=None,
        auth_state=auth_state,
        has_webauth=lambda _api: True,
        session_auth_snapshot=lambda _api: {"authenticated": False, "requires_2fa": True},
        supports_bridge=lambda _api: False,
        delivery_method=lambda _api: "trusted_device",
        kickoff_path="ipd_put",
    )
    assert json.loads((tmp_path / "auth-diagnostic.json").read_text(encoding="utf-8"))["code"] == "need_2fa"

    class _Api:
        session = type("S", (), {"cookies": type("C", (), {"get": lambda _s, _k: None})()})()

    diag.record_success_snapshot(
        stage="auth_2fa",
        message="2FA completed; session ready",
        apple_id="test@icloud.com",
        session_dir=session_dir,
        api=_Api(),
        auth_state=auth_state,
        has_webauth=lambda _api: True,
        session_auth_snapshot=lambda _api: {"authenticated": True, "trusted_session": True},
        supports_bridge=lambda _api: False,
        delivery_method=lambda _api: "trusted_device",
    )
    loaded = json.loads((tmp_path / "auth-diagnostic.json").read_text(encoding="utf-8"))
    assert loaded["code"] == "ok"
    assert loaded["outcome"] == "success"
    assert loaded["stage"] == "auth_2fa"
    assert "AUTH_SESSION_READY" in loaded["hints"]


def test_build_auth_diagnostic_persists(tmp_path: Path) -> None:
    session_dir = str(tmp_path)
    auth_state = SimpleNamespace(
        waiting_2fa=True,
        mfa_delivery_kicked_off=True,
        delivery_method="trusted_device",
        last_validate_path="validate_2fa_code:false",
        last_kickoff_path="put",
    )

    report = diag.build_auth_diagnostic(
        stage="auth_2fa",
        code="auth_failed",
        message="session not fully established",
        apple_id="test@icloud.com",
        session_dir=session_dir,
        api=None,
        auth_state=auth_state,
        has_webauth=lambda _api: False,
        session_auth_snapshot=lambda _api: {"authenticated": False, "requires_2fa": True},
        supports_bridge=lambda _api: True,
        delivery_method=lambda _api: "unknown",
        session_files_present=True,
        validate_path="validate_2fa_code:false",
        kickoff_path="put",
    )

    assert report["appleIdMasked"] == "te***@icloud.com"
    assert "hints" in report
    assert "userActions" in report
    assert len(report["userActions"]) >= 1

    disk = tmp_path / "auth-diagnostic.json"
    assert disk.is_file()
    loaded = json.loads(disk.read_text(encoding="utf-8"))
    assert loaded["stage"] == "auth_2fa"
    assert diag.load_auth_diagnostic_from_disk(session_dir) is not None
