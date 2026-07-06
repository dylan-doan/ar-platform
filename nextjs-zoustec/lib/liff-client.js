'use client';

/**
 * Client-side session + API for the end-user (LIFF) experience flow.
 *
 * Login paths:
 *  - Real LINE: set NEXT_PUBLIC_LIFF_ID → liff.init → getIDToken → backend
 *    verifies OIDC and issues the platform JWT.
 *  - Dev (no LIFF ID): a name field issues `dev::{id}::{name}` tokens, which
 *    the backend accepts only with AUTH_DEV_MODE=true.
 *
 * Tenant routing: the portal links to /experience/login?tenant=..&event=..;
 * the JWT is tenant-scoped, so switching tenant forces a fresh login.
 * All calls go same-origin to /api/* (Next rewrites proxy to FastAPI).
 */

const DEFAULT_TENANT = process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';

const KEYS = { token: 'zx_token', name: 'zx_name', tenant: 'zx_tenant', event: 'zx_event', task: 'zx_task' };

export const session = {
  get token() { return typeof window === 'undefined' ? null : localStorage.getItem(KEYS.token); },
  get name() { return typeof window === 'undefined' ? null : localStorage.getItem(KEYS.name); },
  get tenant() { return typeof window === 'undefined' ? null : localStorage.getItem(KEYS.tenant); },
  get eventId() { return typeof window === 'undefined' ? null : localStorage.getItem(KEYS.event); },
  get taskId() { return typeof window === 'undefined' ? null : localStorage.getItem(KEYS.task); },
  setAuth(token, name, tenant) {
    localStorage.setItem(KEYS.token, token);
    localStorage.setItem(KEYS.name, name || '');
    localStorage.setItem(KEYS.tenant, tenant);
  },
  setEvent(id) { localStorage.setItem(KEYS.event, id); },
  setTask(id) { localStorage.setItem(KEYS.task, id); },
  clear() { Object.values(KEYS).forEach((k) => localStorage.removeItem(k)); },
};

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'error', err.message || `HTTP ${res.status}`);
  }
  return data;
}

/** True when a real LIFF ID is configured (production LINE path). */
export const hasLiff = () => Boolean(LIFF_ID);

let _liffPromise = null;
/** Init the LIFF SDK once and cache it (promise-guarded — concurrent callers
 * share one init; a second liff.init would throw). Null when no LIFF ID. */
export async function getLiff() {
  if (!LIFF_ID) return null;
  if (!_liffPromise) {
    _liffPromise = (async () => {
      const liff = (await import('@line/liff')).default;
      await liff.init({ liffId: LIFF_ID });
      return liff;
    })().catch((e) => { _liffPromise = null; throw e; });
  }
  return _liffPromise;
}

/** Login via LINE LIFF (real) — resolves the session payload. */
export async function loginWithLiff(tenant = DEFAULT_TENANT) {
  const liff = await getLiff();
  const goLine = () => {
    // LINE returns to the endpoint (site root); record our way back.
    sessionStorage.setItem('zx_post_login', window.location.href);
    liff.login({ redirectUri: window.location.href });
    return new Promise(() => {}); // page redirects
  };
  if (!liff.isLoggedIn()) return goLine();
  const idToken = liff.getIDToken();
  if (!idToken) {
    // Token can be stale after long sessions — force a fresh LINE login.
    return goLine();
  }
  const out = await api('/api/auth/line', {
    method: 'POST',
    body: { id_token: idToken, tenant_slug: tenant },
  });
  session.setAuth(out.access_token, out.display_name, tenant);
  return out;
}

/** Dev login by display name (AUTH_DEV_MODE backend). */
export async function loginDev(name, tenant = DEFAULT_TENANT) {
  const id = 'web-' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const out = await api('/api/auth/line', {
    method: 'POST',
    body: { id_token: `dev::${id}::${name.trim()}`, tenant_slug: tenant },
  });
  session.setAuth(out.access_token, out.display_name, tenant);
  return out;
}

/** Ensure an event is selected (preferredId wins); returns the event. */
export async function ensureEvent(preferredId) {
  const events = await api('/api/me/events');
  if (!events.length) throw new ApiError(404, 'no_events', 'No active events.');
  const chosen =
    (preferredId && events.find((e) => e.id === preferredId)) ||
    events.find((e) => e.id === session.eventId) ||
    events[0];
  session.setEvent(chosen.id);
  return chosen;
}

/** Browser geolocation as a promise → {lat, lng}. */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('此裝置不支援定位'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? '請允許定位權限後再試' : '無法取得定位，請稍後再試')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
