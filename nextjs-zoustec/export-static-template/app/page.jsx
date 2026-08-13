/**
 * Homepage of the static site.
 *
 * Rendered at BUILD time from the baked snapshot, so the exported index.html
 * contains the real content (SEO + works without JS). LiveSite then refreshes it
 * from the public API in the browser.
 */

import LiveSite from '../components/LiveSite';
import { bakedSite, bakedTitle } from '../lib/site-baked';

export function generateMetadata() {
  return { title: bakedTitle() };
}

export default function Page() {
  return <LiveSite baked={bakedSite} />;
}
