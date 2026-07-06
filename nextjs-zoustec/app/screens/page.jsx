import Link from 'next/link';
import { Icon } from '../../components/Icon';

const SCREENS = [
  ['/dashboard', 'layout-dashboard', '客戶管理後台', '活動、任務與即時統計儀表板'],
  ['/builder', 'layout-template', '活動網站產生器', '選範本、拖放編輯、匯出前端範本'],
  ['/ar-studio', 'sparkles', 'AI 3D 生成工具', '上傳 2D 圖，AI 生成 3D 並匯出 WebAR'],
  ['/experience/login', 'scan-line', 'WebAR 體驗 (LINE LIFF)', '參與者任務、AR 掃描與集章'],
  ['/console', 'server', '平台管理後台', 'Zoustec 客戶、流量與營收'],
  ['/', 'compass', '活動入口網站', '對外公開的活動探索入口（首頁）'],
];

export const metadata = { title: '畫面總覽 · Zoustec AR' };

export default function Home() {
  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '72px 32px 80px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--primary-600)', marginBottom: 14 }}>Zoustec · 產品介面系統</div>
      <h1 style={{ margin: 0, fontSize: 48, lineHeight: 1.06, letterSpacing: '-0.03em', fontWeight: 800, color: 'var(--text-strong)', maxWidth: '18ch' }}>AR 集章互動體驗平台</h1>
      <p style={{ margin: '18px 0 0', fontSize: 17, lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: '58ch' }}>白標 SaaS 平台，快速建立活動網站，結合互動任務、WebAR 與 AI 3D 內容生成。以下為 6 個核心畫面。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 18, marginTop: 40 }}>
        {SCREENS.map(([href, icon, title, desc]) => (
          <Link key={href} href={href} style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(145deg,#38B0D6,#0E7490)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}><Icon name={icon} /></span>
            <div style={{ color: 'var(--text-strong)', fontWeight: 800, fontSize: 19, marginTop: 16 }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
