"""Pure-unit tests for the design-JSON validator (no DB).

The validator is the backend's last gate on the download → edit → upload-back
loop; these tests pin its contract: block whitelist (recursive, zones
included), event-owned root props stripped, page slugs sane, and tolerance
for both file shapes (designer export and data/site.json snapshot).
"""

import pytest

from app.core.errors import ApiError
from app.services.site_design import (
    ALLOWED_BLOCKS,
    collect_media_ids,
    validate_design,
)


def _design(**overrides):
    base = {
        "zoustec_design": 1,
        "puck": {
            "root": {"props": {"theme": "dark", "title": "SHOULD-DROP"}},
            "content": [{"type": "Banner", "props": {"title": "hi"}}],
            "zones": {},
        },
        "pages": [],
        "header": None,
        "footer": None,
    }
    base.update(overrides)
    return base


def test_block_whitelist_matches_frontend_registry():
    # Mirror of siteConfig.components in nextjs-zoustec/lib/site-blocks.jsx —
    # if this fails, one side added/renamed a block without the other.
    assert ALLOWED_BLOCKS == {
        "StatsBand", "TaskStops",
        "Heading", "Paragraph", "TextCard", "Notice", "InfoList", "Places", "HtmlBlock",
        "Banner", "Image", "Button",
        "Columns", "Spacer", "Divider",
        "SiteHeader", "SiteFooter",
    }


def test_valid_design_passes_and_strips_event_owned_props():
    clean = validate_design(_design())
    props = clean["puck"]["root"]["props"]
    assert props["theme"] == "dark"
    assert "title" not in props  # event-owned → stripped
    assert clean["pages"] == []


def test_snapshot_shape_is_unwrapped():
    # data/site.json from an exported project nests the design in event.config.
    snapshot = {"mode": "event", "event": {"config": _design()}, "tasks": []}
    clean = validate_design(snapshot)
    assert clean["puck"]["content"][0]["type"] == "Banner"


def test_unknown_block_rejected_everywhere():
    for place, design in {
        "home": _design(puck={"content": [{"type": "Evil"}], "root": {}}),
        "zone": _design(puck={
            "content": [{"type": "Columns", "props": {}}],
            "zones": {"Columns-1:col-0": [{"type": "Evil"}]},
        }),
        "page": _design(pages=[{"slug": "p", "title": "P",
                                "data": {"content": [{"type": "Evil"}]}}]),
        "header": _design(header={"content": [{"type": "Evil"}]}),
        "nested": _design(puck={
            "content": [{"type": "Columns",
                         "props": {"items": [{"type": "Evil", "props": {}}]}}],
            "root": {},
        }),
    }.items():
        with pytest.raises(ApiError) as e:
            validate_design(design)
        assert e.value.status_code == 422, place
        assert "Evil" in e.value.message, place


def test_malformed_inputs_rejected():
    for bad in [
        None,
        [],
        {"pages": []},                       # no puck
        _design(puck={"content": "nope"}),   # content not a list
        _design(pages=[{"slug": "Bad Slug!", "title": "x", "data": {"content": []}}]),
        _design(pages=[{"slug": "a", "title": "", "data": {"content": []}}]),
        _design(pages=[
            {"slug": "a", "title": "A", "data": {"content": []}},
            {"slug": "a", "title": "B", "data": {"content": []}},  # duplicate
        ]),
    ]:
        with pytest.raises(ApiError):
            validate_design(bad)


def test_hand_written_design_gets_puck_scaffolding():
    # Puck's renderer requires root/zones on every doc and a unique props.id
    # on every block; a hand-edited file omits them — validation must repair,
    # not 500 the site after publish.
    raw = {
        "puck": {"content": [{"type": "Banner", "props": {"title": "hi"}}]},
        "pages": [{"slug": "p", "title": "P",
                   "data": {"content": [{"type": "Heading", "props": {}}]}}],
        "header": {"content": [{"type": "SiteHeader", "props": {}}]},
        "footer": None,
    }
    clean = validate_design(raw)
    assert clean["puck"]["root"] == {"props": {}}
    assert clean["puck"]["zones"] == {}
    assert clean["header"]["root"] == {"props": {}}
    ids = [
        clean["puck"]["content"][0]["props"]["id"],
        clean["pages"][0]["data"]["content"][0]["props"]["id"],
        clean["header"]["content"][0]["props"]["id"],
    ]
    assert all(isinstance(i, str) and i for i in ids)
    assert len(set(ids)) == 3  # unique across the whole design


def test_collect_media_ids_finds_db_urls_recursively():
    design = _design(puck={
        "root": {"props": {"customCss": "body{background:url(/media/db/11111111-2222-3333-4444-555555555555)}"}},
        "content": [{"type": "Image", "props": {"src": "/media/db/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"}}],
    })
    ids = collect_media_ids(validate_design(design))
    assert ids == {
        "11111111-2222-3333-4444-555555555555",
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }
    # Static demo media (/media/foo.glb) is not a DB reference — not collected.
    assert collect_media_ids({"x": "/media/demo.glb"}) == set()
