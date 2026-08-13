/**
 * Viewer data loader: LIVE event data from the platform + LOCAL design file.
 *
 * The whole point of this tool: a dev edits data/design.json in their editor,
 * refreshes the browser, and sees the site EXACTLY as the platform will render
 * it after upload — same renderer files (npm run sync), same payload endpoint,
 * only the design overlaid from the local file.
 *
 * Data comes from the public read endpoint (GET /api/public/site/…, no key,
 * wildcard CORS on the platform), so real tasks/stats/branding flow in. If the
 * platform is unreachable the viewer still renders the design over a stub
 * payload, so pure-offline design work stays possible.
 *
 * The overlay mirrors app/services/site_design.py::apply_design on the
 * backend: design-owned keys ({puck, pages, header, footer}) replace the
 * config's, event-owned root props (title/slug/…) always come from the event
 * record — what you see here is what publish will produce.
 */

import design from '../data/design.json';

const API_BASE = (process.env.ZOUSTEC_API_BASE || 'https://zoustec-backend.onrender.com').replace(/\/$/, '');
const TENANT_SLUG = process.env.ZOUSTEC_TENANT_SLUG || '';
const EVENT_SLUG = process.env.ZOUSTEC_EVENT_SLUG || '';

/** Puck's renderer hard-requires root/zones on every doc and a unique
 * props.id on every block; the designer writes them, a hand-edited file often
 * doesn't. Fill them in (mirror of backend _normalize_doc) so a missing
 * scaffold renders instead of crashing the preview. */
function normalizeDoc(doc, ids, counter) {
  if (!doc || typeof doc !== 'object') return null;
  const stamp = (items) => (items || []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    b.props = b.props || {};
    if (typeof b.props.id !== 'string' || !b.props.id || ids.has(b.props.id)) {
      do { counter.n += 1; b.props.id = `${b.type}-${counter.n}`; } while (ids.has(b.props.id));
    }
    ids.add(b.props.id);
    Object.values(b.props).forEach((v) => {
      if (Array.isArray(v) && v[0]?.type) stamp(v);
    });
  });
  const root = typeof doc.root === 'object' && doc.root ? doc.root : {};
  const out = {
    ...doc,
    root: { ...root, props: typeof root.props === 'object' && root.props ? root.props : {} },
    zones: typeof doc.zones === 'object' && doc.zones ? doc.zones : {},
    content: doc.content || [],
  };
  stamp(out.content);
  Object.values(out.zones).forEach(stamp);
  return out;
}

/** Unwrap the two accepted file shapes (same rule as the designer's import):
 * a designer JSON export, or a data/site.json snapshot from an old export. */
function designConfig() {
  const raw = design?.event?.config || design?.config || design;
  if (!raw || typeof raw !== 'object' || !raw.puck) return null;
  const ids = new Set();
  const counter = { n: 0 };
  return {
    ...raw,
    puck: normalizeDoc(raw.puck, ids, counter),
    pages: (raw.pages || []).map((p) => ({ ...p, data: normalizeDoc(p.data, ids, counter) })),
    header: normalizeDoc(raw.header, ids, counter),
    footer: normalizeDoc(raw.footer, ids, counter),
  };
}

/** The event the local design belongs to (its event-owned root slug survives
 * in exports); sibling events browsed in the viewer stay un-overlaid. */
function designTargetSlug() {
  return EVENT_SLUG || designConfig()?.puck?.root?.props?.slug || null;
}

function overlay(payload) {
  const cfg = designConfig();
  if (!cfg || payload.mode !== 'event') return payload;
  const target = designTargetSlug();
  if (target && payload.event.slug !== target) return payload;

  const eventCfg = payload.event.config || {};
  const puck = { ...(cfg.puck || {}) };
  const root = { ...(puck.root || {}) };
  // Event-owned root props come from the live event record — the backend
  // strips + re-injects them on upload, so the viewer must too.
  root.props = {
    ...(root.props || {}),
    title: payload.event.name,
    slug: payload.event.slug,
    description: payload.event.description || '',
    heroImage: eventCfg.heroImage || '',
    rewardName: payload.event.reward_name || '',
    rewardThreshold: payload.event.reward_threshold || 1,
  };
  puck.root = root;

  return {
    ...payload,
    event: {
      ...payload.event,
      config: {
        ...eventCfg,
        puck,
        pages: cfg.pages || [],
        header: cfg.header || null,
        footer: cfg.footer || null,
        puckVersion: 2,
      },
    },
  };
}

/** Minimal payload so the viewer renders the local design even with no
 * platform reachable — placeholder branding, no live tasks/stats. */
function offlineStub() {
  const cfg = designConfig() || { puck: { root: { props: {} }, content: [] } };
  const props = cfg.puck?.root?.props || {};
  return {
    mode: 'event',
    branding: {
      tenant_slug: TENANT_SLUG || 'preview',
      tenant_name: 'Zoustec 預覽（離線）',
      logo_url: null,
      theme_color: '#0ea5e9',
      show_powered_by: true,
      line_liff_id: null,
    },
    event: {
      id: 'offline-preview',
      slug: props.slug || 'preview',
      name: props.title || '設計預覽',
      description: props.description || '',
      event_type: 'city',
      config: cfg,
      reward_threshold: props.rewardThreshold || 1,
      reward_name: props.rewardName || '',
    },
    tasks: [],
    other_events: [],
  };
}

export class SiteNotFound extends Error {}

export async function getSite(eventSlug) {
  if (!TENANT_SLUG) {
    console.log('[preview] ZOUSTEC_TENANT_SLUG 未設定 — 以離線模式渲染 data/design.json');
    return overlay(offlineStub());
  }
  const slug = eventSlug || EVENT_SLUG || designTargetSlug();
  const path = slug
    ? `/api/public/site/${TENANT_SLUG}/${encodeURIComponent(slug)}`
    : `/api/public/site/${TENANT_SLUG}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (res.status === 404) throw new SiteNotFound(path);
    if (!res.ok) {
      console.log(`[preview] GET ${path} ${res.status} — 改用離線 stub`);
      return overlay(offlineStub());
    }
    return overlay(await res.json());
  } catch (err) {
    if (err instanceof SiteNotFound) throw err;
    console.log(`[preview] 無法連線平台（${err.message}）— 改用離線 stub`);
    return overlay(offlineStub());
  }
}
