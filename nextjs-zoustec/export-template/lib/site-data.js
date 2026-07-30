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
 *
 * OBSERVABILITY — this is server-side rendering, so the fetch happens in Node
 * and never shows up in the browser's Network tab. To make every call visible:
 *   - each fetch is logged to the server console (the terminal running
 *     `npm run dev` / `npm start`);
 *   - `lastFetch()` exposes what happened, which the pages turn into
 *     `X-Zoustec-Source` response headers you CAN read in DevTools → Network →
 *     click the document → Response Headers.
 * Set ZOUSTEC_LOG=0 to silence the console logging (headers stay).
 */

import snapshot from '../data/site.json';

const API_BASE = (process.env.ZOUSTEC_API_BASE || '').replace(/\/$/, '');
const TENANT_SLUG = process.env.ZOUSTEC_TENANT_SLUG || '';
const EXPORT_KEY = process.env.ZOUSTEC_EXPORT_KEY || '';
const LOG = process.env.ZOUSTEC_LOG !== '0';

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

/** What the most recent getSite() call did — surfaced as response headers. */
let last = { source: 'none', detail: 'no fetch yet' };

export function lastFetch() {
  return last;
}

/** Headers a page attaches so the API call is visible from the browser. */
export function siteDebugHeaders() {
  return {
    'X-Zoustec-Source': last.source,
    'X-Zoustec-Detail': last.detail,
  };
}

function note(source, detail) {
  last = { source, detail };
  if (LOG) console.log(`[zoustec] ${source} — ${detail}`);
}

/**
 * @param eventSlug omit for the domain root (the tenant's homepage rule
 *   decides: a single event, the pinned event, or the multi-event landing).
 */
export async function getSite(eventSlug) {
  if (!API_BASE || !TENANT_SLUG || !EXPORT_KEY) {
    const missing = [
      !API_BASE && 'ZOUSTEC_API_BASE',
      !TENANT_SLUG && 'ZOUSTEC_TENANT_SLUG',
      !EXPORT_KEY && 'ZOUSTEC_EXPORT_KEY',
    ].filter(Boolean).join(', ');
    note('snapshot', `not configured (missing ${missing}) — serving data/site.json`);
    if (eventSlug && snapshot.event?.slug !== eventSlug) throw new SiteNotFound(eventSlug);
    return snapshot;
  }

  const path = eventSlug
    ? `/api/headless/site/${TENANT_SLUG}/${encodeURIComponent(eventSlug)}`
    : `/api/headless/site/${TENANT_SLUG}`;
  const url = `${API_BASE}${path}`;
  const started = Date.now();

  try {
    // `cache: 'no-store'` (not just revalidate: 0) is what actually opts out
    // of Next's fetch cache — with a plain revalidate the build-time render
    // gets baked in and served stale.
    const res = await fetch(url, {
      headers: { 'x-export-key': EXPORT_KEY },
      ...(REVALIDATE > 0
        ? { next: { revalidate: REVALIDATE } }
        : { cache: 'no-store' }),
    });
    const ms = Date.now() - started;

    if (res.ok) {
      const data = await res.json();
      const shape = data.mode === 'landing'
        ? `${data.events?.length ?? 0} events`
        : `event=${data.event?.slug} tasks=${data.tasks?.length ?? 0}`;
      note('api', `GET ${path} 200 ${ms}ms · ${shape}`);
      return data;
    }

    // A real "no such event" answer must NOT fall back to the snapshot —
    // that would render the homepage event under an unknown URL.
    if (res.status === 404) {
      note('not-found', `GET ${path} 404 ${ms}ms`);
      throw new SiteNotFound(path);
    }
    // 401/403 = key missing/revoked/out of scope. Say so loudly: the site keeps
    // serving stale content otherwise, which is what hides a broken key.
    note('snapshot', `GET ${path} ${res.status} ${ms}ms — falling back to data/site.json`);
  } catch (err) {
    if (err instanceof SiteNotFound) throw err;
    note('snapshot', `GET ${path} failed (${err.message}) — falling back to data/site.json`);
  }

  // The snapshot only ever holds the event this project was exported for.
  if (eventSlug && snapshot.event?.slug !== eventSlug) throw new SiteNotFound(eventSlug);
  return snapshot;
}
