import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import EventSite from '../../../../components/event/EventSite';
import { lastSiteFetchInfo, siteGet } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

const PLATFORM_HOSTS = /(^localhost$)|(\.trycloudflare\.com$)|(\.vercel\.app$)|(\.onrender\.com$)/;

/** On a customer domain the event pages live at /{event-slug} (white-label,
 * PRD §6.2 resolver); on platform hosts at /e/{tenant}/{event-slug}. */
function linkBase(tenant) {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  return host && !PLATFORM_HOSTS.test(host) ? '' : `/e/${tenant}`;
}

export async function generateMetadata({ params }) {
  try {
    const site = await siteGet(params.tenant, params.event);
    const info = lastSiteFetchInfo();
    // The SSR fetch is invisible to the browser's Network tab — record which
    // endpoint served this render so it is checkable in DevTools → Elements.
    return {
      title: `${site.event.name} · ${site.branding.tenant_name}`,
      other: { 'zoustec:source': info.source, 'zoustec:detail': info.detail },
    };
  } catch { return { title: '活動' }; }
}

export default async function Page({ params }) {
  let site;
  try { site = await siteGet(params.tenant, params.event); }
  catch { notFound(); }
  return <EventSite site={site} linkBase={linkBase(params.tenant)} />;
}
