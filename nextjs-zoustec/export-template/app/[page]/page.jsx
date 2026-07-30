import { notFound } from 'next/navigation';
import EventSite from '../../components/event/EventSite';
import EventSubPage from '../../components/event/EventSubPage';
import { getSite, lastFetch } from '../../lib/site-data';

export const dynamic = 'force-dynamic';

function findPage(site, slug) {
  return (site.event?.config?.pages || []).find(
    (p) => p.slug === slug && p.data?.content?.length,
  );
}

/** On a customer domain the event pages live at /{event-slug} (white-label,
 * PRD §6.2 resolver), so this single dynamic segment serves both a sibling
 * event's website and a designer sub-page of the homepage event. */
async function resolve(slug) {
  const home = await getSite();
  if (home.mode === 'event') {
    if (home.event?.slug === slug) return { kind: 'event', site: home };
    const page = findPage(home, slug);
    if (page) return { kind: 'page', site: home, page };
  }
  // Not a sub-page of the homepage event — try it as an event of this tenant.
  try {
    const site = await getSite(slug);
    if (site.mode === 'event') return { kind: 'event', site };
  } catch {
    /* unknown slug — fall through to 404 */
  }
  return null;
}

export async function generateMetadata({ params }) {
  const hit = await resolve(params.page);
  if (!hit) return { title: '找不到頁面' };
  const info = lastFetch();
  const other = { 'zoustec:source': info.source, 'zoustec:detail': info.detail };
  if (hit.kind === 'event') {
    return { title: `${hit.site.event.name} · ${hit.site.branding.tenant_name}`, other };
  }
  return { title: `${hit.page.title} · ${hit.site.event.name}`, other };
}

export default async function Page({ params }) {
  const hit = await resolve(params.page);
  if (!hit) notFound();
  if (hit.kind === 'event') return <EventSite site={hit.site} linkBase="" />;
  return <EventSubPage site={hit.site} page={hit.page} linkBase="" />;
}
