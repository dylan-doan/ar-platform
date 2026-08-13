/**
 * Pull the SHARED renderer files from the platform app into this viewer.
 *
 * The viewer must render a design EXACTLY as the platform does, so it never
 * owns renderer code — it copies the platform's files verbatim (same rule as
 * the Next.js project export). Run after any platform change to
 * lib/site-blocks.jsx & friends:
 *
 *     npm run sync            # from site-preview/
 *
 * PLATFORM_DIR overrides the source (default: ../nextjs-zoustec, the monorepo
 * layout). The copies are committed so a standalone clone works without the
 * platform repo present.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const platform = resolve(root, process.env.PLATFORM_DIR || '../nextjs-zoustec');

// Same list as SHARED_FILES in app/api/export-nextjs/route.js — one renderer,
// copied verbatim, everywhere a customer site is drawn.
const SHARED = [
  'lib/site-blocks.jsx',
  'lib/brand.js',
  'components/Icon.jsx',
  'components/event/EventSite.jsx',
  'components/event/EventSubPage.jsx',
  'components/event/SiteBody.jsx',
  'components/event/EventSections.jsx',
  'components/event/JoinCta.jsx',
  'components/event/TenantLanding.jsx',
];

// The site stylesheet ships with the export template.
const EXTRA = [['export-template/app/globals.css', 'app/globals.css']];

for (const rel of SHARED) {
  const dest = join(root, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(platform, rel), dest);
  console.log(`synced ${rel}`);
}
for (const [src, rel] of EXTRA) {
  const dest = join(root, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(platform, src), dest);
  console.log(`synced ${rel} (from ${src})`);
}
console.log('done — viewer renderer now matches the platform.');
