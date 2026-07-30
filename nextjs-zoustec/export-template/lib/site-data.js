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

/**
 * Content cache, seconds. Default 0 = no cache: every page view reads the
 * platform, so an edit in the designer shows up on the next refresh — the same
 * behaviour as the platform-hosted site.
 *
 * Set a value (e.g. 60) to trade freshness for fewer API calls under load. Note
 * that with a cache, `next build` bakes the first render in and the stale copy
 * is served until the window expires AND a request arrives to trigger the
 * refresh — an edit can then take two page views to appear.
 */
const REVALIDATE = Number(process.env.ZOUSTEC_REVALIDATE ?? 0);

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
      // `cache: 'no-store'` (not just revalidate: 0) is what actually opts out
      // of Next's fetch cache — with a plain revalidate the build-time render
      // gets baked in and served stale.
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'x-export-key': EXPORT_KEY },
        ...(REVALIDATE > 0
          ? { next: { revalidate: REVALIDATE } }
          : { cache: 'no-store' }),
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
