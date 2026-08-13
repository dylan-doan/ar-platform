import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import EventSubPage from '../../../../../components/event/EventSubPage';
import { siteGet } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

const PLATFORM_HOSTS = /(^localhost$)|(\.trycloudflare\.com$)|(\.vercel\.app$)|(\.onrender\.com$)/;

/** Same white-label rule as the event page: on a customer domain the pages
 * live at /{event-slug}/{page-slug} (middleware rewrite keeps the URL). */
function linkBase(tenant) {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  return host && !PLATFORM_HOSTS.test(host) ? '' : `/e/${tenant}`;
}

/** A page that exists is reachable even before any block is dropped into it —
 * an empty page renders as empty chrome, not a 404. */
function findPage(site, slug) {
  return (site?.event?.config?.pages || []).find((p) => p.slug === slug);
}

export async function generateMetadata({ params }) {
  try {
    const site = await siteGet(params.tenant, params.event);
    const page = findPage(site, params.page);
    return { title: page ? `${page.title} · ${site.event.name}` : site.event.name };
  } catch { return { title: '活動' }; }
}

export default async function Page({ params, searchParams }) {
  let site;
  // ?draft=<token> also works on sub-pages, so a draft that ADDS a page is
  // previewable at its final URL before publish.
  try { site = await siteGet(params.tenant, params.event, searchParams?.draft); }
  catch { notFound(); }
  const page = findPage(site, params.page);
  if (!page) notFound();
  return <EventSubPage site={site} page={page} linkBase={linkBase(params.tenant)} />;
}
