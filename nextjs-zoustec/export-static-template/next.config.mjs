/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Emit a folder of plain .html/.css/.js — no Node server needed. `npm run
  // build` writes ./out, which you upload to ANY static host (cPanel, Netlify,
  // Vercel, S3, nginx…).
  output: 'export',

  // Static hosts serve /about as /about/index.html — trailing slashes keep the
  // links working on every host, including plain nginx/Apache without rewrite
  // rules.
  trailingSlash: true,

  // next/image needs a server to optimize; a static export cannot run one.
  images: { unoptimized: true },
};

export default nextConfig;
