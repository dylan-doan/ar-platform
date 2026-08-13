/**
 * 產生網站版本 — build a static HTML/CSS/JS site that looks EXACTLY like the
 * live site, by capturing the platform's own SSR output.
 *
 * The platform's public event pages (/e/{tenant}/{event}[/{page}]) are the one
 * true renderer (EventSite + lib/site-blocks.jsx). Instead of maintaining a
 * second HTML generator (which would drift — and did), this route fetches
 * those pages from THIS server, strips the Next.js runtime (scripts/preloads),
 * bundles the compiled CSS and referenced media into the file set, rewrites
 * internal links to flat .html files, and injects a tiny framework-free
 * runtime (js/main.js) that re-fetches live data via the public API with the
 * tenant's Site Key and updates the [data-zs] regions.
 *
 * The finished file set is posted to the backend as the event's next site
 * version (source_type=generated) — the backend stores/validates/serves it;
 * generation lives here because only the frontend renders the site.
 */

import { NextResponse } from 'next/server';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';
const SELF = `http://127.0.0.1:${process.env.PORT || 3000}`;

const MEDIA_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
};

async function backendJson(pathName, auth, init = {}) {
  const res = await fetch(`${BACKEND}${pathName}`, { ...init, headers: { authorization: auth, ...(init.headers || {}) } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => ({})) });
  return res.json();
}

async function fetchSelfText(pathName) {
  const res = await fetch(`${SELF}${pathName}`, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error(`render ${pathName}: HTTP ${res.status}`), { status: res.status });
  return res.text();
}

/** The visitor-facing origin of this deployment — baked into the bundle as the
 * absolute API base so the site works from file://, /sites/ hosting and any
 * custom domain alike (this origin proxies /api, /media and /e). */
function publicBaseOf(req) {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${req.headers.get('host')}`;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** SSR page → standalone static page: no Next runtime, bundled css, our JS. */
function toStaticPage(html) {
  // Dev serves stylesheets with a ?v= cache-buster, production without — match both.
  const cssFiles = [...new Set([...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]))];
  let out = html
    // The static site has no React runtime — drop hydration scripts entirely.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+rel="(?:preload|modulepreload|prefetch)"[^>]*>/gi, '')
    // Compiled stylesheets are bundled into one local file below.
    .replace(/<link[^>]+href="\/_next\/static\/css\/[^"]*"[^>]*>/gi, '');
  out = out.replace(
    '</head>',
    '<link rel="stylesheet" href="css/style.css">\n' +
    '<script src="js/site-config.js" defer></script>\n' +
    '<script src="js/main.js" defer></script>\n</head>',
  );
  return { html: out, cssFiles };
}

/** Internal SSR link targets → flat .html files / absolute platform URLs. */
function rewriteLinks(html, { eventSlug, pageSlugs, otherSlugs, tenant, publicBase }) {
  let out = html;
  for (const slug of pageSlugs) {
    out = out.replaceAll(`href="/${eventSlug}/${slug}"`, `href="${slug}.html"`);
    out = out.replaceAll(`href="/e/${tenant}/${eventSlug}/${slug}"`, `href="${slug}.html"`);
  }
  out = out.replaceAll(`href="/${eventSlug}"`, 'href="index.html"');
  out = out.replaceAll(`href="/e/${tenant}/${eventSlug}"`, 'href="index.html"');
  // Links leaving this site (sibling events, non-LIFF join fallback) must
  // resolve on the platform, not the static host.
  for (const slug of otherSlugs) {
    out = out.replaceAll(`href="/${slug}"`, `href="${publicBase}/e/${tenant}/${slug}"`);
    out = out.replaceAll(`href="/e/${tenant}/${slug}"`, `href="${publicBase}/e/${tenant}/${slug}"`);
  }
  out = out.replace(/(href|data-zs-href)="(\/experience\/[^"]*)"/g, `$1="${publicBase}$2"`);
  return out;
}

const MAIN_JS = `/* Zoustec 動態資料 — 網站外觀隨你改，資料仍由平台集中管理。
 * 讀取平台公開 API（帶 X-Site-Key）更新頁面上所有 [data-zs] 標記的區域；
 * 刪掉標記的區塊就不再自動更新。此外替 CTA 按鈕綁定開啟連結
 * （靜態版沒有 React runtime）。 */
(function () {
  var cfg = window.ZOUSTEC_SITE || {};

  function bindJoin() {
    var els = document.querySelectorAll('[data-zs="join"]');
    for (var i = 0; i < els.length; i++) (function (el) {
      var href = el.getAttribute('data-zs-href') || el.getAttribute('href');
      if (el.tagName === 'BUTTON' && href) {
        el.addEventListener('click', function () { window.location.href = el.getAttribute('data-zs-href') || href; });
      }
    })(els[i]);
  }
  bindJoin();

  function setText(name, value) {
    var els = document.querySelectorAll('[data-zs="' + name + '"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  if (!cfg.apiBase || !cfg.tenant || !cfg.event) return;
  var headers = cfg.siteKey ? { 'X-Site-Key': cfg.siteKey } : {};
  fetch(cfg.apiBase + '/api/public/site/' + cfg.tenant + '/' + cfg.event, { headers: headers })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || data.mode !== 'event') return;
      var ev = data.event || {};
      var tasks = data.tasks || [];
      setText('event-name', ev.name || '');
      setText('event-description', ev.description || '');
      setText('stat-tasks', String(tasks.length));
      setText('stat-threshold', String(ev.reward_threshold || 1));
      setText('stat-reward', ev.reward_name || '—');
      // Task names update in place; adding/removing stops needs a re-generate,
      // so only sync when the counts still match.
      var names = document.querySelectorAll('[data-zs="task-name"]');
      if (names.length && names.length === tasks.length) {
        for (var i = 0; i < tasks.length; i++) names[i].textContent = tasks[i].name || '';
      }
      if (data.branding && data.branding.line_liff_id) {
        var join = 'https://liff.line.me/' + data.branding.line_liff_id +
          '/experience/login?tenant=' + cfg.tenant + '&event=' + (ev.id || '');
        var els = document.querySelectorAll('[data-zs="join"]');
        for (var j = 0; j < els.length; j++) {
          els[j].setAttribute('data-zs-href', join);
          if (els[j].tagName === 'A') els[j].setAttribute('href', join);
        }
      }
    })
    .catch(function () { /* 離線時保留頁面上的快照內容 */ });
})();
`;

export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const { eventId } = await req.json().catch(() => ({}));
  if (!auth || !eventId) {
    return NextResponse.json({ error: { message: '缺少授權或活動 ID。' } }, { status: 400 });
  }
  const publicBase = publicBaseOf(req);

  try {
    // Event + tenant identity via the caller's own admin auth (RLS-scoped).
    const events = await backendJson('/api/admin/events', auth);
    const event = events.find((e) => e.id === eventId);
    if (!event) return NextResponse.json({ error: { message: '找不到活動。' } }, { status: 404 });
    const branding = await backendJson('/api/admin/branding', auth);
    const tenant = branding.tenant_slug;
    const siteKey = (await backendJson('/api/admin/tenant-api-key', auth, { method: 'POST' })).key || '';

    const pageSlugs = (event.config?.pages || []).map((p) => p?.slug).filter(Boolean);
    const otherSlugs = events.filter((e) => e.id !== eventId).map((e) => e.slug);

    // Capture the one true renderer's output — the platform's own SSR pages.
    const pages = { 'index.html': await fetchSelfText(`/e/${tenant}/${event.slug}`) };
    for (const slug of pageSlugs) {
      pages[`${slug}.html`] = await fetchSelfText(`/e/${tenant}/${event.slug}/${slug}`);
    }

    const files = {}; // path -> string | Buffer
    let cssFiles = [];
    for (const [name, raw] of Object.entries(pages)) {
      const { html, cssFiles: found } = toStaticPage(raw);
      cssFiles = [...new Set([...cssFiles, ...found])];
      files[name] = rewriteLinks(html, { eventSlug: event.slug, pageSlugs, otherSlugs, tenant, publicBase });
    }

    // Compiled CSS (design tokens + fonts + helpers) → one local stylesheet.
    let css = '';
    for (const href of cssFiles) css += `${await fetchSelfText(href)}\n`;
    files['css/style.css'] = css;

    // Referenced media → bundled assets/ so the zip is self-contained.
    const mediaIds = new Set();
    for (const name of Object.keys(files)) {
      for (const m of String(files[name]).matchAll(/\/media\/db\/([0-9a-fA-F-]{36})/g)) mediaIds.add(m[1]);
    }
    for (const id of mediaIds) {
      const res = await fetch(`${BACKEND}/media/db/${id}`);
      if (!res.ok) continue;
      const ext = MEDIA_EXT[(res.headers.get('content-type') || '').split(';')[0]] || '.bin';
      const assetPath = `assets/${id}${ext}`;
      files[assetPath] = Buffer.from(await res.arrayBuffer());
      const ref = new RegExp(`(?:https?://[^"'()\\s]+)?/media/db/${esc(id)}`, 'g');
      for (const name of Object.keys(files)) {
        if (typeof files[name] === 'string') files[name] = files[name].replace(ref, assetPath);
      }
    }

    files['js/site-config.js'] =
      '/* 平台連線設定 — Site Key 是公開識別碼（僅能讀取公開資料），\n' +
      ' * 不是秘密憑證；請勿把管理端金鑰放進網站。 */\n' +
      `window.ZOUSTEC_SITE = ${JSON.stringify({ apiBase: publicBase, tenant, event: event.slug, siteKey }, null, 2)};\n`;
    files['js/main.js'] = MAIN_JS;

    // Hand the file set to the backend as the next immutable version.
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const fd = new FormData();
    fd.append('file', blob, 'website.zip');
    const stored = await fetch(
      `${BACKEND}/api/admin/events/${eventId}/site/upload?source_type=generated`,
      { method: 'POST', headers: { authorization: auth }, body: fd },
    );
    const body = await stored.json().catch(() => ({}));
    if (!stored.ok) return NextResponse.json(body, { status: stored.status });
    return NextResponse.json(body);
  } catch (e) {
    const status = Number.isInteger(e.status) ? e.status : 500;
    return NextResponse.json(e.body || { error: { message: e.message || '產生網站失敗。' } }, { status });
  }
}
