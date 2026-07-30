/**
 * Server-side API client for the FastAPI backend.
 *
 * Auth (dev): AUTH_DEV_MODE on the backend accepts `dev::{id}::{name}` id
 * tokens, so admin screens auto-login as the seeded admins. In production this
 * module is replaced by real LINE Login / admin session handling — every call
 * site only depends on the exported fetch helpers.
 */

const BASE = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';

const DEV_TENANT_SLUG = process.env.DEV_TENANT_SLUG || 'taipei';
const DEV_TENANT_ADMIN = process.env.DEV_TENANT_ADMIN || 'dev::admin-taipei::Taipei Admin';
const DEV_PLATFORM_ADMIN = process.env.DEV_PLATFORM_ADMIN || 'dev::platform-boss::Boss';

// Module-level token cache (per server process). JWTs last 24h; refresh early.
const tokenCache = { tenant: null, platform: null };
const TOKEN_TTL_MS = 10 * 60 * 1000;

async function login(kind) {
  const cached = tokenCache[kind];
  if (cached && cached.expires > Date.now()) return cached.token;

  const url = kind === 'platform' ? `${BASE}/api/auth/platform` : `${BASE}/api/auth/line`;
  const body =
    kind === 'platform'
      ? { id_token: DEV_PLATFORM_ADMIN }
      : { id_token: DEV_TENANT_ADMIN, tenant_slug: DEV_TENANT_SLUG };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${kind} login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  tokenCache[kind] = { token: data.access_token, expires: Date.now() + TOKEN_TTL_MS };
  return data.access_token;
}

async function apiFetch(path, { token, ...opts } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

/** GET as the (dev) tenant admin. */
export async function adminGet(path) {
  return apiFetch(path, { token: await login('tenant') });
}

/** GET as the (dev) platform admin. */
export async function platformGet(path) {
  return apiFetch(path, { token: await login('platform') });
}

/** GET a public (pre-auth) endpoint. */
export async function publicGet(path) {
  return apiFetch(path);
}

/**
 * GET the event-website payload for a customer site we host.
 *
 * Prefers the SAME keyed endpoint the exported Next.js project calls, so a
 * customer's site takes an identical code path whether it runs here or on their
 * own server. PLATFORM_SERVICE_KEY is our first-party credential (valid for any
 * tenant — the slug in the path selects one); it is never handed to a customer.
 *
 * @param tenant tenant slug
 * @param event  event slug, or undefined for the domain root (the tenant's
 *   homepage rule then decides: single event, pinned event, or landing list)
 */
export async function siteGet(tenant, event) {
  const suffix = event ? `/${tenant}/${encodeURIComponent(event)}` : `/${tenant}`;
  const serviceKey = process.env.PLATFORM_SERVICE_KEY;
  // Without a service key configured, use the un-keyed alias rather than
  // failing: both routes build the payload from the same module
  // (app/services/site_payload.py), so the rendered site is identical. This
  // keeps customer sites serving on deploys where the env var is not set yet.
  if (!serviceKey) return apiFetch(`/api/public/site${suffix}`);
  return apiFetch(`/api/headless/site${suffix}`, {
    headers: { 'x-export-key': serviceKey },
  });
}

// ---------------------------------------------------------------- formatting

export function fmt(n) {
  return Number(n ?? 0).toLocaleString('zh-TW');
}

export function fmtCompact(n) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString('zh-TW');
}

export function fmtPct(x) {
  return `${(Number(x ?? 0) * 100).toFixed(1)}%`;
}
