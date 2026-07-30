/** @type {import('next').NextConfig} */
const nextConfig = {
  // Customer sites are server-rendered, so their platform fetches happen in
  // Node and never appear in the browser's Network tab. Next's built-in fetch
  // logging prints every server-side request (URL + cache hit/miss) to the
  // terminal, which is how you verify which API a page actually called.
  logging: { fetches: { fullUrl: true } },

  async rewrites() {
    // Same-origin proxy: browser calls /api/* and Next forwards to FastAPI —
    // no CORS, one tunnel/domain in front of everything.
    const backend = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
      { source: '/healthz', destination: `${backend}/healthz` },
    ];
  },
  async redirects() {
    // Admin pages moved under /admin/* — keep old URLs alive (bookmarks, old liff.state).
    return [
      { source: '/dashboard/:path*', destination: '/admin/dashboard/:path*', permanent: false },
      { source: '/builder/:path*', destination: '/admin/builder/:path*', permanent: false },
      { source: '/ar-studio', destination: '/admin/ar-studio', permanent: false },
      // The Zoustec console is split off from the customer area → /zoustec/*.
      { source: '/console', destination: '/zoustec/console', permanent: false },
      { source: '/admin/console', destination: '/zoustec/console', permanent: false },
    ];
  },
};
export default nextConfig;
