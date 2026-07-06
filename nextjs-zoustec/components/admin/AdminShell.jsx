'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../Icon';
import { adminLogout, adminSession } from '../../lib/admin-client';

const NAV = [
  { key: 'overview', href: '/dashboard', icon: 'layout-dashboard', label: '總覽' },
  { key: 'builder', href: '/builder', icon: 'calendar-check', label: '活動' },
  { key: 'members', href: '/dashboard/members', icon: 'users', label: '參與者' },
];
const NAV_STATIC = [
  { icon: 'list-checks', label: '任務與集章', href: '/builder' },
  { icon: 'box', label: 'AR / 3D 體驗', href: '/ar-studio' },
  { icon: 'chart-no-axes-column', label: '報表', href: '/dashboard' },
];

function SideLink({ item, active }) {
  const on = active === item.key;
  return (
    <Link href={item.href} style={{display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', borderRadius:'8px', background: on ? 'var(--sidebar-active-bg)' : 'transparent', color: on ? '#fff' : '#B6D4DE', fontSize:'14px', fontWeight: on ? '600' : '500', textDecoration:'none'}}>
      <span style={{fontSize:'19px', display:'inline-flex', lineHeight:'0'}}><Icon name={item.icon} /></span>{item.label}
    </Link>
  );
}

export default function AdminShell({ active, children }) {
  const router = useRouter();
  const s = typeof window !== 'undefined' ? adminSession.get('tenant') : null;

  function logout() {
    adminLogout('tenant');
    router.replace('/admin/login');
  }

  return (
<div className="app-shell">
  {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
  <aside className="app-sidebar">
    <div style={{display:'flex', alignItems:'center', gap:'11px', padding:'4px 8px 22px'}}>
      <div style={{width:'38px', height:'38px', borderRadius:'10px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'20px', boxShadow:'0 4px 10px rgba(0,0,0,.3)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="scan-line" /></span></div>
      <div><div style={{color:'#fff', fontWeight:'800', fontSize:'15px', letterSpacing:'-.01em', whiteSpace:'nowrap'}}>Zoustec AR</div><div style={{color:'#6FCDE8', fontSize:'11px', fontWeight:'600'}}>管理後台</div></div>
    </div>
    <div style={{fontSize:'10px', fontWeight:'700', letterSpacing:'.12em', color:'#4E7A88', padding:'8px 10px 6px'}}>活動</div>
    <SideLink item={NAV[0]} active={active} />
    <SideLink item={NAV[1]} active={active} />
    {NAV_STATIC.slice(0, 1).map((i) => <SideLink key={i.label} item={{ ...i, key: i.label }} active={active} />)}
    <SideLink item={NAV[2]} active={active} />
    {NAV_STATIC.slice(1).map((i) => <SideLink key={i.label} item={{ ...i, key: i.label }} active={active} />)}
    <div style={{fontSize:'10px', fontWeight:'700', letterSpacing:'.12em', color:'#4E7A88', padding:'18px 10px 6px'}}>設定</div>
    <SideLink item={{ key: 'brand', href: '/dashboard/branding', icon: 'palette', label: '品牌與網域' }} active={active} />
    <SideLink item={{ key: 'settings', href: '/dashboard', icon: 'settings', label: '設定' }} active={active} />
    <div style={{marginTop:'auto', display:'flex', alignItems:'center', gap:'11px', padding:'10px', borderTop:'1px solid rgba(255,255,255,.08)'}}>
      <div style={{width:'34px', height:'34px', borderRadius:'9999px', background:'var(--primary-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'13px'}}>{(s?.name || 'A').slice(0, 2)}</div>
      <div style={{flex:'1', minWidth:'0'}}><div style={{color:'#fff', fontSize:'13px', fontWeight:'600', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s?.name || '管理員'}</div><div style={{color:'#6FCDE8', fontSize:'11px'}}>管理員</div></div>
      <button onClick={logout} title="登出" style={{fontSize:'17px', color:'#8FB6C2', display:'inline-flex', lineHeight:'0', background:'none', border:'none', cursor:'pointer', padding:0}}><Icon name="log-out" /></button>
    </div>
  </aside>

  {/* ── Main column ───────────────────────────────────────────────────── */}
  <div className="app-main">
    {children}

    {/* ── Bottom navigation (mobile) ──────────────────────────────────── */}
    <nav className="app-bottom-nav">
      {NAV.map((i) => (
        <Link key={i.key} href={i.href} className={`bn-item${active === i.key ? ' active' : ''}`}>
          <span style={{fontSize:'21px', display:'inline-flex', lineHeight:'0'}}><Icon name={i.icon} /></span>{i.label}
        </Link>
      ))}
      <button onClick={logout} className="bn-item" style={{background:'none', border:'none', cursor:'pointer'}}>
        <span style={{fontSize:'21px', display:'inline-flex', lineHeight:'0'}}><Icon name="log-out" /></span>登出
      </button>
    </nav>
  </div>
</div>
  );
}
