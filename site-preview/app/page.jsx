import EventSite from '../components/event/EventSite';
import TenantLanding from '../components/event/TenantLanding';
import { getSite } from '../lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const site = await getSite();
  if (site.mode === 'landing') return { title: site.branding.landing_title || site.branding.tenant_name };
  return { title: `${site.event.name} · 設計預覽` };
}

export default async function Page() {
  const site = await getSite();
  if (site.mode === 'landing') return <TenantLanding site={site} linkBase="" />;
  return <EventSite site={site} linkBase="" />;
}
