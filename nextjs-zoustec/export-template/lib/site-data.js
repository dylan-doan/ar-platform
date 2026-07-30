/**
 * Site payload loader.
 *
 * Reads the SAME key-authed endpoint the platform's own customer sites read
 * (GET /api/headless/site/{tenant}/{event}), so this project renders exactly
 * what the platform renders — content edited in the drag-drop designer appears
 * here without a redeploy.
 *
 * Falls back to the bundled snapshot (data/site.json) when the platform is
 * unreachable or the key is missing/revoked, so the site still serves.
 */

import snapshot from '../data/site.json';

const API_BASE = (process.env.ZOUSTEC_API_BASE || '').replace(/\/$/, '');
const TENANT_SLUG = process.env.ZOUSTEC_TENANT_SLUG || '';
const EXPORT_KEY = process.env.ZOUSTEC_EXPORT_KEY || '';

/** Content refresh interval, seconds. 0 disables caching entirely. */
const REVALIDATE = Number(process.env.ZOUSTEC_REVALIDATE ?? 60);

class SiteNotFound extends Error {}

/**
 * @param eventSlug omit for the domain root (the tenant's homepage rule
 *   decides: a single event, the pinned event, or the multi-event landing).
 */
export async function getSite(eventSlug) {
  if (API_BASE && TENANT_SLUG && EXPORT_KEY) {
    const path = eventSlug
      ? `/api/headless/site/${TENANT_SLUG}/${encodeURIComponent(eventSlug)}`
      : `/api/headless/site/${TENANT_SLUG}`;
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'x-export-key': EXPORT_KEY },
        next: { revalidate: REVALIDATE },
      });
      if (res.ok) return await res.json();
      // A real "no such event" answer must NOT fall back to the snapshot —
      // that would render the homepage event under an unknown URL.
      if (res.status === 404) throw new SiteNotFound(path);
    } catch (err) {
      if (err instanceof SiteNotFound) throw err;
      /* platform unreachable — use the snapshot below */
    }
  }
  // The snapshot only ever holds the event this project was exported for.
  if (eventSlug && snapshot.event?.slug !== eventSlug) throw new SiteNotFound(eventSlug);
  return snapshot;
}
