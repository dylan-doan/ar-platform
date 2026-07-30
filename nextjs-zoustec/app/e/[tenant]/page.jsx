import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import EventSite from '../../../components/event/EventSite';
import TenantLanding from '../../../components/event/TenantLanding';
import { lastSiteFetchInfo, siteGet } from '../../../lib/api';

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
    const site = await siteGet(params.tenant);
    const info = lastSiteFetchInfo();
    // See the note in [event]/page.jsx — makes the SSR fetch observable.
    const other = { 'zoustec:source': info.source, 'zoustec:detail': info.detail };
    if (site.mode === 'landing') return { title: `${site.branding.tenant_name} · 活動`, other };
    return { title: `${site.event.name} · ${site.branding.tenant_name}`, other };
  } catch { return { title: '活動' }; }
}

export default async function Page({ params }) {
  let site;
  try { site = await siteGet(params.tenant); }
  catch { notFound(); }
  const base = linkBase(params.tenant);
  if (site.mode === 'landing') return <TenantLanding site={site} linkBase={base} />;
  return <EventSite site={site} linkBase={base} />;
}
