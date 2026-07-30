import EventSite from '../components/event/EventSite';
import TenantLanding from '../components/event/TenantLanding';
import SiteLockedScreen from '../components/SiteLockedScreen';
import { getSite, lastFetch, SiteLocked } from '../lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  let site;
  try {
    site = await getSite();
  } catch (err) {
    // A locked site must never be indexed as if it were real content.
    if (err instanceof SiteLocked) {
      return {
        title: '網站尚未啟用',
        robots: { index: false, follow: false },
        other: { 'zoustec:source': 'locked', 'zoustec:detail': err.reason },
      };
    }
    throw err;
  }
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
  let site;
  try {
    site = await getSite();
  } catch (err) {
    // Bad/missing key → refuse to render rather than silently serving the
    // offline snapshot, which would hide a dead credential.
    if (err instanceof SiteLocked) return <SiteLockedScreen reason={err.reason} />;
    throw err;
  }
  // Several active events and no pinned homepage → branded overview, the same
  // rule the platform applies (brand_config.home_mode). linkBase '' keeps the
  // white-label URLs (/{event-slug}) that this project serves.
  if (site.mode === 'landing') return <TenantLanding site={site} linkBase="" />;
  return <EventSite site={site} linkBase="" />;
}
