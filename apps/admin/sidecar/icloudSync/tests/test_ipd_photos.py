"""ipdPhotos 适配层单测（mock PhotoAsset + 枚举，不触网、不依赖 vendor 全量 import）。"""

from __future__ import annotations

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
