"""Server-side gate for the designer-JSON round-trip (download → edit → upload).

The drag-drop designer's client validates imports too, but anything can call
the admin API directly, so this module is the LAST line of defense: only known
block types, only design-owned keys, only media this tenant can read.

The design JSON is pure DATA — block type names and props. It never contains
code; the renderer lives in nextjs-zoustec/lib/site-blocks.jsx on both the
platform and the shared local viewer (site-preview/). ALLOWED_BLOCKS mirrors
siteConfig.components there — update BOTH together when adding a block type
(tests/nodb/test_site_design.py pins the list).
"""

import json
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import Event, MediaAsset

# Mirror of siteConfig.components in nextjs-zoustec/lib/site-blocks.jsx.
ALLOWED_BLOCKS = frozenset(
    {
        # live (auto-synced event data)
        "StatsBand",
        "TaskStops",
        # content
        "Heading",
        "Paragraph",
        "TextCard",
        "Notice",
        "InfoList",
        "Places",
        "HtmlBlock",
        # media & buttons
        "Banner",
        "Image",
        "Button",
        # layout
        "Columns",
        "Spacer",
        "Divider",
        # site-wide chrome
        "SiteHeader",
        "SiteFooter",
    }
)

# Root props owned by the event record — never accepted from an upload; the
# platform re-injects the event's own values (same rule as the designer's
# client-side import).
EVENT_OWNED_ROOT_PROPS = (
    "title",
    "slug",
    "description",
    "heroImage",
    "rewardName",
    "rewardThreshold",
)

MAX_DESIGN_BYTES = 1_000_000
PAGE_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MEDIA_DB_RE = re.compile(r"/media/db/([0-9a-fA-F-]{36})")


def _bad(message: str) -> ApiError:
    return ApiError(422, "design_invalid", message)


def _walk_blocks(items, where: str) -> None:
    """Reject any block whose type is not in the whitelist, recursively:
    Columns nest children as arrays inside props, and Puck keeps drop-zone
    content under a separate `zones` map handled by the caller.

    HtmlBlock content is SANITIZED here (in place) — this walk runs on every
    write path (design upload, HTML upload, event PATCH), so user-authored
    HTML can never reach the DB unsanitized regardless of entry point."""
    if items in (None, []):
        return
    if not isinstance(items, list):
        raise _bad(f"設計格式不符：{where} 必須是區塊陣列。")
    for block in items:
        if not isinstance(block, dict) or not isinstance(block.get("type"), str):
            raise _bad(f"設計格式不符：{where} 內含無效區塊。")
        btype = block["type"]
        if btype not in ALLOWED_BLOCKS:
            raise _bad(f"未知區塊類型：{btype}（{where}）")
        props = block.get("props")
        if props is not None and not isinstance(props, dict):
            raise _bad(f"設計格式不符：{where} 的 {btype} props 必須是物件。")
        if btype == "HtmlBlock" and props:
            from app.services.html_sanitizer import sanitize_html

            props["html"] = sanitize_html(str(props.get("html") or ""))
        for value in (props or {}).values():
            if isinstance(value, list) and value and isinstance(value[0], dict) and value[0].get("type"):
                _walk_blocks(value, f"{where} > {btype}")


def _walk_doc(doc, where: str) -> None:
    """Validate one Puck document: content list + every drop zone."""
    if doc is None:
        return
    if not isinstance(doc, dict):
        raise _bad(f"設計格式不符：{where} 必須是物件。")
    _walk_blocks(doc.get("content"), where)
    zones = doc.get("zones")
    if zones is not None:
        if not isinstance(zones, dict):
            raise _bad(f"設計格式不符：{where} 的 zones 必須是物件。")
        for zone_key, zone_items in zones.items():
            _walk_blocks(zone_items, f"{where} zones[{zone_key}]")


def _normalize_doc(doc, ids: set, counter: list) -> dict | None:
    """Repair the structure a HAND-WRITTEN design legally omits.

    Puck's renderer hard-requires every doc to carry `root` + `zones` and every
    block a unique `props.id` — the designer always writes them, a dev editing
    JSON by hand usually doesn't. Publishing such a file must not 500 the
    site, so missing scaffolding is filled in rather than rejected."""
    if not isinstance(doc, dict):
        return None

    def stamp(items):
        for block in items or []:
            props = block.setdefault("props", {})
            bid = props.get("id")
            if not isinstance(bid, str) or not bid or bid in ids:
                counter[0] += 1
                bid = f"{block['type']}-{counter[0]}"
                while bid in ids:
                    counter[0] += 1
                    bid = f"{block['type']}-{counter[0]}"
                props["id"] = bid
            ids.add(bid)
            for value in props.values():
                if isinstance(value, list) and value and isinstance(value[0], dict) and value[0].get("type"):
                    stamp(value)

    out = dict(doc)
    root = out.get("root") if isinstance(out.get("root"), dict) else {}
    props = root.get("props") if isinstance(root.get("props"), dict) else {}
    out["root"] = {**root, "props": props}
    out["zones"] = out.get("zones") if isinstance(out.get("zones"), dict) else {}
    out["content"] = out.get("content") or []
    stamp(out["content"])
    for items in out["zones"].values():
        stamp(items)
    return out


def validate_design(raw) -> dict:
    """Accepts a designer JSON export OR the data/site.json snapshot shape and
    returns the cleaned design {puck, pages, header, footer} — design-owned
    keys only, event-owned root props stripped. Raises ApiError(422) on any
    unknown block type or malformed structure."""
    if not isinstance(raw, dict):
        raise _bad("設計檔必須是 JSON 物件。")
    if len(json.dumps(raw)) > MAX_DESIGN_BYTES:
        raise _bad("設計檔過大（上限 1MB）。")

    # Same unwrapping as the designer's import: a full site.json snapshot
    # carries the design under event.config.
    cfg = raw.get("event", {}).get("config") if isinstance(raw.get("event"), dict) else None
    cfg = cfg or raw.get("config") or raw
    if not isinstance(cfg, dict):
        raise _bad("設計檔格式不符。")

    puck = cfg.get("puck")
    if not isinstance(puck, dict) or not isinstance(puck.get("content"), list):
        raise _bad("設計檔格式不符 — 需要含 puck.content 的設計 JSON。")
    _walk_doc(puck, "首頁")

    pages = cfg.get("pages") or []
    if not isinstance(pages, list):
        raise _bad("設計格式不符：pages 必須是陣列。")
    clean_pages = []
    seen_slugs = set()
    for page in pages:
        if not isinstance(page, dict):
            raise _bad("設計格式不符：pages 內含無效項目。")
        slug = page.get("slug")
        if not isinstance(slug, str) or not PAGE_SLUG_RE.match(slug):
            raise _bad(f"子頁網址代稱無效：{slug!r}（僅限小寫英數與連字號）。")
        if slug in seen_slugs:
            raise _bad(f"子頁網址代稱重複：{slug}")
        seen_slugs.add(slug)
        title = page.get("title")
        if not isinstance(title, str) or not title.strip() or len(title) > 120:
            raise _bad(f"子頁「{slug}」缺少有效標題。")
        _walk_doc(page.get("data"), f"子頁 {slug}")
        clean_pages.append(
            {
                "slug": slug,
                "title": title,
                "nav": page.get("nav") is not False,
                "data": page.get("data") or {"content": []},
            }
        )

    header = cfg.get("header")
    footer = cfg.get("footer")
    _walk_doc(header, "頁首")
    _walk_doc(footer, "頁尾")

    # Normalize AFTER validation: fill the scaffolding Puck requires but
    # hand-written files omit (root/zones/unique block ids).
    ids: set = set()
    counter = [0]
    norm_puck = _normalize_doc(puck, ids, counter)
    for page in clean_pages:
        page["data"] = _normalize_doc(page["data"], ids, counter) or {"root": {"props": {}}, "content": [], "zones": {}}
    norm_header = _normalize_doc(header, ids, counter)
    norm_footer = _normalize_doc(footer, ids, counter)

    root_props = norm_puck["root"]["props"]
    norm_puck["root"]["props"] = {
        k: v for k, v in root_props.items() if k not in EVENT_OWNED_ROOT_PROPS
    }

    return {
        "puck": norm_puck,
        "pages": clean_pages,
        "header": norm_header,
        "footer": norm_footer,
    }


def collect_media_ids(design: dict) -> set[str]:
    """Every /media/db/{id} referenced anywhere in the design's strings."""
    found: set[str] = set()

    def visit(node) -> None:
        if isinstance(node, str):
            for m in MEDIA_DB_RE.finditer(node):
                found.add(m.group(1).lower())
        elif isinstance(node, dict):
            for v in node.values():
                visit(v)
        elif isinstance(node, list):
            for v in node:
                visit(v)

    visit(design)
    return found


async def check_media_ownership(session: AsyncSession, design: dict) -> None:
    """Reject a design that references media this tenant cannot read.

    The session is tenant-scoped (RLS), so a sibling tenant's media id simply
    does not come back from the query — indistinguishable from a deleted one,
    which is exactly the answer we want to give."""
    ids = collect_media_ids(design)
    if not ids:
        return
    try:
        wanted = {uuid.UUID(i) for i in ids}
    except ValueError:
        raise _bad("設計內含無效的媒體網址。")
    rows = (
        await session.execute(select(MediaAsset.id).where(MediaAsset.id.in_(wanted)))
    ).scalars().all()
    missing = wanted - set(rows)
    if missing:
        raise _bad(
            "設計內引用了不存在或不屬於此租戶的媒體，請重新上傳圖片："
            + ", ".join(sorted(str(m) for m in missing))
        )


def apply_design(config: dict, event: Event, design: dict) -> dict:
    """Merge a validated design into an event config dict (publish & preview
    share this so the two can never disagree). Re-injects the event-owned root
    props the same way the designer's save does."""
    puck = dict(design.get("puck") or {})
    root = dict(puck.get("root") or {})
    props = dict(root.get("props") or {})
    props.update(
        {
            "title": event.name,
            "slug": event.slug,
            "description": event.description or "",
            "heroImage": (config or {}).get("heroImage") or "",
            "rewardName": event.reward_name or "",
            "rewardThreshold": event.reward_threshold or 1,
        }
    )
    root["props"] = props
    puck["root"] = root
    return {
        **(config or {}),
        "puck": puck,
        "pages": design.get("pages") or [],
        "header": design.get("header"),
        "footer": design.get("footer"),
        "puckVersion": 2,
    }
