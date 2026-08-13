import './globals.css';
import './custom.css';

export const metadata = { title: '活動網站' };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
