/**
 * One dynamic segment serving both a designer sub-page of the homepage event
 * and a sibling event of this tenant — the same white-label URL shape
 * (/{slug}) the server-rendered export uses.
 *
 * Static export needs every route enumerated at build time, so the list comes
 * from the baked snapshot. A page the admin adds AFTER this export exists on the
 * platform but has no HTML file here until the customer re-exports; the nav link
 * would 404 on a static host. That is the one real cost of going static, and the
 * README says so.
 */

import LiveSite from '../../components/LiveSite';
import { bakedEventSlugs, bakedPageSlugs, bakedSite, bakedTitle } from '../../lib/site-baked';

export function generateStaticParams() {
  const slugs = new Set([...bakedPageSlugs(), ...bakedEventSlugs()]);
  return [...slugs].map((page) => ({ page }));
}

export function generateMetadata({ params }) {
  return { title: bakedTitle(params.page) };
}

export default function Page({ params }) {
  const { page } = params;
  const isSubPage = bakedPageSlugs().includes(page);
  // A sub-page renders inside the event chrome; a sibling event slug renders
  // that event's own site (its content arrives live — the snapshot only holds
  // the exported event, so the baked pass shows the homepage event).
  return (
    <LiveSite
      baked={bakedSite}
      eventSlug={isSubPage ? undefined : page}
      pageSlug={isSubPage ? page : undefined}
    />
  );
}
