/**
 * Sync status of this site — a request you CAN see in the browser.
 *
 * The page itself is server-rendered, so its platform fetch never appears in
 * DevTools → Network. Open this route (or watch it in Network after the page
 * loads) to confirm exactly which endpoint the last render used, whether it hit
 * the API or fell back to the offline snapshot, and how long it took.
 *
 *   curl http://localhost:3000/api/zoustec-status
 *
 * Read-only diagnostics: it never returns the API key, only its prefix.
 */

import { NextResponse } from 'next/server';
import { getSite, lastFetch } from '../../../lib/site-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Trigger a real read so the answer reflects a live call, not a stale note.
  let payload = null;
  try {
    payload = await getSite();
  } catch {
    /* reported via lastFetch() below */
  }

  const key = process.env.ZOUSTEC_EXPORT_KEY || '';
  const info = lastFetch();

  return NextResponse.json(
    {
      source: info.source, // "api" = live platform data, "snapshot" = offline fallback
      detail: info.detail,
      config: {
        api_base: process.env.ZOUSTEC_API_BASE || null,
        tenant_slug: process.env.ZOUSTEC_TENANT_SLUG || null,
        key_configured: Boolean(key),
        key_prefix: key ? key.slice(0, 12) : null,
        revalidate_seconds: Number(process.env.ZOUSTEC_REVALIDATE ?? 0),
      },
      content: payload && {
        mode: payload.mode,
        tenant: payload.branding?.tenant_name,
        event: payload.event?.slug,
        tasks: payload.tasks?.length,
        events: payload.events?.length,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
