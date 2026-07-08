'use client';

/**
 * Client-side admin auth + API.
 *
 * Both back offices sign in with email + password (accounts provisioned by
 * Zoustec from the console; players keep LINE OIDC — spec only mandates LINE
 * for the player entry). Two independent sessions:
 *   tenant   — customer (dashboard/builder), requires role=tenant_admin
 *   platform — Zoustec (console), verified against platform_admins
 * Dev fallback (AUTH_DEV_MODE): sign in by seeded dev ID (admin-taipei…).
 */

const TENANT = process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';

const KEYS = { tenant: 'zx_admin_tenant', platform: 'zx_admin_platform' };

export class AuthRequired extends Error {
  constructor(kind) { super('auth required'); this.kind = kind; }
}

export const adminSession = {
  get(kind) {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(KEYS[kind]) || 'null'); } catch { return null; }
  },
  set(kind, data) { localStorage.setItem(KEYS[kind], JSON.stringify(data)); },
  clear(kind) { localStorage.removeItem(KEYS[kind]); },
};

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = err.code;
    throw e;
  }
  return data;
}

async function loginWith(idToken, { platform = false } = {}) {
  if (platform) {
    const out = await post('/api/auth/platform', { id_token: idToken });
    adminSession.set('platform', { token: out.access_token, name: out.display_name, role: 'platform_admin' });
    return out;
  }
  const out = await post('/api/auth/line', { id_token: idToken, tenant_slug: TENANT });
  if (out.role !== 'tenant_admin' && out.role !== 'platform_admin') {
    const e = new Error('此帳號尚未被授權為管理員 — 請聯絡平台方開通權限');
    e.code = 'not_admin';
    throw e;
  }
  adminSession.set('tenant', { token: out.access_token, name: out.display_name, role: out.role });
  return out;
}

/** Zoustec console sign-in — email + password (no LINE round-trip). */
export async function adminLoginPassword(email, password) {
  const out = await post('/api/auth/platform/password', { email, password });
  adminSession.set('platform', { token: out.access_token, name: out.display_name, role: 'platform_admin' });
  return out;
}

/** Customer dashboard sign-in — email + password (account provisioned from
 * the Zoustec console). When the account still holds its provisioning
 * password (must_change_password) the session is NOT stored — the login page
 * forces a password change first, using the returned token in memory. */
export async function adminLoginTenantPassword(email, password) {
  const out = await post('/api/auth/tenant/password', { email, password });
  if (!out.must_change_password) {
    adminSession.set('tenant', { token: out.access_token, name: out.display_name, role: out.role });
  }
  return out;
}

/** First-login (or routine) password change; returns a fresh session and
 * stores it. `token` comes from the pending login response. */
export async function adminChangeTenantPassword(token, currentPassword, newPassword) {
  const res = await fetch('/api/auth/tenant/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = err.code;
    throw e;
  }
  adminSession.set('tenant', { token: data.access_token, name: data.display_name, role: data.role });
  return data;
}

/** Dev sign-in by seeded ID (admin-taipei / admin-mall / platform-boss). */
export async function adminLoginDev(devId, { platform = false } = {}) {
  const id = devId.trim();
  return loginWith(`dev::${id}::${id}`, { platform });
}

export function adminLogout(kind = 'tenant') {
  adminSession.clear(kind);
}

async function request(kind, path, { method = 'GET', body, raw } = {}) {
  const s = adminSession.get(kind);
  if (!s?.token) throw new AuthRequired(kind);
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { adminSession.clear(kind); throw new AuthRequired(kind); }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = err.code;
    throw e;
  }
  return data;
}

/** Tenant-admin API (dashboard/builder). Throws AuthRequired → login screen. */
export async function adminApi(path, opts) { return request('tenant', path, opts); }

/** Platform-admin API (console). */
export async function platformApi(path, opts) { return request('platform', path, opts); }

/** Multipart upload as tenant admin (browser sets the boundary header). */
export async function adminUpload(path, formData) {
  const s = adminSession.get('tenant');
  if (!s?.token) throw new AuthRequired('tenant');
  const res = await fetch(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${s.token}` },
    body: formData,
  });
  if (res.status === 401) { adminSession.clear('tenant'); throw new AuthRequired('tenant'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = err.code;
    throw e;
  }
  return data;
}

/** Download a POST response as a file (export bundle zip). */
export async function adminDownload(path, filename) {
  const res = await adminApi(path, { method: 'POST', raw: true });
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Redirect helper for guarded pages — both back offices use email/password,
 * each behind its own door (/zoustec/login vs /admin/login). */
export function loginUrl(next, { platform = false } = {}) {
  const p = new URLSearchParams({ next });
  return platform ? `/zoustec/login?${p}` : `/admin/login?${p}`;
}
