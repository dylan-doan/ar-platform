import EventSite from '../components/event/EventSite';
import TenantLanding from '../components/event/TenantLanding';
import { getSite, lastFetch } from '../lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const site = await getSite();
  const info = lastFetch();
  // Where this render's data came from — readable in DevTools → Elements
  // (<head>) without a terminal, since the SSR fetch itself is invisible to the
  // browser. /api/zoustec-status gives the same answer as a real request.
  const other = { 'zoustec:source': info.source, 'zoustec:detail': info.detail };
  if (site.mode === 'landing') {
    return { title: site.branding.landing_title || site.branding.tenant_name, other };
  }
  return { title: `${site.event.name} · ${site.branding.tenant_name}`, other };
}

export default async function Page() {
  const site = await getSite();
  // Several active events and no pinned homepage → branded overview, the same
  // rule the platform applies (brand_config.home_mode). linkBase '' keeps the
  // white-label URLs (/{event-slug}) that this project serves.
  if (site.mode === 'landing') return <TenantLanding site={site} linkBase="" />;
  return <EventSite site={site} linkBase="" />;
}
