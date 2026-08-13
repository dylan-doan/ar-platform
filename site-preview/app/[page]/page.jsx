import { notFound } from 'next/navigation';
import EventSite from '../../components/event/EventSite';
import EventSubPage from '../../components/event/EventSubPage';
import { getSite, SiteNotFound } from '../../lib/site-data';

export const dynamic = 'force-dynamic';

/** A page that exists is reachable even before any block is dropped into it —
 * an empty page renders as empty chrome, not a 404. */
function findPage(site, slug) {
  return (site.event?.config?.pages || []).find((p) => p.slug === slug);
}

/** Same resolution as the exported project: the slug is either a designer
 * sub-page of the homepage event, or a sibling event of the tenant. */
async function resolve(slug) {
  const home = await getSite();
  if (home.mode === 'event') {
    if (home.event?.slug === slug) return { kind: 'event', site: home };
    const page = findPage(home, slug);
    if (page) return { kind: 'page', site: home, page };
  }
  try {
    const site = await getSite(slug);
    if (site.mode === 'event') return { kind: 'event', site };
  } catch (err) {
    if (!(err instanceof SiteNotFound)) throw err;
  }
  return null;
}

export async function generateMetadata({ params }) {
  const hit = await resolve(params.page);
  if (!hit) return { title: '找不到頁面' };
  if (hit.kind === 'event') return { title: `${hit.site.event.name} · 設計預覽` };
  return { title: `${hit.page.title} · ${hit.site.event.name}` };
}

export default async function Page({ params }) {
  const hit = await resolve(params.page);
  if (!hit) notFound();
  if (hit.kind === 'event') return <EventSite site={hit.site} linkBase="" />;
  return <EventSubPage site={hit.site} page={hit.page} linkBase="" />;
}
