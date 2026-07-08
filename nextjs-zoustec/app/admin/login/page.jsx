'use client';

/**
 * Customer dashboard sign-in — email + password. Accounts are provisioned by
 * Zoustec from the platform console with a temporary password; on first login
 * the account must set its own password before the session is stored (the
 * pending token lives only in page state). Players keep LINE login — the spec
 * mandates LINE only for the player entry, admin auth is a platform choice.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import {
  adminChangeTenantPassword,
  adminLoginDev,
  adminLoginTenantPassword,
  adminSession,
} from '../../../lib/admin-client';

export default function Page() {
  const router = useRouter();
  const [next, setNext] = useState('/admin/dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devId, setDevId] = useState('');
  const [showDev, setShowDev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // First-login flow: token held in memory until the password is changed.
  const [pending, setPending] = useState(null); // { token, name }
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Legacy links: the platform console sign-in moved to /zoustec/login.
    if (params.get('mode') === 'platform') {
      const dest = params.get('next') || '/zoustec/console';
      return router.replace(`/zoustec/login?next=${encodeURIComponent(dest)}`);
    }
    const dest = params.get('next') || '/admin/dashboard';
    setNext(dest);
    // Already signed in → straight through.
    if (adminSession.get('tenant')?.token) router.replace(dest);
  }, [router]);

  async function withBusy(fn) {
    setBusy(true); setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e.code === 'invalid_credentials' ? e.message || 'Email 或密碼不正確'
        : e.status === 403 ? '此帳號沒有管理權限' : e.message || '登入失敗');
    } finally { setBusy(false); }
  }

  function submitLogin(e) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('請輸入 Email 與密碼');
    withBusy(async () => {
      const out = await adminLoginTenantPassword(email.trim(), password);
      if (out.must_change_password) {
        setPending({ token: out.access_token, name: out.display_name });
      } else {
        router.replace(next);
      }
    });
  }

  function submitChange(e) {
    e.preventDefault();
    if (newPw.length < 8) return setError('新密碼至少 8 個字元');
    if (newPw !== newPw2) return setError('兩次輸入的新密碼不一致');
    withBusy(async () => {
      await adminChangeTenantPassword(pending.token, password, newPw);
      router.replace(next);
    });
  }

  const inputStyle = {width:'100%', height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', marginBottom:'14px'};
  const labelStyle = {display:'block', fontSize:'11px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.06em', marginBottom:'6px'};

  return (
<div className="page-full" style={{display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(150deg,#134E61,#0B2935)', padding:'20px'}}>
  <div style={{width:'100%', maxWidth:'400px', background:'#fff', borderRadius:'18px', boxShadow:'var(--shadow-xl)', padding:'30px 26px'}}>
    <div style={{display:'flex', alignItems:'center', gap:'11px', marginBottom:'6px'}}>
      <div style={{width:'42px', height:'42px', borderRadius:'11px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'22px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="scan-line" /></span></div>
      <div>
        <div style={{fontWeight:'800', fontSize:'17px', color:'var(--text-strong)'}}>Zoustec AR</div>
        <div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>客戶管理後台</div>
      </div>
    </div>

    {error && <div style={{padding:'11px 14px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', margin:'14px 0'}}>{error}</div>}

    {!pending ? (
      <>
        <p style={{fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, margin:'14px 0 22px'}}>
          請使用平台方提供的管理員帳號登入。
        </p>
        <form onSubmit={submitLogin}>
          <label style={labelStyle}>EMAIL</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="admin@your-org.tw" style={inputStyle} />
          <label style={labelStyle}>密碼</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" style={{...inputStyle, marginBottom:'18px'}} />
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
              <input value={devId} onChange={(e) => setDevId(e.target.value)} placeholder="admin-taipei / admin-mall"
                style={{flex:1, height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', fontFamily:'var(--font-mono)'}} />
              <button onClick={() => withBusy(async () => { await adminLoginDev(devId || 'admin-taipei', { platform: false }); router.replace(next); })} disabled={busy}
                style={{height:'46px', padding:'0 18px', borderRadius:'10px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity:busy ? .6 : 1}}>登入</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowDev(true)} style={{marginTop:'10px', background:'none', border:'none', color:'var(--text-subtle)', fontSize:'11px', fontWeight:'600', cursor:'pointer', padding:0}}>或使用開發模式測試</button>
        )}
      </>
    ) : (
      <>
        <p style={{fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, margin:'14px 0 18px'}}>
          {pending.name ? `${pending.name}，` : ''}首次登入請設定您自己的密碼（暫時密碼將失效）。
        </p>
        <form onSubmit={submitChange}>
          <label style={labelStyle}>新密碼（至少 8 個字元）</label>
          <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" style={inputStyle} />
          <label style={labelStyle}>再次輸入新密碼</label>
          <input value={newPw2} onChange={(e) => setNewPw2(e.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" style={{...inputStyle, marginBottom:'18px'}} />
          <button type="submit" disabled={busy}
            style={{width:'100%', height:'50px', borderRadius:'12px', background:'var(--primary-600)', color:'#fff', fontSize:'15px', fontWeight:'800', border:'none', cursor:'pointer', opacity:busy ? .6 : 1}}>
            {busy ? '儲存中…' : '設定密碼並進入後台'}
          </button>
        </form>
        <button onClick={() => { setPending(null); setNewPw(''); setNewPw2(''); setError(''); }}
          style={{marginTop:'10px', background:'none', border:'none', color:'var(--text-subtle)', fontSize:'11px', fontWeight:'600', cursor:'pointer', padding:0}}>← 返回登入</button>
      </>
    )}

    <div style={{marginTop:'22px', paddingTop:'16px', borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <a href="/zoustec/login" style={{color:'var(--primary-600)', fontSize:'12px', fontWeight:'700', textDecoration:'none'}}>Zoustec 平台管理員 →</a>
      <span style={{fontSize:'11px', color:'var(--text-subtle)'}}>Powered by Zoustec</span>
    </div>
  </div>
</div>
  );
}
