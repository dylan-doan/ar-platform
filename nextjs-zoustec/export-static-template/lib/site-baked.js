/**
 * The content snapshot baked into this static build.
 *
 * Server-side only (no 'use client'): it is read during `next build` to render
 * real HTML, and to enumerate the routes that get exported. Media URLs are made
 * absolute here so the static HTML points at the platform — a static host has no
 * rewrite proxy.
 */

import snapshot from '../data/site.json';
import { withAbsoluteMedia } from './site-media';

/** Media-absolutized snapshot — what the HTML is built from. */
export const bakedSite = withAbsoluteMedia(snapshot);

/** Designer sub-pages of the homepage event, as static routes. */
export function bakedPageSlugs() {
  return (bakedSite.event?.config?.pages || [])
    .filter((p) => p?.slug)
    .map((p) => p.slug);
}

/** Sibling events of this tenant, each served at /{event-slug}. */
export function bakedEventSlugs() {
  const own = bakedSite.event?.slug;
  const others = (bakedSite.other_events || []).map((e) => e.slug).filter(Boolean);
  return own ? [own, ...others] : others;
}

/** Page <title> for a given route, from the baked copy. */
export function bakedTitle(slug) {
  const b = bakedSite.branding || {};
  if (bakedSite.mode === 'landing') {
    return b.landing_title || b.tenant_name || '活動網站';
  }
  const ev = bakedSite.event || {};
  const page = slug && (ev.config?.pages || []).find((p) => p.slug === slug);
  const name = page ? `${page.title || page.slug} · ${ev.name}` : ev.name;
  return b.tenant_name ? `${name} · ${b.tenant_name}` : name;
}
