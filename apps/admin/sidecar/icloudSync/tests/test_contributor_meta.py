"""contributors / cloudkit user recordName 解析单测。"""

from __future__ import annotations

from typing import Any

import ipdPhotos as ipd_photos


def _record(fields: dict[str, Any]) -> dict[str, Any]:
    return {"fields": {k: {"value": v} for k, v in fields.items()}}


def test_contributed_by_from_master_contributors_list() -> None:
    photo = type("P", (), {})()
    photo._master_record = _record(  # noqa: SLF001
        {
            "contributors": [
                {"recordName": "__defaultOwner__"},
                {"recordName": "_abc123def"},
            ]
        }
    )
    photo._asset_record = None  # noqa: SLF001
    assert ipd_photos.contributed_by_from_photo(photo) == "__defaultOwner__"


def test_contributed_by_from_contributed_by_single_ref() -> None:
    photo = type("P", (), {})()
    photo._asset_record = _record(  # noqa: SLF001
        {"contributedBy": {"recordName": "_user456"}}
    )
    assert ipd_photos.contributed_by_from_photo(photo) == "_user456"