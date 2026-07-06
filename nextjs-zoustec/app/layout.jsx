import './globals.css';

export const metadata = {
  title: 'Zoustec AR 體驗平台',
  description: 'AR 集章互動體驗平台 — 6 個核心畫面',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
