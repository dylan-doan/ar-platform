/**
 * Custom-domain → tenant resolution (spec §VIII).
 *
 * A customer's domain (e.g. walk.tainan.tw) CNAMEs to the platform. When the
 * ROOT of an unknown host is requested, resolve it via the backend and rewrite
 * to that tenant's event entry — the URL in the browser stays the customer's
 * domain (white-label). Platform hosts and deep paths pass through untouched.
 */

import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';
const TTL_MS = 60_000;
const cache = new Map(); // host -> { slug: string|null, ts: number }

const PLATFORM_HOSTS = /(^localhost$)|(\.trycloudflare\.com$)|(\.vercel\.app$)|(\.onrender\.com$)/;

export async function middleware(req) {
  const url = req.nextUrl;
  // Root page only — and never touch LIFF OAuth returns / explicit deep-links.
  if (url.pathname !== '/') return NextResponse.next();
  for (const k of ['code', 'liff.state', 'tenant', 'event']) {
    if (url.searchParams.has(k)) return NextResponse.next();
  }

  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (!host || PLATFORM_HOSTS.test(host)) return NextResponse.next();

  const hit = cache.get(host);
  let slug = hit && Date.now() - hit.ts < TTL_MS ? hit.slug : undefined;
  if (slug === undefined) {
    try {
      const res = await fetch(`${BACKEND}/api/public/domains/${host}`, { cache: 'no-store' });
      slug = res.ok ? (await res.json()).tenant_slug : null;
    } catch {
      slug = null; // backend unreachable → serve the portal as usual
    }
    cache.set(host, { slug, ts: Date.now() });
  }
  if (!slug) return NextResponse.next();

  const dest = url.clone();
  dest.pathname = `/e/${slug}`; // the tenant's EVENT WEBSITE (spec §III.3)
  return NextResponse.rewrite(dest);
}

export const config = { matcher: ['/'] };
