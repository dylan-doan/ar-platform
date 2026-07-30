/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // This site is server-rendered, so its platform fetches run in Node and are
  // invisible to the browser's Network tab. Next's built-in fetch logging
  // prints each server-side request to the terminal running the site — use it
  // (plus /api/zoustec-status) to verify which API a page really called.
  logging: { fetches: { fullUrl: true } },

  async rewrites() {
    // Content stores RELATIVE media URLs (/media/db/…) — proxy those to the
    // platform so images resolve from this site's own origin (no CORS).
    //
    // Only /media is proxied on purpose: forwarding all of /api would turn this
    // customer site into an open gateway to the whole platform API, and would
    // also shadow this project's own /api routes. Page data is fetched
    // server-side in lib/site-data.js, where the key stays private.
    const base = process.env.ZOUSTEC_API_BASE;
    if (!base) return [];
    return [{ source: '/media/:path*', destination: `${base}/media/:path*` }];
  },
};

export default nextConfig;
