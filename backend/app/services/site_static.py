"""Static customer websites: generate, validate uploads, store immutable versions.

The model (docs/html_website_builder_deployment_platform.md):

    Builder (design JSON) --render_site--> index.html, {page}.html,
                                           css/style.css, js/main.js,
                                           js/site-config.js, assets/*
        → SiteVersion(source_type="generated"), files stored verbatim
    User downloads zip → edits ANY file freely (VS Code) → uploads zip
        → validate_site_upload (static files only, hard limits)
        → SiteVersion(source_type="user_upload"), files stored VERBATIM
    Publish / rollback = repointing events.site_version_id.

Two deliberate non-goals, straight from the doc:
- No reverse engineering (§26): an uploaded site is never parsed back into
  builder blocks. The platform only stores, validates, versions, serves.
- Data independence (§17/§23): business data is not baked into the HTML as the
  source of truth. Generated pages carry a snapshot for first paint, and
  js/main.js re-fetches the public site payload (X-Site-Key) at runtime and
  refreshes every [data-zs] region — user edits to HTML/CSS never touch data.
"""

import hashlib
import io
import json
import posixpath
import re
import zipfile
from html import escape

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import MediaAsset, SiteFile, SiteVersion

# ---------------------------------------------------------------- constants

# Static-only allowlist (doc §11) — anything else is rejected, loudly.
STATIC_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

MAX_SITE_ZIP = 20 * 1024 * 1024        # raw upload
MAX_SITE_FILE = 10 * 1024 * 1024       # one extracted file
MAX_SITE_TOTAL = 40 * 1024 * 1024      # sum of extracted files (zip-bomb cap)
MAX_SITE_FILES = 300                   # entry count (zip-bomb cap)

MANIFEST_PATH = ".website/manifest.json"
MANIFEST_FORMAT = "static-html"

# Junk that every OS zip tool sneaks in — skipped silently, not rejected.
_JUNK_RE = re.compile(r"(^|/)(__MACOSX/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)")

_MEDIA_DB_RE = re.compile(r"/media/db/([0-9a-fA-F-]{36})")

_EXT_FOR_IMAGE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}


def content_type_for(path: str) -> str:
    ext = posixpath.splitext(path)[1].lower()
    return STATIC_CONTENT_TYPES.get(ext, "application/octet-stream")


def _err(message: str) -> ApiError:
    return ApiError(422, "site_invalid", message)


# ---------------------------------------------------------------- manifest

def build_manifest(*, tenant_slug: str, event_id, version_id, version_number: int) -> bytes:
    """`.website/manifest.json` — identifies the export so an upload can be
    matched to its project (doc §8: the ZIP FILENAME must never be the id)."""
    return json.dumps(
        {
            "platform": "zoustec",
            "format": MANIFEST_FORMAT,
            "export_version": 1,
            "tenant": tenant_slug,
            "project_id": str(event_id),
            "version_id": str(version_id),
            "version_number": version_number,
        },
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")


# ---------------------------------------------------------------- generator
#
# Renders the designer's design JSON into a plain static site. The output is a
# STARTING POINT the user may rewrite entirely — so it is clean, framework-free
# HTML with semantic classes, not annotated round-trip markup.

def _esc(text) -> str:
    return escape(str(text or ""), quote=False)


def _attr(text) -> str:
    return escape(str(text or ""), quote=True)


class SiteContext:
    """Everything render_site needs beyond the design itself."""

    def __init__(
        self,
        *,
        tenant_slug: str,
        event_slug: str,
        event_name: str,
        description: str = "",
        hero_image: str = "",
        tenant_name: str = "",
        brand_color: str | None = None,
        reward_name: str = "",
        reward_threshold: int = 1,
        tasks: list[str] | None = None,
        api_base: str = "",
        site_key: str = "",
        liff_id: str | None = None,
        media: dict[str, tuple[bytes, str]] | None = None,
    ):
        self.tenant_slug = tenant_slug
        self.event_slug = event_slug
        self.event_name = event_name
        self.description = description
        self.hero_image = hero_image
        self.tenant_name = tenant_name
        self.brand = brand_color or "#0e7490"
        self.reward_name = reward_name
        self.reward_threshold = reward_threshold or 1
        self.tasks = tasks or []
        self.api_base = (api_base or "").rstrip("/")
        self.site_key = site_key
        self.liff_id = liff_id or ""
        # {"/media/db/<uuid>": (bytes, content_type)} — bundled into assets/.
        self.media = media or {}
        self._asset_paths: dict[str, str] = {}

    @property
    def join_href(self) -> str:
        if self.liff_id:
            return f"https://liff.line.me/{self.liff_id}"
        return f"{self.api_base}/e/{self.tenant_slug}/{self.event_slug}" if self.api_base else "#"

    def asset_url(self, url: str) -> str:
        """A /media/db/... reference → bundled relative assets/ path (the zip is
        self-contained); anything else passes through untouched."""
        if not isinstance(url, str) or not url:
            return url or ""
        m = _MEDIA_DB_RE.search(url)
        if not m:
            return url
        key = f"/media/db/{m.group(1)}"
        if key in self._asset_paths:
            return self._asset_paths[key]
        if key not in self.media:
            # Unknown asset — keep it absolute so it still renders online.
            return f"{self.api_base}{key}" if self.api_base and url.startswith("/media/") else url
        data, ctype = self.media[key]
        path = f"assets/{m.group(1)}{_EXT_FOR_IMAGE.get(ctype, '.bin')}"
        self._asset_paths[key] = path
        return path

    def collected_assets(self) -> dict[str, bytes]:
        return {path: self.media[key][0] for key, path in self._asset_paths.items()}


def collect_media_refs(design: dict, hero_image: str = "") -> list[str]:
    """Every /media/db/{uuid} URL referenced by the design (+ hero)."""
    refs: list[str] = []
    seen: set[str] = set()

    def walk(node):
        if isinstance(node, str):
            for m in _MEDIA_DB_RE.finditer(node):
                key = f"/media/db/{m.group(1)}"
                if key not in seen:
                    seen.add(key)
                    refs.append(key)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)

    walk(design)
    walk(hero_image)
    return refs


def _render_children(items, depth: int, ctx: SiteContext) -> str:
    return "\n".join(_render_block(b, depth, ctx) for b in (items or []))


def _render_block(b: dict, depth: int, ctx: SiteContext) -> str:
    t = (b or {}).get("type")
    p = (b or {}).get("props") or {}
    pad = "  " * depth

    if t == "Heading":
        level = p.get("level") if p.get("level") in ("h1", "h2", "h3", "h4") else "h2"
        return f"{pad}<{level}>{_esc(p.get('text'))}</{level}>"
    if t == "Paragraph":
        return f"{pad}<p>{_esc(p.get('text'))}</p>"
    if t == "TextCard":
        return (
            f'{pad}<section class="zs-card">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <p>{_esc(p.get('text'))}</p>\n"
            f"{pad}</section>"
        )
    if t == "Notice":
        lis = "\n".join(f"{pad}    <li>{_esc(it.get('text'))}</li>" for it in p.get("items") or [])
        return (
            f'{pad}<aside class="zs-notice">\n'
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
            f'{pad}<section class="zs-card">\n'
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
            f'{pad}<section class="zs-card zs-places">\n'
            f"{pad}  <h3>{_esc(p.get('title'))}</h3>\n"
            f"{pad}  <ul>\n{lis}\n{pad}  </ul>\n"
            f"{pad}</section>"
        )
    if t == "Banner":
        img = f'{pad}  <img src="{_attr(ctx.asset_url(p.get("image")))}" alt="">\n' if p.get("image") else ""
        cta = (
            f'{pad}  <a class="zs-cta" href="{_attr(p.get("ctaHref") or ctx.join_href)}">{_esc(p.get("ctaLabel"))}</a>\n'
            if p.get("ctaLabel") else ""
        )
        return (
            f'{pad}<section class="zs-banner">\n'
            f"{img}"
            f"{pad}  <h2>{_esc(p.get('title'))}</h2>\n"
            f"{pad}  <p>{_esc(p.get('subtitle'))}</p>\n"
            f"{cta}"
            f"{pad}</section>"
        )
    if t == "Image":
        return (
            f'{pad}<figure class="zs-figure">\n'
            f'{pad}  <img src="{_attr(ctx.asset_url(p.get("url")))}" alt="{_attr(p.get("alt"))}">\n'
            f"{pad}</figure>"
        )
    if t == "Button":
        return (
            f'{pad}<p><a class="zs-btn" href="{_attr(p.get("href"))}">{_esc(p.get("label"))}</a></p>'
        )
    if t == "Columns":
        left = _render_children(p.get("left"), depth + 2, ctx)
        right = _render_children(p.get("right"), depth + 2, ctx)
        return (
            f'{pad}<div class="zs-columns">\n'
            f"{pad}  <div>\n{left}\n{pad}  </div>\n"
            f"{pad}  <div>\n{right}\n{pad}  </div>\n"
            f"{pad}</div>"
        )
    if t == "Divider":
        return f"{pad}<hr>"
    if t == "Spacer":
        return f'{pad}<div class="zs-spacer"></div>'
    if t == "HtmlBlock":
        # Designer-authored custom HTML (already sanitized at design save).
        return f'{pad}<div class="zs-html">\n{p.get("html") or ""}\n{pad}</div>'
    if t == "StatsBand":
        # Live event data: baked snapshot for first paint, refreshed by main.js.
        return (
            f'{pad}<section class="zs-stats">\n'
            f'{pad}  <div><b data-zs="stat-tasks">{len(ctx.tasks)}</b><span>任務停靠點</span></div>\n'
            f'{pad}  <div><b data-zs="stat-threshold">{ctx.reward_threshold}</b><span>集章門檻</span></div>\n'
            f'{pad}  <div><b data-zs="stat-reward">{_esc(ctx.reward_name) or "—"}</b><span>獎勵</span></div>\n'
            f"{pad}</section>"
        )
    if t == "TaskStops":
        lis = "\n".join(f"{pad}    <li>{_esc(name)}</li>" for name in ctx.tasks) or f"{pad}    <li>（尚無任務）</li>"
        return (
            f'{pad}<section class="zs-taskstops">\n'
            f"{pad}  <h3>{_esc(p.get('title') or '任務停靠點')}</h3>\n"
            f'{pad}  <ol class="zs-tasks" data-zs="tasks">\n{lis}\n{pad}  </ol>\n'
            f"{pad}</section>"
        )
    # SiteHeader/SiteFooter are rendered as page chrome, not in the flow;
    # unknown/legacy types degrade to nothing rather than break the export.
    return ""


def _chrome_props(doc: dict | None, block_type: str) -> dict:
    for block in ((doc or {}).get("content") or []):
        if block.get("type") == block_type:
            return block.get("props") or {}
    return {}


def _nav_html(ctx: SiteContext, nav_items: list[tuple[str, str]], current: str, header_props: dict) -> str:
    title = header_props.get("title") or ctx.event_name
    current_attr = ' class="is-current"'
    links = "\n".join(
        f'    <a href="{_attr(fname)}"{current_attr if fname == current else ""}>{_esc(label)}</a>'
        for fname, label in nav_items
    )
    join_label = header_props.get("joinLabel") or "開始旅程"
    return (
        f'<nav class="zs-nav">\n'
        f"  <b>{_esc(title)}</b>\n"
        f'  <div class="zs-nav-links" data-zs="nav">\n{links}\n  </div>\n'
        f'  <a class="zs-join" data-zs="join" href="{_attr(ctx.join_href)}">{_esc(join_label)}</a>\n'
        f"</nav>"
    )


def _hero_html(ctx: SiteContext) -> str:
    hero_url = ctx.asset_url(ctx.hero_image) if ctx.hero_image else ""
    bg = (
        f' style="background-image:linear-gradient(rgba(15,23,32,.55),rgba(15,23,32,.7)),url(\'{_attr(hero_url)}\')"'
        if hero_url else ""
    )
    return (
        f'<header class="zs-hero"{bg}>\n'
        f'  <div class="zs-hero-inner">\n'
        f'    <h1 data-zs="event-name">{_esc(ctx.event_name)}</h1>\n'
        f'    <p data-zs="event-description">{_esc(ctx.description)}</p>\n'
        f'    <a class="zs-cta" data-zs="join" href="{_attr(ctx.join_href)}">開始旅程</a>\n'
        f"  </div>\n"
        f"</header>"
    )


def _footer_html(ctx: SiteContext, footer_props: dict) -> str:
    about = footer_props.get("about") or ""
    copyright_ = footer_props.get("copyright") or f"{ctx.tenant_name} · Powered by Zoustec"
    about_html = f"  <p>{_esc(about)}</p>\n" if about else ""
    return (
        f'<footer class="zs-footer">\n'
        f'  <div class="zs-footer-inner">\n{about_html}'
        f'    <p data-zs="footer-copyright">{_esc(copyright_)}</p>\n'
        f"  </div>\n"
        f"</footer>"
    )


def _page_html(
    ctx: SiteContext, *, title: str, content_html: str,
    nav_items: list[tuple[str, str]], current: str, with_hero: bool,
    show_nav: bool, header_props: dict, footer_props: dict,
) -> str:
    nav = _nav_html(ctx, nav_items, current, header_props) if show_nav else ""
    hero = _hero_html(ctx) if with_hero else ""
    body_top = "\n".join(part for part in (nav, hero) if part)
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)}</title>
<link rel="stylesheet" href="css/style.css">
<script src="js/site-config.js" defer></script>
<script src="js/main.js" defer></script>
</head>
<body>
{body_top}
<main class="zs-main">
{content_html}
</main>
{_footer_html(ctx, footer_props)}
</body>
</html>
"""


_BASE_CSS = """/* Zoustec 產生的網站樣式 — 可自由修改，整個檔案都是你的 */
:root { --brand: %(brand)s; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', sans-serif;
       color: #1c2530; background: #f6f7f9; line-height: 1.65; }
.zs-main { max-width: 760px; margin: 0 auto; padding: 24px 18px 60px; }
h1,h2,h3 { line-height: 1.3; }
img { max-width: 100%%; border-radius: 10px; }
.zs-main section, .zs-main aside, .zs-main figure, .zs-main .zs-html { margin: 18px 0; }
.zs-nav { display: flex; align-items: center; gap: 14px; padding: 12px 20px; background: var(--brand);
  color: #fff; position: sticky; top: 0; z-index: 10; }
.zs-nav b { margin-right: auto; }
.zs-nav a { color: #fff; text-decoration: none; font-size: 14px; opacity: .92; }
.zs-nav-links { display: flex; gap: 14px; }
.zs-nav a.is-current { text-decoration: underline; }
.zs-nav .zs-join { background: #fff; color: var(--brand); border-radius: 999px; padding: 6px 16px; font-weight: 700; }
.zs-hero { background: #253244 center/cover no-repeat; color: #fff; padding: 72px 24px; margin: 0; }
.zs-hero-inner { max-width: 760px; margin: 0 auto; }
.zs-hero h1 { margin: 0 0 10px; font-size: 34px; }
.zs-hero p { margin: 0 0 18px; opacity: .92; max-width: 46em; }
.zs-card, .zs-taskstops { background: #fff; border: 1px solid #e3e7ec; border-radius: 12px; padding: 16px 18px; }
.zs-notice { background: #fff8ec; border: 1px solid #f0dfc0; border-radius: 12px; padding: 14px 18px; }
.zs-banner { background: #202b38; color: #fff; border-radius: 14px; padding: 40px 24px; text-align: center; overflow: hidden; }
.zs-cta, .zs-btn { display: inline-block; background: var(--brand); color: #fff;
  padding: 10px 22px; border-radius: 999px; text-decoration: none; font-weight: 600; }
.zs-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.zs-columns > div { min-width: 0; }
.zs-spacer { height: 28px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
dt { color: #66727f; } dd { margin: 0; text-align: right; }
.zs-places li { margin: 6px 0; }
.zs-places strong { display: block; }
hr { border: 0; border-top: 1px solid #dde2e8; }
.zs-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.zs-stats > div { background: #fff; border: 1px solid #e3e7ec; border-radius: 10px; padding: 10px 14px; }
.zs-stats b { display: block; font-size: 20px; }
.zs-stats span { font-size: 12px; color: #66727f; }
.zs-tasks { list-style: none; margin: 0; padding: 0; }
.zs-tasks li { background: #fff; border: 1px solid #e3e7ec; border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
.zs-footer { background: #1d2733; color: #c7d0da; padding: 26px 20px; margin-top: 40px; font-size: 14px; }
.zs-footer-inner { max-width: 760px; margin: 0 auto; }
@media (max-width: 620px) { .zs-columns, .zs-stats { grid-template-columns: 1fr; } }
"""

_MAIN_JS = """/* Zoustec 動態資料 — 網站外觀隨你改，資料仍由平台集中管理。
 * 這支腳本向平台公開 API 取得活動的即時資料（任務、集章門檻、獎勵），
 * 更新頁面上所有 [data-zs] 標記的區域。找不到標記就跳過 — 你可以
 * 自由刪改版面；保留 data-zs 屬性的元素會持續自動更新。 */
(function () {
  var cfg = window.ZOUSTEC_SITE || {};
  if (!cfg.apiBase || !cfg.tenant) return;
  var url = cfg.apiBase + "/api/public/site/" + cfg.tenant + (cfg.event ? "/" + cfg.event : "");
  var headers = {};
  if (cfg.siteKey) headers["X-Site-Key"] = cfg.siteKey;

  function setText(name, value) {
    var els = document.querySelectorAll('[data-zs="' + name + '"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  fetch(url, { headers: headers })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || data.mode !== "event") return;
      var ev = data.event || {};
      var tasks = data.tasks || [];
      setText("event-name", ev.name || "");
      setText("event-description", ev.description || "");
      setText("stat-tasks", String(tasks.length));
      setText("stat-threshold", String(ev.reward_threshold || 1));
      setText("stat-reward", ev.reward_name || "—");
      setText("footer-copyright",
        (data.branding && data.branding.tenant_name ? data.branding.tenant_name : "") + " · Powered by Zoustec");
      var lists = document.querySelectorAll('[data-zs="tasks"]');
      for (var i = 0; i < lists.length; i++) {
        var html = "";
        for (var j = 0; j < tasks.length; j++) {
          html += "<li>" + String(tasks[j].name || "").replace(/[<>&]/g, function (c) {
            return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c];
          }) + "</li>";
        }
        if (html) lists[i].innerHTML = html;
      }
      if (data.branding && data.branding.line_liff_id) {
        var joins = document.querySelectorAll('[data-zs="join"]');
        for (var k = 0; k < joins.length; k++) {
          joins[k].setAttribute("href", "https://liff.line.me/" + data.branding.line_liff_id);
        }
      }
    })
    .catch(function () { /* 離線／API 無法連線時保留頁面上的快照內容 */ });
})();
"""


def _site_config_js(ctx: SiteContext) -> str:
    payload = json.dumps(
        {
            "apiBase": ctx.api_base,
            "tenant": ctx.tenant_slug,
            "event": ctx.event_slug,
            "siteKey": ctx.site_key,
        },
        ensure_ascii=False,
        indent=2,
    )
    return (
        "/* 平台連線設定 — Site Key 是公開識別碼（僅能讀取公開資料），\n"
        " * 不是秘密憑證；請勿把管理端金鑰放進網站。 */\n"
        f"window.ZOUSTEC_SITE = {payload};\n"
    )


def render_site(design: dict, ctx: SiteContext) -> dict[str, bytes]:
    """Design JSON + live context → the complete static file set.

    Layout (doc §6): index.html + one {slug}.html per designer page,
    css/style.css, js/site-config.js, js/main.js, assets/*.
    The manifest is NOT part of the stored version — it is added per-download
    with the real version ids (build_manifest).
    """
    design = design or {}
    puck = design.get("puck") or {}
    root_props = (puck.get("root") or {}).get("props") or {}

    pages = [
        p for p in (design.get("pages") or [])
        if p.get("slug") and re.match(r"^[a-z0-9][a-z0-9-]{0,63}$", str(p.get("slug"))) and p["slug"] != "index"
    ]
    nav_items = [("index.html", "首頁")] + [
        (f"{p['slug']}.html", p.get("title") or p["slug"]) for p in pages if p.get("nav") is not False
    ]
    header_props = _chrome_props(design.get("header"), "SiteHeader")
    footer_props = _chrome_props(design.get("footer"), "SiteFooter")

    files: dict[str, bytes] = {}
    files["index.html"] = _page_html(
        ctx,
        title=ctx.event_name,
        content_html=_render_children(puck.get("content"), 1, ctx),
        nav_items=nav_items, current="index.html", with_hero=True,
        show_nav=True, header_props=header_props, footer_props=footer_props,
    ).encode("utf-8")
    for page in pages:
        files[f"{page['slug']}.html"] = _page_html(
            ctx,
            title=page.get("title") or page["slug"],
            content_html=_render_children((page.get("data") or {}).get("content"), 1, ctx),
            nav_items=nav_items, current=f"{page['slug']}.html", with_hero=False,
            show_nav=page.get("nav") is not False,
            header_props=header_props, footer_props=footer_props,
        ).encode("utf-8")

    css = _BASE_CSS % {"brand": ctx.brand}
    custom_css = root_props.get("customCss") or ""
    if custom_css.strip():
        css += "\n/* ── 設計器的全站自訂 CSS ── */\n" + custom_css + "\n"
    files["css/style.css"] = css.encode("utf-8")
    files["js/site-config.js"] = _site_config_js(ctx).encode("utf-8")
    files["js/main.js"] = _MAIN_JS.encode("utf-8")
    files.update(ctx.collected_assets())
    return files


async def load_design_media(
    session: AsyncSession, design: dict, hero_image: str = ""
) -> dict[str, tuple[bytes, str]]:
    """Fetch every media asset the design references, tenant-scoped (RLS)."""
    refs = collect_media_refs(design, hero_image)
    media: dict[str, tuple[bytes, str]] = {}
    for key in refs:
        asset_id = key.rsplit("/", 1)[1]
        asset = (
            await session.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
        ).scalar_one_or_none()
        if asset is not None:
            media[key] = (asset.data, asset.content_type)
    return media


# ---------------------------------------------------------------- upload

def _normalize_path(name: str) -> str | None:
    """Zip entry name → safe relative posix path, or None to skip the entry.
    Raises on traversal — a hostile zip fails loudly, junk is skipped quietly."""
    path = name.replace("\\", "/").lstrip("/")
    if not path or path.endswith("/"):
        return None
    if _JUNK_RE.search(path):
        return None
    normalized = posixpath.normpath(path)
    if normalized.startswith("../") or normalized == ".." or normalized.startswith("/"):
        raise _err("ZIP 內含不安全的路徑（..），已拒絕。")
    return normalized


def _strip_wrapper_dir(files: dict[str, bytes]) -> dict[str, bytes]:
    """`website/index.html` → `index.html` when the whole zip sits inside one
    wrapper folder (what you get from zipping the extracted folder itself)."""
    if "index.html" in files or not files:
        return files
    first_segments = {path.split("/", 1)[0] for path in files}
    if len(first_segments) != 1:
        return files
    wrapper = first_segments.pop()
    stripped = {path.split("/", 1)[1]: data for path, data in files.items() if "/" in path}
    return stripped if "index.html" in stripped else files


def validate_site_upload(data: bytes) -> tuple[dict[str, bytes], dict | None]:
    """Uploaded zip → ({path: bytes}, manifest|None). Enforces the doc §11
    security checklist: traversal, zip bomb (count/size/total), extension
    allowlist, static files only. Files are otherwise NOT touched — what the
    user uploads is what production serves (doc §26)."""
    if len(data) > MAX_SITE_ZIP:
        raise _err(f"ZIP 檔案過大（上限 {MAX_SITE_ZIP // (1024 * 1024)}MB）。")
    if data[:2] != b"PK":
        raise _err("請上傳 ZIP 檔（從平台下載的網站壓縮檔）。")

    files: dict[str, bytes] = {}
    total = 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            if len(infos) > MAX_SITE_FILES:
                raise _err(f"檔案數量過多（上限 {MAX_SITE_FILES} 個）。")
            for info in infos:
                path = _normalize_path(info.filename)
                if path is None:
                    continue
                # Read with a hard cap — the declared size in the zip header
                # can lie, so never trust info.file_size alone.
                with zf.open(info) as fh:
                    content = fh.read(MAX_SITE_FILE + 1)
                if len(content) > MAX_SITE_FILE:
                    raise _err(f"檔案 {path} 過大（單檔上限 {MAX_SITE_FILE // (1024 * 1024)}MB）。")
                total += len(content)
                if total > MAX_SITE_TOTAL:
                    raise _err(f"解壓縮後總大小超過上限（{MAX_SITE_TOTAL // (1024 * 1024)}MB）。")
                files[path] = content
    except zipfile.BadZipFile:
        raise _err("ZIP 檔案無法讀取。")

    files = _strip_wrapper_dir(files)

    manifest: dict | None = None
    manifest_raw = files.pop(MANIFEST_PATH, None)
    # The .website/ folder is export metadata, never part of the served site.
    files = {p: c for p, c in files.items() if not p.startswith(".website/")}
    if manifest_raw is not None:
        try:
            parsed = json.loads(manifest_raw.decode("utf-8"))
            manifest = parsed if isinstance(parsed, dict) else None
        except (ValueError, UnicodeDecodeError):
            raise _err(".website/manifest.json 格式錯誤。")

    for path in files:
        ext = posixpath.splitext(path)[1].lower()
        if ext not in STATIC_CONTENT_TYPES:
            raise _err(
                f"不支援的檔案類型：{path} — 網站只能包含靜態檔案"
                f"（{'、'.join(sorted(STATIC_CONTENT_TYPES))}）。"
            )

    if "index.html" not in files:
        raise _err("網站缺少 index.html（首頁）。")
    return files, manifest


# ---------------------------------------------------------------- storage

def _fileset_hash(files: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(files[path])
        digest.update(b"\x00")
    return digest.hexdigest()


async def create_site_version(
    session: AsyncSession,
    *,
    tenant_id,
    event_id,
    source_type: str,
    files: dict[str, bytes],
    created_by: str = "",
) -> SiteVersion:
    """Persist a file set as the next immutable version of this event's site."""
    next_number = (
        (
            await session.execute(
                select(func.coalesce(func.max(SiteVersion.version_number), 0)).where(
                    SiteVersion.event_id == event_id
                )
            )
        ).scalar_one()
        + 1
    )
    version = SiteVersion(
        tenant_id=tenant_id,
        event_id=event_id,
        version_number=next_number,
        source_type=source_type,
        source_hash=_fileset_hash(files),
        file_count=len(files),
        total_bytes=sum(len(c) for c in files.values()),
        created_by=created_by[:64],
    )
    session.add(version)
    await session.flush()
    for path, content in files.items():
        session.add(
            SiteFile(
                tenant_id=tenant_id,
                version_id=version.id,
                path=path,
                content_type=content_type_for(path),
                data=content,
                size=len(content),
            )
        )
    await session.flush()
    return version


def version_out(version: SiteVersion, current_version_id) -> dict:
    return {
        "id": str(version.id),
        "version_number": version.version_number,
        "source_type": version.source_type,
        "source_hash": version.source_hash,
        "file_count": version.file_count,
        "total_bytes": version.total_bytes,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "is_current": current_version_id == version.id,
        "preview_path": f"/sites/preview/{version.id}/",
    }
