/**
 * Media URL helpers — shared by the build-time snapshot loader (server) and the
 * live refresh (browser).
 *
 * Deliberately has NO 'use client' and no React import: lib/site-baked.js reads
 * it during `next build` on the server, and lib/site-live.js reads it in the
 * browser. Marking it client-only would break the server import.
 *
 * WHY: content stores RELATIVE media URLs (/media/db/…). The server-rendered
 * export proxies those via next.config rewrites, but a STATIC export has no
 * proxy — so the URLs must be rewritten to point at the platform directly.
 */

const API_BASE = (process.env.NEXT_PUBLIC_ZOUSTEC_API_BASE || '').replace(/\/$/, '');

/** `/media/…` → absolute platform URL. Anything else is returned untouched. */
export function absolutizeMedia(value) {
  if (typeof value !== 'string') return value;
  return value.startsWith('/media/') ? `${API_BASE}${value}` : value;
}

/** Deep-rewrites every `/media/…` string in a payload. */
export function withAbsoluteMedia(node) {
  if (typeof node === 'string') return absolutizeMedia(node);
  if (Array.isArray(node)) return node.map(withAbsoluteMedia);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, withAbsoluteMedia(v)]),
    );
  }
  return node;
}
