'use client';

/**
 * Client shell that renders the site and keeps it fresh.
 *
 * It renders the SAME EventSite / EventSubPage / TenantLanding components the
 * platform uses (copied verbatim into this project), so a static site cannot
 * drift from what the designer shows. The only difference from the
 * server-rendered export is WHERE the data comes from: the baked snapshot on
 * first paint, then the public API.
 *
 * Because the initial render uses the baked snapshot — identical to what the
 * static HTML already contains — React hydrates without a mismatch, and the
 * live swap happens in a normal effect afterwards.
 */

import EventSite from './event/EventSite';
import EventSubPage from './event/EventSubPage';
import TenantLanding from './event/TenantLanding';
import { useLiveSite } from '../lib/site-live';

/** Debug marker so "is this live or the exported copy?" is answerable in
 * DevTools → Elements without a terminal (the static host has no server log). */
function SourceMarker({ source, detail }) {
  return <meta name="zoustec:source" content={`${source} — ${detail}`} />;
}

export default function LiveSite({ baked, eventSlug, pageSlug }) {
  const { site, source, detail } = useLiveSite(baked, eventSlug);

  // Landing = a multi-event overview. Detected by shape so a payload without
  // the `mode` field (older exports) still routes correctly.
  if (site?.mode === 'landing' || (!site?.event && Array.isArray(site?.events))) {
    return (
      <>
        <SourceMarker source={source} detail={detail} />
        <TenantLanding site={site} linkBase="" />
      </>
    );
  }

  // A designer sub-page of this event, addressed as /{page-slug}.
  if (pageSlug) {
    const page = (site?.event?.config?.pages || []).find((p) => p.slug === pageSlug);
    // The page can vanish if the admin deleted it since export — fall back to
    // the event home rather than rendering an empty shell.
    if (page) {
      return (
        <>
          <SourceMarker source={source} detail={detail} />
          <EventSubPage site={site} page={page} linkBase="" />
        </>
      );
    }
  }

  return (
    <>
      <SourceMarker source={source} detail={detail} />
      <EventSite site={site} linkBase="" />
    </>
  );
}
