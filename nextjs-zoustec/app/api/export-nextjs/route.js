/**
 * Next.js project export (匯出 Next.js 專案) — packs export-template/ plus
 * the LIVE block library (lib/site-blocks.jsx, components/Icon.jsx — always
 * in sync with the designer) plus a content snapshot into a ready-to-run
 * project zip.
 *
 * Runs on the frontend service because only it has the template sources;
 * auth is the caller's tenant-admin token, forwarded to the backend.
 *
 * The zip ships with the tenant's OWN API key already filled in, so the
 * downloaded site reads live data from the platform on first run — the customer
 * does not have to paste anything. It is the same single tenant key the console
 * issues/rotates (fetched, not minted here); data/site.json is only an offline
 * fallback for when the platform is unreachable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import JSZip from 'jszip';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';

async function addDir(zip, dir, prefix) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addDir(zip, full, rel);
    else zip.file(rel, await fs.readFile(full));
  }
}

async function backendGet(pathName, auth) {
  const res = await fetch(`${BACKEND}${pathName}`, { headers: { authorization: auth } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => ({})) });
  return res.json();
}

async function backendPost(pathName, auth) {
  const res = await fetch(`${BACKEND}${pathName}`, { method: 'POST', headers: { authorization: auth } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => ({})) });
  return res.json();
}

export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const { eventId, mode } = await req.json().catch(() => ({}));
  if (!auth || !eventId) {
    return NextResponse.json({ error: { message: '缺少授權或活動 ID。' } }, { status: 400 });
  }
  // 'static' = plain HTML/CSS/JS bundle (no Node host, content read from the
  // anonymous public endpoint in the browser). Default stays the Node/SSR
  // project so existing customers are unaffected.
  const isStatic = mode === 'static';

  // Snapshot via the caller's own admin auth (RLS-scoped to their tenant).
  let event, tasks, branding, others, apiKey;
  try {
    const events = await backendGet('/api/admin/events', auth);
    event = events.find((e) => e.id === eventId);
    if (!event) return NextResponse.json({ error: { message: '找不到活動。' } }, { status: 404 });
    tasks = await backendGet(`/api/admin/events/${eventId}/tasks`, auth);
    branding = await backendGet('/api/admin/branding', auth);
    others = events.filter((e) => e.id !== eventId && e.is_active !== false);
    // The tenant's existing key (minted only if they have none) — baked in below
    // so the exported site reads live data without any manual setup.
    //
    // The STATIC bundle deliberately does NOT get a key: its fetches run in the
    // visitor's browser, where anything shipped is public. It reads the
    // anonymous /api/public/site/... endpoint instead.
    if (!isStatic) {
      apiKey = (await backendPost('/api/admin/tenant-api-key', auth)).key;
    }
  } catch (e) {
    return NextResponse.json(e.body || { error: { message: e.message } }, { status: e.status || 502 });
  }

  // Offline fallback snapshot. Same shape as GET /api/headless/site/... so the
  // renderers cannot tell the two apart — public task fields only, no QR
  // secrets inside the handed-over project.
  const site = {
    mode: 'event',
    branding: {
      tenant_slug: branding.tenant_slug,
      tenant_name: branding.tenant_name,
      logo_url: branding.logo_url ?? null,
      theme_color: branding.theme_color ?? null,
      show_powered_by: branding.show_powered_by !== false,
      landing_title: branding.landing_title ?? null,
      landing_tagline: branding.landing_tagline ?? null,
      landing_hero: branding.landing_hero ?? null,
      line_liff_id: branding.line_liff_id ?? null,
    },
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      description: event.description,
      event_type: event.event_type,
      config: event.config || {},
      reward_threshold: event.reward_threshold,
      reward_name: event.reward_name,
    },
    tasks: tasks.map((t) => ({ name: t.name, verification_type: t.verification_type, radius_m: t.radius_m })),
    other_events: others.map((e) => ({ slug: e.slug, name: e.name })),
    tenant_slug: branding.tenant_slug,
  };

  const root = process.cwd();
  const templateDir = isStatic ? 'export-static-template' : 'export-template';
  const zip = new JSZip();
  await addDir(zip, path.join(root, templateDir), '');

  const pkgRaw = await fs.readFile(path.join(root, templateDir, 'package.json'), 'utf8');
  const projectName = `${site.tenant_slug}-${event.slug}-site${isStatic ? '-static' : ''}`.toLowerCase();
  zip.file('package.json', pkgRaw.replace('{{PROJECT_NAME}}', projectName));

  const readmeRaw = await fs.readFile(path.join(root, templateDir, 'README.md'), 'utf8');
  zip.file('README.md', readmeRaw.replaceAll('{{EVENT_NAME}}', event.name));

  // The REAL renderers + block library — byte-identical to what the platform
  // serves, so the handed-over project renders the same site. Anything these
  // files import must be copied here too.
  for (const rel of [
    ['lib', 'site-blocks.jsx'],
    ['lib', 'brand.js'],
    ['components', 'Icon.jsx'],
    ['components', 'event', 'EventSite.jsx'],
    ['components', 'event', 'EventSubPage.jsx'],
    ['components', 'event', 'SiteBody.jsx'],
    ['components', 'event', 'EventSections.jsx'],
    ['components', 'event', 'JoinCta.jsx'],
    ['components', 'event', 'TenantLanding.jsx'],
  ]) {
    zip.file(rel.join('/'), await fs.readFile(path.join(root, ...rel)));
  }

  zip.file('data/site.json', JSON.stringify(site, null, 2));

  const apiBase = (req.headers.get('origin') || '').replace(/\/$/, '');
  const liffId = branding.line_liff_id || process.env.NEXT_PUBLIC_LIFF_ID || '';

  if (isStatic) {
    // NEXT_PUBLIC_* is compiled INTO the browser bundle, so only non-secret
    // values may appear here. There is deliberately no API key: the site reads
    // the anonymous public endpoint.
    zip.file('.env.local', [
      '# 這些值會編譯進前端 JS（瀏覽者可見）— 因此只放非機密資訊。',
      '# 網站內容改由匿名公開端點讀取，不需要也不可放 API 金鑰。',
      `NEXT_PUBLIC_ZOUSTEC_API_BASE=${apiBase}`,
      `NEXT_PUBLIC_ZOUSTEC_TENANT_SLUG=${site.tenant_slug}`,
      // Name matches siteLiffId() in components/event/EventSite.jsx, which the
      // CTA/QR reads — a different name here would silently disable the LIFF
      // deep link and fall back to a relative URL that does not resolve.
      `NEXT_PUBLIC_LIFF_ID=${liffId}`,
      '',
    ].join('\n'));
    zip.file('.gitignore', ['node_modules/', '.next/', 'out/', ''].join('\n'));
  } else {
    zip.file('.env.local', [
      `ZOUSTEC_API_BASE=${apiBase}`,
      `ZOUSTEC_TENANT_SLUG=${site.tenant_slug}`,
      '# 貴公司專屬 API 金鑰（每個客戶一組，於 Zoustec 後台可再次查看或重新產生）。',
      '# 內容即由平台即時讀取；此檔請勿公開。',
      `ZOUSTEC_EXPORT_KEY=${apiKey || ''}`,
      '# 內容快取秒數。0（預設）= 每次瀏覽都讀取平台，後台修改立即生效。',
      'ZOUSTEC_REVALIDATE=0',
      `ZOUSTEC_LIFF_ID=${liffId}`,
      '',
    ].join('\n'));
    // Ignore every .env variant, not just the one shipped: a stray `.env` copied
    // by the customer would otherwise commit the API key.
    zip.file('.gitignore', ['node_modules/', '.next/', '.env', '.env.local', '.env*.local', ''].join('\n'));
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return new NextResponse(buf, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${projectName}.zip"`,
    },
  });
}
