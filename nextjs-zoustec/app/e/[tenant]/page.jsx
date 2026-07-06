import { notFound } from 'next/navigation';
import EventSite from '../../../components/event/EventSite';
import { publicGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  try {
    const site = await publicGet(`/api/public/site/${params.tenant}`);
    return { title: `${site.event.name} · ${site.branding.tenant_name}` };
  } catch { return { title: '活動' }; }
}

export default async function Page({ params }) {
  let site;
  try { site = await publicGet(`/api/public/site/${params.tenant}`); }
  catch { notFound(); }
  return <EventSite site={site} />;
}
