'use client';

/**
 * Live content refresh for the STATIC export.
 *
 * The static build bakes a content snapshot into the HTML at export time, so
 * the page has real text/images in the markup (crawlers and first paint see the
 * finished site, and it still works with JS disabled). This module then asks the
 * platform whether the admin has edited anything since, and swaps the fresher
 * copy in.
 *
 * WHY NO API KEY HERE: this runs in the visitor's BROWSER, where any bundled
 * secret is readable by everyone. It therefore reads the anonymous public
 * endpoint (GET /api/public/site/...), which returns the same payload the
 * key-authed headless endpoint does — a payload documented as carrying no
 * secrets (public task fields only, no QR tokens). Never put ZOUSTEC_EXPORT_KEY
 * in this file or anything it imports — every NEXT_PUBLIC_ value and every
 * client bundle is shipped to the visitor.
 *
 * Failure is silent BY DESIGN: the baked snapshot is already correct content, so
 * an offline platform simply means the visitor sees the exported version rather
 * than an error.
 */

import { useEffect, useState } from 'react';
import { withAbsoluteMedia } from './site-media';

const API_BASE = (process.env.NEXT_PUBLIC_ZOUSTEC_API_BASE || '').replace(/\/$/, '');
const TENANT = process.env.NEXT_PUBLIC_ZOUSTEC_TENANT_SLUG || '';

/** Absolute URL for the public site payload. `eventSlug` omitted = the tenant's
 * homepage rule decides (same as the platform). */
export function siteUrl(eventSlug) {
  if (!API_BASE || !TENANT) return null;
  const path = eventSlug
    ? `/api/public/site/${TENANT}/${encodeURIComponent(eventSlug)}`
    : `/api/public/site/${TENANT}`;
  return `${API_BASE}${path}`;
}

/**
 * The site payload: the baked snapshot first, replaced by live content once the
 * platform answers.
 *
 * @param baked  snapshot embedded at export time (already media-absolutized)
 * @param eventSlug  omit for the homepage
 * @returns {{site: object, source: 'snapshot'|'api', detail: string}}
 */
export function useLiveSite(baked, eventSlug) {
  const [state, setState] = useState({ site: baked, source: 'snapshot', detail: 'exported copy' });

  useEffect(() => {
    const url = siteUrl(eventSlug);
    if (!url) {
      setState({ site: baked, source: 'snapshot', detail: 'API base/tenant not configured' });
      return;
    }
    // Ignore a late response after the component unmounts or the slug changes.
    let live = true;
    const started = Date.now();
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!live) return;
        // Validate by SHAPE, not by the `mode` field: older snapshots and
        // payloads omit `mode` while still being perfectly renderable, and an
        // error body would otherwise be rendered as if it were a site.
        const usable = data && (data.event?.slug || Array.isArray(data.events));
        if (!usable) throw new Error('unexpected payload');
        setState({
          site: withAbsoluteMedia(data),
          source: 'api',
          detail: `GET ${url} 200 ${Date.now() - started}ms`,
        });
      } catch (err) {
        if (!live) return;
        // Snapshot is valid content — surface the reason without breaking the page.
        setState({ site: baked, source: 'snapshot', detail: `live refresh failed (${err.message})` });
      }
    })();
    return () => { live = false; };
  }, [baked, eventSlug]);

  return state;
}
