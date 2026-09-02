"""ipdPhotos 适配层单测（mock PhotoAsset + 枚举，不触网、不依赖 vendor 全量 import）。"""

from __future__ import annotations

import json
from enum import Enum
from typing import Any
from unittest.mock import MagicMock

import ipdPhotos as ipd_photos


class AssetItemType(Enum):
    MOVIE = "movie"
    IMAGE = "image"


class AssetVersionSize(Enum):
    ORIGINAL = "original"


class LivePhotoVersionSize(Enum):
    ORIGINAL = "original"


class RawTreatmentPolicy(Enum):
    AS_IS = "as-is"


ipd_photos._IPD_TYPES = (  # type: ignore[misc]
    AssetItemType,
    AssetVersionSize,
    LivePhotoVersionSize,
    RawTreatmentPolicy,
)


class _FakeVersion:
    def __init__(self, url: str) -> None:
        self.url = url
        self.size = 123
        self.checksum = b"\x00" * 20


class _FakeResponse:
    ok = True

    @staticmethod
    def iter_content(chunk_size: int = 128) -> Any:
        yield b"fake-bytes"


class _FakePhoto:
    def __init__(
        self,
        *,
        item_type: AssetItemType,
        versions: dict[Any, _FakeVersion],
        asset_id: str = "ASSET-1",
    ) -> None:
        self._master_record = {"recordName": asset_id, "fields": {}}
        self._asset_record = {"fields": {}}
        self._item_type = item_type
        self._versions = versions
        self._id = asset_id

    @property
    def id(self) -> str:
        return self._id

    @property
    def item_type(self) -> AssetItemType:
        return self._item_type

    @property
    def versions(self) -> dict[Any, _FakeVersion]:
        return self._versions

    def versions_with_raw_policy(self, raw_policy: RawTreatmentPolicy) -> dict[Any, _FakeVersion]:
        assert raw_policy == RawTreatmentPolicy.AS_IS
        return self._versions

    def download(self, session: Any, url: str, start: int = 0) -> _FakeResponse:
        assert session is not None
        assert url
        return _FakeResponse()


def test_ipd_media_kind_live() -> None:
    photo = _FakePhoto(
        item_type=AssetItemType.IMAGE,
        versions={
            AssetVersionSize.ORIGINAL: _FakeVersion("https://still"),
            LivePhotoVersionSize.ORIGINAL: _FakeVersion("https://mov"),
        },
    )
    kind, pair = ipd_photos.ipd_media_kind(photo)
    assert kind == "live"
    assert pair == "ASSET-1"


def test_ipd_media_kind_video() -> None:
    photo = _FakePhoto(
        item_type=AssetItemType.MOVIE,
        versions={AssetVersionSize.ORIGINAL: _FakeVersion("https://video")},
    )
    kind, pair = ipd_photos.ipd_media_kind(photo)
    assert kind == "video"
    assert pair is None


def test_ipd_download_still_and_mov() -> None:
    api = MagicMock()
    api.photos.session = MagicMock()
    api.photos.session.get.return_value = _FakeResponse()
    photo = _FakePhoto(
        item_type=AssetItemType.IMAGE,
        versions={
            AssetVersionSize.ORIGINAL: _FakeVersion("https://still"),
            LivePhotoVersionSize.ORIGINAL: _FakeVersion("https://mov"),
        },
    )
    still = ipd_photos.ipd_download_response(api, photo, "still")
    mov = ipd_photos.ipd_download_response(api, photo, "mov")
    assert still.ok is True
    assert mov.ok is True


def test_fetch_photo_assets_by_ids_uses_lookup(monkeypatch) -> None:
    api = MagicMock()
    api.photos.service_endpoint = "https://photos.example/db"
    api.photos.params = {"remapEnums": True}
    api.photos.session = MagicMock()
    api.photos.zone_id = {"zoneName": "PrimarySync"}

    class _Photo:
        def __init__(self, asset_id: str) -> None:
            self._id = asset_id
            self._master_record = {"recordName": asset_id, "fields": {}}
            self._asset_record = {"fields": {}}

        @property
        def id(self) -> str:
            return self._id

    monkeypatch.setattr(
        ipd_photos,
        "_load_photo_asset_class",
        lambda: _Photo,
    )
    monkeypatch.setattr(
        ipd_photos,
        "_lookup_master_records",
        lambda _svc, names: {name: _Photo(name) for name in names},
    )

    found = ipd_photos.fetch_photo_assets_by_ids(api, ["A1", "A2"])
    assert set(found.keys()) == {"A1", "A2"}
    assert found["A1"].id == "A1"


def test_ipd_download_video() -> None:
    api = MagicMock()
    api.photos.session = MagicMock()
    api.photos.session.get.return_value = _FakeResponse()
    photo = _FakePhoto(
        item_type=AssetItemType.MOVIE,
        versions={AssetVersionSize.ORIGINAL: _FakeVersion("https://video")},
    )
    response = ipd_photos.ipd_download_response(api, photo, "video")
    assert response.ok is True


def test_has_real_cpl_asset_record_rejects_stub() -> None:
    stub = _FakePhoto(
        item_type=AssetItemType.IMAGE,
        versions={AssetVersionSize.ORIGINAL: _FakeVersion("https://x")},
    )
    stub._asset_record = {"recordName": "A1-lookup-stub", "recordChangeTag": "1"}  # noqa: SLF001
    assert ipd_photos.has_real_cpl_asset_record(stub) is False

    real = _FakePhoto(
        item_type=AssetItemType.IMAGE,
        versions={AssetVersionSize.ORIGINAL: _FakeVersion("https://x")},
    )
    real._asset_record = {  # noqa: SLF001
        "recordName": "CPLAsset-UUID",
        "recordType": "CPLAsset",
        "recordChangeTag": "abc",
    }
    assert ipd_photos.has_real_cpl_asset_record(real) is True
    meta = ipd_photos.cpl_asset_meta_from_photo(real)
    assert meta["cpl_asset_record_name"] == "CPLAsset-UUID"
    assert meta["cpl_asset_change_tag"] == "abc"


def test_catalog_location_from_photo_reads_master_fields() -> None:
    photo = _FakePhoto(
        item_type=AssetItemType.IMAGE,
        versions={AssetVersionSize.ORIGINAL: _FakeVersion("https://x")},
    )
    photo._master_record = {  # noqa: SLF001
        "recordName": "A1",
        "fields": {
            "locationLatitude": {"value": 31.23},
            "locationLongitude": {"value": 121.47},
        },
    }
    lat, lng = ipd_photos.catalog_location_from_photo(photo)
    assert lat == 31.23
    assert lng == 121.47

    photo._master_record = {"recordName": "A1", "fields": {}}  # noqa: SLF001
    assert ipd_photos.catalog_location_from_photo(photo) == (None, None)


def test_delete_cpl_asset_by_record_posts_is_deleted() -> None:
    api = MagicMock()
    api.photos.service_endpoint = "https://photos.example/db"
    api.photos.params = {"ck": "1"}
    api.photos.zone_id = {"zoneName": "PrimarySync"}
    api.photos.session = MagicMock()
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"records": [{"recordName": "ASSET-A1"}]}
    api.photos.session.post.return_value = response

    ipd_photos.delete_cpl_asset_by_record(api, "ASSET-A1", "tag1")

    assert api.photos.session.post.called
    _args, kwargs = api.photos.session.post.call_args
    assert "records/modify" in _args[0]
    body = json.loads(kwargs["data"])
    assert body["operations"][0]["record"]["fields"]["isDeleted"]["value"] == 1
    assert body["operations"][0]["record"]["recordName"] == "ASSET-A1"
    assert body["operations"][0]["record"]["recordChangeTag"] == "tag1"
