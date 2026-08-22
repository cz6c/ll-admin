"""icloudAuth 适配层单测：stale session / dsInfo KeyError / domain 选择。"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import icloudAuth as ipd_auth
from protocol import CODE_DOMAIN_MISMATCH, CODE_SESSION_EXPIRED


def test_clear_session_artifacts_removes_session_and_cookiejar(tmp_path: Path) -> None:
    apple_id = "1272654068@qq.com"
    cookiejar_path, session_path = ipd_auth.session_artifact_paths(str(tmp_path), apple_id)
    cookiejar_path.write_text("cookies", encoding="utf-8")
    session_path.write_text("{}", encoding="utf-8")

    ipd_auth.clear_session_artifacts(str(tmp_path), apple_id)

    assert not cookiejar_path.exists()
    assert not session_path.exists()


def test_build_api_retries_after_incomplete_auth(tmp_path: Path) -> None:
    apple_id = "user@example.com"
    session_path = ipd_auth.session_artifact_paths(str(tmp_path), apple_id)[1]
    session_path.write_text(json.dumps({"session_token": "stale", "client_id": "cid"}), encoding="utf-8")

    calls = {"count": 0}

    class RetryService:
        def __init__(self, *_args, **_kwargs) -> None:
            calls["count"] += 1
            if calls["count"] == 1:
                raise ipd_auth.IcloudIncompleteAuthError("missing dsInfo")

    with patch.object(ipd_auth, "load_sidecar_service_class", return_value=RetryService):
        result = ipd_auth.build_api(
            apple_id,
            "secret",
            str(tmp_path),
            icloud_domain="com",
        )

    assert calls["count"] == 2
    assert not session_path.exists()
    assert isinstance(result, RetryService)


def test_auth_snapshot_treats_dsinfo_keyerror_as_requires_2fa() -> None:
    api = MagicMock()
    type(api).requires_2fa = property(lambda _self: (_ for _ in ()).throw(KeyError("dsInfo")))
    api.is_trusted_session = False
    api.session = MagicMock()
    api.session.cookies = MagicMock(get=lambda _n: None)

    snap = ipd_auth.auth_snapshot(api)
    assert snap["requires_2fa"] is True
    assert snap["authenticated"] is False


def test_map_api_exception_dsinfo_keyerror_is_session_expired() -> None:
    code = ipd_auth.map_api_exception(KeyError("dsInfo"), is_2fa_required=lambda _e: False)
    assert code == CODE_SESSION_EXPIRED


def test_parse_required_domain_cn() -> None:
    exc = RuntimeError("Apple insists on using iCloud.com.cn for your request. Please use --domain parameter")
    assert ipd_auth.parse_required_domain(exc) == "cn"
    assert ipd_auth.is_domain_mismatch_exception(exc) is True


def test_build_domain_attempt_order_prefers_saved_hint(tmp_path: Path) -> None:
    apple_id = "user@example.com"
    hint = ipd_auth.domain_hint_path(str(tmp_path), apple_id)
    hint.write_text("cn", encoding="utf-8")
    assert ipd_auth.build_domain_attempt_order(str(tmp_path), apple_id) == ["cn", "com"]


def test_build_api_fallback_switches_domain_on_mismatch(tmp_path: Path) -> None:
    apple_id = "user@example.com"
    calls: list[str] = []

    class DomainMismatchError(Exception):
        pass

    class DomainAwareService:
        def __init__(self, domain: str, *_args, **_kwargs) -> None:
            calls.append(domain)
            if domain == "com":
                raise DomainMismatchError(
                    "Apple insists on using iCloud.com.cn for your request. Please use --domain parameter"
                )
            self.domain = domain

    with patch.object(ipd_auth, "load_sidecar_service_class", return_value=DomainAwareService), patch.object(
        ipd_auth,
        "is_domain_mismatch_exception",
        side_effect=lambda exc: isinstance(exc, DomainMismatchError) or ipd_auth.parse_required_domain(exc) is not None,
    ):
        api = ipd_auth.build_api(
            apple_id,
            "secret",
            str(tmp_path),
            allow_domain_fallback=True,
        )

    assert calls == ["com", "cn"]
    assert api.domain == "cn"
    assert ipd_auth.load_domain_hint(str(tmp_path), apple_id) == "cn"


def test_build_api_explicit_domain_raises_mismatch_without_fallback(tmp_path: Path) -> None:
    apple_id = "user@example.com"

    class DomainMismatchError(Exception):
        pass

    class DomainAwareService:
        def __init__(self, domain: str, *_args, **_kwargs) -> None:
            if domain == "com":
                raise DomainMismatchError(
                    "Apple insists on using iCloud.com.cn for your request. Please use --domain parameter"
                )

    with patch.object(ipd_auth, "load_sidecar_service_class", return_value=DomainAwareService), patch.object(
        ipd_auth,
        "is_domain_mismatch_exception",
        side_effect=lambda exc: isinstance(exc, DomainMismatchError),
    ):
        try:
            ipd_auth.build_api(apple_id, "secret", str(tmp_path), icloud_domain="com")
        except ipd_auth.IcloudDomainMismatchError as exc:
            assert exc.selected == "com"
            assert exc.required == "cn"
        else:
            raise AssertionError("expected IcloudDomainMismatchError")


def test_map_api_exception_domain_mismatch() -> None:
    exc = ipd_auth.IcloudDomainMismatchError("com", "cn")
    code = ipd_auth.map_api_exception(exc, is_2fa_required=lambda _e: False)
    assert code == CODE_DOMAIN_MISMATCH
