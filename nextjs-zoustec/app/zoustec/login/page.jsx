'use client';

/**
 * Zoustec console sign-in — email + password. The console is the PLATFORM's
 * internal back office (not a customer surface), so no LINE round-trip here;
 * customers keep LINE at /admin/login. Account seeded from
 * PLATFORM_ADMIN_EMAIL/PASSWORD env (backend db/seed.py).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import { adminLoginDev, adminLoginPassword, adminSession } from '../../../lib/admin-client';

export default function Page() {
  const router = useRouter();
  const [next, setNext] = useState('/zoustec/console');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devId, setDevId] = useState('');
  const [showDev, setShowDev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dest = params.get('next') || '/zoustec/console';
    setNext(dest);
    // Already signed in → straight through.
    if (adminSession.get('platform')?.token) router.replace(dest);
  }, [router]);

  async function withBusy(fn) {
    setBusy(true); setError('');
    try {
      await fn();
      router.replace(next);
    } catch (e) {
      setError(e.code === 'invalid_credentials' ? 'Email 或密碼不正確' : e.status === 403 ? '此帳號沒有平台管理權限' : e.message || '登入失敗');
    } finally { setBusy(false); }
  }

  function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('請輸入 Email 與密碼');
    withBusy(() => adminLoginPassword(email.trim(), password));
  }

  return (
<div className="page-full" style={{display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(150deg,#134E61,#0B2935)', padding:'20px'}}>
  <div style={{width:'100%', maxWidth:'400px', background:'#fff', borderRadius:'18px', boxShadow:'var(--shadow-xl)', padding:'30px 26px'}}>
    <div style={{display:'flex', alignItems:'center', gap:'11px', marginBottom:'6px'}}>
      <div style={{width:'42px', height:'42px', borderRadius:'11px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'22px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="server" /></span></div>
      <div>
        <div style={{fontWeight:'800', fontSize:'17px', color:'var(--text-strong)'}}>Zoustec AR</div>
        <div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>平台管理後台 (Zoustec)</div>
      </div>
    </div>
    <p style={{fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, margin:'14px 0 22px'}}>
      內部後台 — 請使用平台管理員帳號登入。
    </p>

    {error && <div style={{padding:'11px 14px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'14px'}}>{error}</div>}

    <form onSubmit={submit}>
      <label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.06em', marginBottom:'6px'}}>EMAIL</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="admin@zoustec.tw"
        style={{width:'100%', height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', marginBottom:'14px'}} />
      <label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.06em', marginBottom:'6px'}}>密碼</label>
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••"
        style={{width:'100%', height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', marginBottom:'18px'}} />
      <button type="submit" disabled={busy}
        style={{width:'100%', height:'50px', borderRadius:'12px', background:'var(--primary-600)', color:'#fff', fontSize:'15px', fontWeight:'800', border:'none', cursor:'pointer', opacity:busy ? .6 : 1}}>
        {busy ? '登入中…' : '登入'}
      </button>
    </form>

    {/* Dev-mode sign-in (AUTH_DEV_MODE backend) */}
    {showDev ? (
      <div style={{marginTop:'14px'}}>
        <div style={{fontSize:'11px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.06em', marginBottom:'7px'}}>開發模式 · DEV ID</div>
        <div style={{display:'flex', gap:'8px'}}>
          <input value={devId} onChange={(e) => setDevId(e.target.value)} placeholder="platform-boss"
            style={{flex:1, height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', fontFamily:'var(--font-mono)'}} />
          <button onClick={() => withBusy(() => adminLoginDev(devId || 'platform-boss', { platform: true }))} disabled={busy}
            style={{height:'46px', padding:'0 18px', borderRadius:'10px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity:busy ? .6 : 1}}>登入</button>
        </div>
      </div>
    ) : (
      <button onClick={() => setShowDev(true)} style={{marginTop:'10px', background:'none', border:'none', color:'var(--text-subtle)', fontSize:'11px', fontWeight:'600', cursor:'pointer', padding:0}}>或使用開發模式測試</button>
    )}

    <div style={{marginTop:'22px', paddingTop:'16px', borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <a href="/admin/login" style={{color:'var(--primary-600)', fontSize:'12px', fontWeight:'700', textDecoration:'none'}}>← 客戶管理員登入</a>
      <span style={{fontSize:'11px', color:'var(--text-subtle)'}}>Powered by Zoustec</span>
    </div>
  </div>
</div>
  );
}
