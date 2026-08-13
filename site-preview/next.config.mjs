/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Server-side platform fetches are invisible to the browser — Next's fetch
  // logging prints each one to the terminal running `npm run dev`.
  logging: { fetches: { fullUrl: true } },

  async rewrites() {
    // Content stores RELATIVE media URLs (/media/db/…) — proxy those to the
    // platform so images resolve from this viewer's own origin (no CORS).
    const base = (process.env.ZOUSTEC_API_BASE || 'https://zoustec-backend.onrender.com').replace(/\/$/, '');
    return [{ source: '/media/:path*', destination: `${base}/media/:path*` }];
  },
};

export default nextConfig;
