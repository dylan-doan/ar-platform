import './globals.css';

export const metadata = { title: 'Zoustec 設計預覽' };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
