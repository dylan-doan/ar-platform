import Link from 'next/link';
import TenantBrand from '../../components/TenantBrand';

export const metadata = { title: 'WebAR 體驗 · Zoustec AR' };

const STEPS = [
  ['/experience/login', '登入'],
  ['/experience/map', '地圖'],
  ['/experience/ar', 'AR'],
  ['/experience/rewards', '集章'],
];

export default function ExperienceLayout({ children }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#0B2935' }}>
      <TenantBrand />
      <div className="mobile-viewport">{children}</div>

      {/* Demo step switcher — quick navigation between flow screens */}
      <nav style={{ position: 'fixed', bottom: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', gap: '4px', padding: '5px', borderRadius: '9999px', background: 'rgba(11,41,53,.88)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow-lg)' }}>
        {STEPS.map(([href, label], i) => (
          <Link key={href} href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '9999px', color: '#B6D4DE', fontSize: '12px', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,.06)' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '9999px', background: 'rgba(255,255,255,.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{i + 1}</span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
