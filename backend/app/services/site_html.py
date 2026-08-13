"""HTML round-trip for customer site designs (download HTML → edit → upload).

The END USER's editing surface is plain HTML: they download a zip of .html
files, open them in any editor (or double-click to view in a browser), change
text, delete/reorder sections, write NEW markup of their own — then upload the
files back. This module is the two-way bridge:

    design JSON --design_to_site_files-->  index.html, {page}.html, style.css
    uploaded files --site_files_to_design--> design JSON  (→ normal
                                       validate → draft → preview → publish)

Contract encoded here:
- Every design block is one annotated element (`data-zb="TextCard"`). Its
  machine props ride in `data-zprops`; its human-editable text lives as REAL
  text in semantic child tags, so editing the HTML edits the design.
- The file looks like the WHOLE site: hero, nav (local links between the
  files), footer, and live-data previews (stats, task stops) are rendered in
  too — but marked `data-z-skip`, so they are display-only and ignored on
  import (that content belongs to 活動設定 / live data, not the design).
- Markup WITHOUT `data-zb` is the user's own: it becomes an HtmlBlock, run
  through a strict sanitizer (nh3/ammonia — scripts, event handlers and
  dangerous URLs stripped). This is what makes free-form HTML safe to accept.
- Media URLs are absolutized on export (so images render from file://) and
  relativized back to /media/… on import.
- The exported <style> is a simplified viewing skin, NOT the real renderer
  output; the pixel-true look is the ?draft= preview after upload. style.css
  (site custom CSS) does round-trip.
"""

import html as html_mod
import json
import re

import nh3
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from app.core.errors import ApiError

PAGE_FILE_RE = re.compile(r"^([a-z0-9][a-z0-9-]{0,63})\.html$")
_MEDIA_ABS_RE = re.compile(r"https?://[^/\s\"']+(/media/)")

# ---------------------------------------------------------------- sanitizer

_ALLOWED_TAGS = {
    "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption",
    "code", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "li",
    "mark", "ol", "p", "pre", "q", "s", "section", "small", "span", "strong",
    "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time",
    "u", "ul",
}
_ALLOWED_ATTRS = {
    "*": {"class", "style", "title", "dir", "lang"},
    "a": {"href", "target"},  # rel is managed by nh3's link_rel (noopener…)
    "img": {"src", "alt", "width", "height", "loading"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "time": {"datetime"},
}


def sanitize_html(raw: str) -> str:
    """User-authored HTML → safe HTML. Strips script/style tags, event
    handlers, javascript: URLs and any tag/attr outside the allowlist —
    the reason free-form HTML can be accepted at all."""
    if not raw:
        return ""
    return nh3.clean(raw, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS)


# ---------------------------------------------------------------- serialize

def _esc(text) -> str:
    return html_mod.escape(str(text or ""), quote=False)


def _attr(text) -> str:
    return html_mod.escape(str(text or ""), quote=True)


def _zprops(props: dict, *skip: str) -> str:
    """Machine props as an HTML attribute. Keeps id (zones/publish diffs stay
    stable) and everything not extracted into editable child elements."""
    keep = {k: v for k, v in (props or {}).items() if k not in skip}
    return html_mod.escape(json.dumps(keep, ensure_ascii=False, separators=(",", ":")), quote=True)


class _Ctx:
    """Export context: live-data previews + media absolutizing."""

    def __init__(self, site: dict | None, media_base: str):
        site = site or {}
        self.media_base = (media_base or "").rstrip("/")
        self.description = site.get("description") or ""
        self.hero_image = site.get("hero_image") or ""
        self.tenant_name = site.get("tenant_name") or ""
        self.reward_name = site.get("reward_name") or ""
        self.reward_threshold = site.get("reward_threshold") or 1
        self.tasks = site.get("tasks") or []

    def abs_url(self, url: str) -> str:
        if self.media_base and isinstance(url, str) and url.startswith("/media/"):
            return f"{self.media_base}{url}"
        return url or ""


def _serialize_children(items, depth: int, ctx: _Ctx) -> str:
    return "\n".join(_serialize_block(b, depth, ctx) for b in (items or []))


def _stats_preview(ctx: _Ctx, pad: str) -> str:
    return (
        f'{pad}  <div class="z-stats" data-z-skip>\n'
        f'{pad}    <div><b>{len(ctx.tasks)}</b><span>任務停靠點</span></div>\n'
        f'{pad}    <div><b>{ctx.reward_threshold}</b><span>集章門檻</span></div>\n'
        f'{pad}    <div><b>{_esc(ctx.reward_name) or "—"}</b><span>獎勵</span></div>\n'
        f"{pad}  </div>"
    )


def _tasks_preview(ctx: _Ctx, pad: str) -> str:
    lis = "\n".join(f"{pad}      <li>{_esc(t)}</li>" for t in ctx.tasks) or f"{pad}      <li>（尚無任務）</li>"
    return f'{pad}  <ul class="z-tasks" data-z-skip>\n{lis}\n{pad}    </ul>'


def _serialize_block(b: dict, depth: int, ctx: _Ctx) -> str:
    t = b.get("type")
    p = b.get("props") or {}
    pad = "  " * depth

    if t == "Heading":
        level = p.get("level") if p.get("level") in ("h1", "h2", "h3", "h4") else "h2"
        return f'{pad}<{level} data-zb="Heading" data-zprops="{_zprops(p, "text", "level")}">{_esc(p.get("text"))}</{level}>'
    if t == "Paragraph":
        return f'{pad}<p data-zb="Paragraph" data-zprops="{_zprops(p, "text")}">{_esc(p.get("text"))}</p>'
    if t == "TextCard":
        return (
            f'{pad}<section data-zb="TextCard" data-zprops="{_zprops(p, "title", "text")}">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <p>{_esc(p.get('text'))}</p>\n"
            f"{pad}</section>"
        )
    if t == "Notice":
        lis = "\n".join(f"{pad}    <li>{_esc(it.get('text'))}</li>" for it in p.get("items") or [])
        return (
            f'{pad}<aside data-zb="Notice" data-zprops="{_zprops(p, "title", "items")}">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <ul>\n{lis}\n{pad}  </ul>\n"
            f"{pad}</aside>"
        )
    if t == "InfoList":
        rows = "\n".join(
            f"{pad}    <dt>{_esc(it.get('label'))}</dt><dd>{_esc(it.get('value'))}</dd>"
            for it in p.get("items") or []
        )
        return (
            f'{pad}<section data-zb="InfoList" data-zprops="{_zprops(p, "title", "items")}">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <dl>\n{rows}\n{pad}  </dl>\n"
            f"{pad}</section>"
        )
    if t == "Places":
        lis = "\n".join(
            f"{pad}    <li><strong>{_esc(it.get('name'))}</strong><span>{_esc(it.get('description'))}</span></li>"
            for it in p.get("items") or []
        )
        return (
            f'{pad}<section data-zb="Places" data-zprops="{_zprops(p, "title", "items")}">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <ul>\n{lis}\n{pad}  </ul>\n"
            f"{pad}</section>"
        )
    if t == "Banner":
        img = f'{pad}  <img src="{_attr(ctx.abs_url(p.get("image")))}" alt="">\n' if p.get("image") else ""
        cta = (
            f'{pad}  <a class="cta" href="{_attr(p.get("ctaHref"))}">{_esc(p.get("ctaLabel"))}</a>\n'
            if p.get("ctaLabel") else ""
        )
        return (
            f'{pad}<section data-zb="Banner" data-zprops="{_zprops(p, "title", "subtitle", "image", "ctaLabel", "ctaHref")}">\n'
            f"{img}"
            f"{pad}  <h2>{_esc(p.get('title'))}</h2>\n"
            f"{pad}  <p>{_esc(p.get('subtitle'))}</p>\n"
            f"{cta}"
            f"{pad}</section>"
        )
    if t == "Image":
        return (
            f'{pad}<figure data-zb="Image" data-zprops="{_zprops(p, "url", "alt")}">\n'
            f'{pad}  <img src="{_attr(ctx.abs_url(p.get("url")))}" alt="{_attr(p.get("alt"))}">\n'
            f"{pad}</figure>"
        )
    if t == "Button":
        return (
            f'{pad}<p data-zb="Button" data-zprops="{_zprops(p, "label", "href")}">'
            f'<a class="btn" href="{_attr(p.get("href"))}">{_esc(p.get("label"))}</a></p>'
        )
    if t == "Columns":
        left = _serialize_children(p.get("left"), depth + 2, ctx)
        right = _serialize_children(p.get("right"), depth + 2, ctx)
        return (
            f'{pad}<div data-zb="Columns" data-zprops="{_zprops(p, "left", "right")}">\n'
            f'{pad}  <div data-zcol="left">\n{left}\n{pad}  </div>\n'
            f'{pad}  <div data-zcol="right">\n{right}\n{pad}  </div>\n'
            f"{pad}</div>"
        )
    if t == "Divider":
        return f'{pad}<hr data-zb="Divider" data-zprops="{_zprops(p)}">'
    if t == "Spacer":
        return f'{pad}<div data-zb="Spacer" data-zprops="{_zprops(p)}"></div>'
    if t == "HtmlBlock":
        return (
            f'{pad}<div data-zb="HtmlBlock" data-zprops="{_zprops(p, "html")}">\n'
            f"{p.get('html') or ''}\n{pad}</div>"
        )
    if t == "StatsBand":
        return (
            f'{pad}<div data-zb="StatsBand" data-zprops="{_zprops(p)}" class="z-live">\n'
            f'{pad}  <p class="z-live-tag">⚙ 活動數據 — 平台自動同步（此處僅為預覽，上傳時以下內容會被忽略）</p>\n'
            f"{_stats_preview(ctx, pad)}\n"
            f"{pad}</div>"
        )
    if t == "TaskStops":
        return (
            f'{pad}<div data-zb="TaskStops" data-zprops="{_zprops(p)}" class="z-live">\n'
            f'{pad}  <p class="z-live-tag">⚙ {_esc(p.get("title") or "任務停靠點")} — 平台自動同步（預覽，上傳時忽略）</p>\n'
            f"{_tasks_preview(ctx, pad)}\n"
            f"{pad}</div>"
        )
    # Chrome / any other platform block: placeholder body, props verbatim.
    return (
        f'{pad}<div data-zb="{_esc(t)}" data-zprops="{_zprops(p)}" class="z-live">\n'
        f"{pad}  <p>⚙ {_esc(t)} — 此區塊由平台自動渲染（請勿在此編輯，內容上傳時會被忽略）</p>\n"
        f"{pad}</div>"
    )


_VIEW_CSS = """
:root { --brand: %(brand)s; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', sans-serif;
       color: #1c2530; background: #f6f7f9; line-height: 1.65; }
main[data-zoustec-content] { max-width: 760px; margin: 0 auto; padding: 24px 18px 60px; }
h1,h2,h3 { line-height: 1.3; }
img { max-width: 100%%; border-radius: 10px; }
section, aside, figure, [data-zb] { margin: 18px 0; }
.z-nav { display: flex; align-items: center; gap: 14px; padding: 12px 20px; background: var(--brand);
  color: #fff; position: sticky; top: 0; }
.z-nav b { margin-right: auto; }
.z-nav a { color: #fff; text-decoration: none; font-size: 14px; opacity: .92; }
.z-nav .z-join { background: #fff; color: var(--brand); border-radius: 999px; padding: 6px 16px; font-weight: 700; }
.z-hero { background: #253244 center/cover no-repeat; color: #fff; padding: 72px 24px; text-align: left; margin: 0; }
.z-hero .z-hero-inner { max-width: 760px; margin: 0 auto; }
.z-hero h1 { margin: 0 0 10px; font-size: 34px; }
.z-hero p { margin: 0 0 18px; opacity: .92; max-width: 46em; }
.z-hero .cta { margin-right: 10px; }
.z-note { max-width: 760px; margin: 10px auto 0; padding: 0 18px; font-size: 12px; color: #8a95a1; }
[data-zb="TextCard"], [data-zb="InfoList"], [data-zb="Places"] {
  background: #fff; border: 1px solid #e3e7ec; border-radius: 12px; padding: 16px 18px; }
[data-zb="Notice"] { background: #fff8ec; border: 1px solid #f0dfc0; border-radius: 12px; padding: 14px 18px; }
[data-zb="Banner"] { background: #202b38; color: #fff; border-radius: 14px; padding: 40px 24px; text-align: center; overflow: hidden; }
[data-zb="Banner"] .cta, .btn, .z-hero .cta { display: inline-block; background: var(--brand); color: #fff;
  padding: 10px 22px; border-radius: 999px; text-decoration: none; font-weight: 600; }
[data-zb="Columns"] { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
[data-zb="Columns"] > div { min-width: 0; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
dt { color: #66727f; } dd { margin: 0; text-align: right; }
[data-zb="Places"] li, [data-zb="Notice"] li { margin: 6px 0; }
[data-zb="Places"] strong { display: block; }
hr { border: 0; border-top: 1px solid #dde2e8; }
.z-live { background: #f2f5f8; border: 1px dashed #b7c0cb; border-radius: 12px; padding: 10px 16px 14px; }
.z-live-tag { color: #66727f; font-size: 13px; margin: 2px 0 10px; }
.z-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.z-stats > div { background: #fff; border: 1px solid #e3e7ec; border-radius: 10px; padding: 10px 14px; }
.z-stats b { display: block; font-size: 20px; }
.z-stats span { font-size: 12px; color: #66727f; }
.z-tasks { list-style: none; margin: 0; padding: 0; }
.z-tasks li { background: #fff; border: 1px solid #e3e7ec; border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
.z-footer { background: #1d2733; color: #c7d0da; padding: 26px 20px; margin-top: 40px; font-size: 14px; }
.z-footer .z-footer-inner { max-width: 760px; margin: 0 auto; }
[data-zb]:hover { outline: 1px dashed #d0a; outline-offset: 3px; }
@media (max-width: 620px) { [data-zb="Columns"], .z-stats { grid-template-columns: 1fr; } }
"""

_GUIDE = """<!--
  ══════════════════════════════════════════════════════════════
  Zoustec 活動網站 — HTML 編輯檔
  · 直接修改文字即可（h2/p/li 內的字都會回到網站）
  · 可整段刪除、上下搬移各個 <section>
  · 可自由撰寫自己的 HTML 段落（不需要任何 data- 屬性；
    script 與事件屬性會在上傳時被系統移除）
  · 淺灰虛線框（頁首/主視覺/數據/任務/頁尾）由平台自動渲染，
    僅供預覽 — 修改那些內容請至平台的 活動設定
  · data-zb / data-zprops 屬性是系統識別用 — 保留它，
    區塊回到平台後才能繼續在設計器中編輯
  · style.css = 全站自訂 CSS，會一併上傳
  · 上傳後請用平台給的預覽連結確認正式外觀，再按發佈
  ══════════════════════════════════════════════════════════════
-->"""


def _nav_html(event_name: str, nav_items: list[tuple[str, str]], current: str) -> str:
    links = "\n".join(
        f'  <a href="{_attr(fname)}"{" style=\"text-decoration:underline\"" if fname == current else ""}>{_esc(title)}</a>'
        for fname, title in nav_items
    )
    return (
        f'<nav class="z-nav" data-z-skip>\n'
        f"  <b>{_esc(event_name)}</b>\n{links}\n"
        f'  <span class="z-join">開始旅程</span>\n'
        f"</nav>"
    )


def _hero_html(event_name: str, ctx: _Ctx) -> str:
    bg = f' style="background-image:linear-gradient(rgba(15,23,32,.55),rgba(15,23,32,.7)),url(\'{_attr(ctx.abs_url(ctx.hero_image))}\')"' if ctx.hero_image else ""
    return (
        f'<header class="z-hero" data-z-skip{bg}>\n'
        f'  <div class="z-hero-inner">\n'
        f"    <h1>{_esc(event_name)}</h1>\n"
        f"    <p>{_esc(ctx.description)}</p>\n"
        f'    <span class="cta">開始旅程</span><span class="cta" style="background:transparent;border:1px solid #fff">查看地圖</span>\n'
        f"  </div>\n"
        f"</header>\n"
        f'<p class="z-note" data-z-skip>↑ 主視覺（標題／介紹／封面圖）來自平台的「活動設定」— 在此修改不會生效</p>'
    )


def _footer_html(ctx: _Ctx) -> str:
    return (
        f'<footer class="z-footer" data-z-skip>\n'
        f'  <div class="z-footer-inner">{_esc(ctx.tenant_name)} · Powered by Zoustec（頁尾由平台渲染 — 預覽）</div>\n'
        f"</footer>"
    )


def _page_html(
    title: str, content_html: str, *, theme: str, nav: bool, brand: str,
    event_name: str, nav_items: list[tuple[str, str]], current: str,
    ctx: _Ctx, with_hero: bool,
) -> str:
    hero = f"\n{_hero_html(event_name, ctx)}" if with_hero else ""
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="zoustec-design" content="1">
<meta name="zoustec-theme" content="{_attr(theme)}">
<meta name="zoustec-nav" content="{'show' if nav else 'hide'}">
<title>{_esc(title)}</title>
<style>{_VIEW_CSS % {'brand': brand or '#0e7490'}}</style>
<link rel="stylesheet" href="style.css">
</head>
<body>
{_GUIDE}
{_nav_html(event_name, nav_items, current)}{hero}
<main data-zoustec-content>
{content_html}
</main>
{_footer_html(ctx)}
</body>
</html>
"""


def design_to_site_files(
    cfg: dict,
    *,
    event_name: str,
    brand_color: str | None,
    site: dict | None = None,
    media_base: str = "",
) -> dict[str, str]:
    """Published design → the editable file set handed to the user.

    `site` carries the platform-rendered context (description, hero image,
    tenant name, reward, task names) so the exported file LOOKS like the whole
    site; those parts are stamped data-z-skip and never round-trip."""
    cfg = cfg or {}
    ctx = _Ctx(site, media_base)
    puck = cfg.get("puck") or {}
    root_props = (puck.get("root") or {}).get("props") or {}
    theme = root_props.get("theme") or "default"
    brand = brand_color or "#0e7490"

    pages = [p for p in (cfg.get("pages") or []) if p.get("slug") and p.get("slug") != "index"]
    nav_items = [("index.html", "首頁")] + [
        (f"{p['slug']}.html", p.get("title") or p["slug"]) for p in pages if p.get("nav") is not False
    ]

    files: dict[str, str] = {}
    files["index.html"] = _page_html(
        event_name, _serialize_children(puck.get("content"), 1, ctx),
        theme=theme, nav=True, brand=brand, event_name=event_name,
        nav_items=nav_items, current="index.html", ctx=ctx, with_hero=True,
    )
    for page in pages:
        slug = page.get("slug")
        if not PAGE_FILE_RE.match(f"{slug}.html"):
            continue
        files[f"{slug}.html"] = _page_html(
            page.get("title") or slug,
            _serialize_children((page.get("data") or {}).get("content"), 1, ctx),
            theme=theme, nav=page.get("nav") is not False, brand=brand,
            event_name=event_name, nav_items=nav_items,
            current=f"{slug}.html", ctx=ctx, with_hero=False,
        )
    files["style.css"] = root_props.get("customCss") or "/* 全站自訂 CSS — 會隨上傳套用到網站 */\n"
    return files


# ------------------------------------------------------------------ parse

def _text_of(el: Tag) -> str:
    return el.get_text().strip()


def _first(el: Tag, name: str) -> Tag | None:
    return el.find(name, recursive=True)


def _parse_items(el: Tag, fields: tuple) -> list[dict]:
    items = []
    for li in el.find_all("li"):
        if fields == ("text",):
            items.append({"text": _text_of(li)})
        else:  # Places: <strong>name</strong><span>description</span>
            name_el = li.find("strong")
            name = _text_of(name_el) if name_el else ""
            if name_el:
                name_el.extract()
            items.append({"name": name, "description": _text_of(li)})
    return items


def _parse_block(el: Tag) -> dict:
    t = el.get("data-zb") or ""
    try:
        props = json.loads(el.get("data-zprops") or "{}")
        if not isinstance(props, dict):
            props = {}
    except ValueError:
        props = {}

    if t == "Heading":
        props["text"] = _text_of(el)
        props["level"] = el.name if el.name in ("h1", "h2", "h3", "h4") else "h2"
    elif t == "Paragraph":
        props["text"] = _text_of(el)
    elif t == "TextCard":
        h, p = _first(el, "h3"), _first(el, "p")
        props["title"] = _text_of(h) if h else ""
        props["text"] = _text_of(p) if p else ""
    elif t == "Notice":
        h = _first(el, "h3")
        props["title"] = _text_of(h) if h else ""
        props["items"] = _parse_items(el, ("text",))
    elif t == "InfoList":
        h = _first(el, "h3")
        props["title"] = _text_of(h) if h else ""
        dts, dds = el.find_all("dt"), el.find_all("dd")
        props["items"] = [
            {"label": _text_of(dt), "value": _text_of(dd) if dd is not None else ""}
            for dt, dd in zip(dts, dds + [None] * (len(dts) - len(dds)))
        ]
    elif t == "Places":
        h = _first(el, "h3")
        props["title"] = _text_of(h) if h else ""
        props["items"] = _parse_items(el, ("name", "description"))
    elif t == "Banner":
        h, sub, img, a = _first(el, "h2"), _first(el, "p"), _first(el, "img"), _first(el, "a")
        props["title"] = _text_of(h) if h else ""
        props["subtitle"] = _text_of(sub) if sub else ""
        props["image"] = (img.get("src") or "") if img else props.get("image", "")
        props["ctaLabel"] = _text_of(a) if a else ""
        props["ctaHref"] = (a.get("href") or "") if a else ""
    elif t == "Image":
        img = _first(el, "img")
        props["url"] = (img.get("src") or "") if img else ""
        props["alt"] = (img.get("alt") or "") if img else ""
    elif t == "Button":
        a = _first(el, "a")
        props["label"] = _text_of(a) if a else ""
        props["href"] = (a.get("href") or "") if a else ""
    elif t == "Columns":
        for side in ("left", "right"):
            col = el.find(attrs={"data-zcol": side})
            props[side] = _parse_container(col) if col else []
    elif t == "HtmlBlock":
        props["html"] = sanitize_html("".join(str(c) for c in el.children))
    # any other data-zb value (live/chrome blocks, unknown): props verbatim,
    # placeholder body ignored — validate_design later rejects unknown types.

    return {"type": t, "props": props}


def _parse_container(container: Tag) -> list[dict]:
    """Container children → block list. Annotated tags become blocks; runs of
    user-authored markup collapse into sanitized HtmlBlocks, preserving order.
    Elements stamped data-z-skip are display-only exports (hero, nav, live
    previews) — never imported."""
    blocks: list[dict] = []
    buffer: list[str] = []

    def flush():
        raw = "".join(buffer).strip()
        buffer.clear()
        if raw:
            clean = sanitize_html(raw)
            if clean.strip():
                blocks.append({"type": "HtmlBlock", "props": {"html": clean}})

    for child in container.children:
        if isinstance(child, Comment):
            continue
        if isinstance(child, NavigableString):
            if str(child).strip():
                buffer.append(str(child))
            continue
        if isinstance(child, Tag):
            if child.has_attr("data-z-skip"):
                continue
            if child.get("data-zb"):
                flush()
                blocks.append(_parse_block(child))
            else:
                buffer.append(str(child))
    flush()
    return blocks


def _parse_page(html_text: str) -> dict:
    soup = BeautifulSoup(html_text, "html.parser")
    container = soup.find("main", attrs={"data-zoustec-content": True}) or soup.body or soup
    # A pasted/duplicated file may carry the display-only frame INSIDE main —
    # drop every data-z-skip element wherever it sits before parsing.
    for skipped in container.find_all(attrs={"data-z-skip": True}):
        skipped.decompose()
    title_el = soup.find("title")
    nav_meta = soup.find("meta", attrs={"name": "zoustec-nav"})
    theme_meta = soup.find("meta", attrs={"name": "zoustec-theme"})
    return {
        "title": title_el.get_text().strip() if title_el else "",
        "nav": (nav_meta.get("content") if nav_meta else "show") != "hide",
        "theme": (theme_meta.get("content") or "").strip() if theme_meta else "",
        "content": _parse_container(container),
    }


def _relativize_media(node):
    """Absolute media URLs (added on export so file:// viewing works) →
    back to /media/… so the stored design stays host-independent."""
    if isinstance(node, str):
        return _MEDIA_ABS_RE.sub(r"\1", node)
    if isinstance(node, list):
        return [_relativize_media(v) for v in node]
    if isinstance(node, dict):
        return {k: _relativize_media(v) for k, v in node.items()}
    return node


def site_files_to_design(files: dict[str, str], current_cfg: dict) -> dict:
    """Uploaded file set → design dict for validate_design.

    The uploaded .html files fully define home + sub-pages (a missing page
    file deletes that page — the zip IS the site). Everything HTML cannot
    express — header/footer chrome, theme tokens, per-page zones — is carried
    over from the currently published design so an HTML edit never wipes it.
    """
    if "index.html" not in files:
        raise ApiError(422, "design_invalid", "上傳內容缺少 index.html（首頁）。")

    cfg = current_cfg or {}
    cur_puck = cfg.get("puck") or {}
    cur_root_props = dict((cur_puck.get("root") or {}).get("props") or {})
    cur_pages = {p.get("slug"): p for p in cfg.get("pages") or []}

    home = _parse_page(files["index.html"])
    if home["theme"]:
        cur_root_props["theme"] = home["theme"]
    if "style.css" in files:
        css = files["style.css"]
        cur_root_props["customCss"] = "" if css.strip().startswith("/* 全站自訂 CSS") else css

    pages = []
    for name, text in sorted(files.items()):
        m = PAGE_FILE_RE.match(name)
        if not m or name == "index.html" or not name.endswith(".html"):
            continue
        slug = m.group(1)
        parsed = _parse_page(text)
        old = cur_pages.get(slug) or {}
        pages.append(
            {
                "slug": slug,
                "title": parsed["title"] or old.get("title") or slug,
                "nav": parsed["nav"],
                "data": {
                    "root": (old.get("data") or {}).get("root") or {"props": {}},
                    "content": parsed["content"],
                    "zones": (old.get("data") or {}).get("zones") or {},
                },
            }
        )

    return _relativize_media(
        {
            "puck": {
                "root": {**(cur_puck.get("root") or {}), "props": cur_root_props},
                "content": home["content"],
                "zones": cur_puck.get("zones") or {},
            },
            "pages": pages,
            "header": cfg.get("header"),
            "footer": cfg.get("footer"),
        }
    )
