/** @type {import('next').NextConfig} */
const nextConfig = {
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
};
export default nextConfig;
