"""SharedSync contributors desiredKeys 补丁与 zone 判定."""

from __future__ import annotations

import ipdPhotos as ipd_photos


def test_is_shared_sync_zone() -> None:
    assert ipd_photos.is_shared_sync_zone({"zoneName": "SharedSync-ABC"})
    assert not ipd_photos.is_shared_sync_zone({"zoneName": "PrimarySync"})


def test_lookup_desired_keys_includes_contributors_for_shared_sync() -> None:
    keys = ipd_photos.lookup_desired_keys_for_zone({"zoneName": "SharedSync-X"})
    assert "contributors" in keys
    assert "contributedBy" in keys
    primary = ipd_photos.lookup_desired_keys_for_zone({"zoneName": "PrimarySync"})
    assert "contributors" not in primary