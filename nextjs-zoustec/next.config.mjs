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
  async redirects() {
    // Trang quản trị đã dời vào /admin/* — giữ URL cũ sống (bookmark, liff.state cũ).
    return [
      { source: '/dashboard/:path*', destination: '/admin/dashboard/:path*', permanent: false },
      { source: '/builder/:path*', destination: '/admin/builder/:path*', permanent: false },
      { source: '/ar-studio', destination: '/admin/ar-studio', permanent: false },
      // Console của Zoustec tách khỏi khu khách hàng → /zoustec/*.
      { source: '/console', destination: '/zoustec/console', permanent: false },
      { source: '/admin/console', destination: '/zoustec/console', permanent: false },
    ];
  },
};
export default nextConfig;
