'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import { adminLoginDev, adminLoginLine, adminSession, hasLiff, liffLoggedIn } from '../../../lib/admin-client';

export default function Page() {
  const router = useRouter();
  const [platform, setPlatform] = useState(false);
  const [next, setNext] = useState('');
  const [devId, setDevId] = useState('');
  const [showDev, setShowDev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const isPlatform = params.get('mode') === 'platform';
      const dest = params.get('next') || (isPlatform ? '/zoustec/console' : '/admin/dashboard');
      setPlatform(isPlatform);
      setNext(dest);
      // Already signed in → straight through.
      const s = adminSession.get(isPlatform ? 'platform' : 'tenant');
      if (s?.token) return router.replace(dest);
      // Returning from the LINE OAuth redirect (or LINE session already held):
      // liff.init consumes the ?code=… — complete the sign-in automatically.
      const logged = await liffLoggedIn();
      if (logged) {
        setBusy(true); setError('');
        try {
          await adminLoginLine({ platform: isPlatform });
          return router.replace(dest);
        } catch (e) {
          setError(e.code === 'not_admin' ? e.message : e.status === 403 ? '此帳號沒有管理權限' : e.message || '登入失敗');
        } finally { setBusy(false); }
      }
    })();
  }, [router]);

  async function withBusy(fn) {
    setBusy(true); setError('');
    try {
      await fn();
      router.replace(next || (platform ? '/zoustec/console' : '/admin/dashboard'));
    } catch (e) {
      setError(e.code === 'not_admin' ? e.message : e.status === 403 ? '此帳號沒有管理權限' : e.message || '登入失敗');
    } finally { setBusy(false); }
  }

  const kindLabel = platform ? '平台管理後台 (Zoustec)' : '客戶管理後台';

  return (
<div className="page-full" style={{display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(150deg,#134E61,#0B2935)', padding:'20px'}}>
  <div style={{width:'100%', maxWidth:'400px', background:'#fff', borderRadius:'18px', boxShadow:'var(--shadow-xl)', padding:'30px 26px'}}>
    <div style={{display:'flex', alignItems:'center', gap:'11px', marginBottom:'6px'}}>
      <div style={{width:'42px', height:'42px', borderRadius:'11px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'22px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={platform ? 'server' : 'scan-line'} /></span></div>
      <div>
        <div style={{fontWeight:'800', fontSize:'17px', color:'var(--text-strong)'}}>Zoustec AR</div>
        <div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>{kindLabel}</div>
      </div>
    </div>
    <p style={{fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, margin:'14px 0 22px'}}>
      {platform
        ? '請使用已註冊的平台管理員 LINE 帳號登入。'
        : '請使用貴組織的管理員 LINE 帳號登入。帳號需由平台方授權。'}
    </p>

    {error && <div style={{padding:'11px 14px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'14px'}}>{error}</div>}

    {hasLiff() && (
      <button onClick={() => withBusy(() => adminLoginLine({ platform }))} disabled={busy}
        style={{width:'100%', height:'50px', borderRadius:'12px', background:'#06C755', color:'#fff', fontSize:'15px', fontWeight:'800', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', opacity:busy ? .6 : 1}}>
        <span style={{width:'26px', height:'26px', borderRadius:'6px', background:'#fff', color:'#06C755', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:'900', fontSize:'13px'}}>L</span>
        {busy ? '登入中…' : '使用 LINE 登入'}
      </button>
    )}

    {/* Dev-mode sign-in (AUTH_DEV_MODE backend) */}
    {(!hasLiff() || showDev) ? (
      <div style={{marginTop:'14px'}}>
        <div style={{fontSize:'11px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.06em', marginBottom:'7px'}}>開發模式 · DEV ID</div>
        <div style={{display:'flex', gap:'8px'}}>
          <input value={devId} onChange={(e) => setDevId(e.target.value)}
            placeholder={platform ? 'platform-boss' : 'admin-taipei / admin-mall'}
            style={{flex:1, height:'46px', borderRadius:'10px', border:'1px solid var(--border-default)', padding:'0 13px', fontSize:'14px', fontWeight:'600', color:'var(--text-strong)', outline:'none', fontFamily:'var(--font-mono)'}} />
          <button onClick={() => withBusy(() => adminLoginDev(devId || (platform ? 'platform-boss' : 'admin-taipei'), { platform }))} disabled={busy}
            style={{height:'46px', padding:'0 18px', borderRadius:'10px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity:busy ? .6 : 1}}>登入</button>
        </div>
      </div>
    ) : (
      <button onClick={() => setShowDev(true)} style={{marginTop:'10px', background:'none', border:'none', color:'var(--text-subtle)', fontSize:'11px', fontWeight:'600', cursor:'pointer', padding:0}}>或使用開發模式測試</button>
    )}

    <div style={{marginTop:'22px', paddingTop:'16px', borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <a href="/zoustec/login" style={{color:'var(--primary-600)', fontSize:'12px', fontWeight:'700', textDecoration:'none'}}>Zoustec 平台管理員 →</a>
      <span style={{fontSize:'11px', color:'var(--text-subtle)'}}>Powered by Zoustec</span>
    </div>
  </div>
</div>
  );
}
