'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import AdminShell from '../../../components/admin/AdminShell';
import { adminApi, adminUpload, AuthRequired, loginUrl } from '../../../lib/admin-client';

const PRESETS = ['#0E7490', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5'];

export default function Page() {
  const router = useRouter();
  const [brand, setBrand] = useState(null);   // server truth
  const [form, setForm] = useState(null);     // {logo_url, theme_color}
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const b = await adminApi('/api/admin/branding');
        setBrand(b);
        setForm({ logo_url: b.logo_url || '', theme_color: b.theme_color || '#0E7490', custom_domain: b.custom_domain || '' });
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/dashboard/branding'));
        setError(e.message);
      }
    })();
  }, [router]);

  function note(m) { setFlash(m); setTimeout(() => setFlash(''), 2500); }

  async function uploadLogo(file) {
    if (!file || busy) return;
    setBusy('logo'); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const out = await adminUpload('/api/admin/media', fd);
      setForm({ ...form, logo_url: out.url });
      note('Logo 已上傳 — 按「儲存」生效');
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  async function save() {
    if (busy || !form) return;
    setBusy('save'); setError('');
    try {
      const body = { logo_url: form.logo_url || null, theme_color: form.theme_color };
      if (form.custom_domain.trim()) body.custom_domain = form.custom_domain.trim().toLowerCase();
      else body.clear_custom_domain = true;
      const b = await adminApi('/api/admin/branding', { method: 'PATCH', body });
      setBrand(b);
      note('已儲存 ✓ — 活動網站即刻套用');
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  return (
<AdminShell active="brand">
  <header className="app-topbar" style={{height:'66px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 26px', gap:'16px'}}>
    <div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)'}}>品牌與網域</div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px'}}>
      {flash && <span style={{fontSize:'12.5px', fontWeight:'700', color:'var(--success-600)'}}>{flash}</span>}
      <button onClick={save} disabled={busy === 'save'} style={{display:'flex', alignItems:'center', gap:'8px', height:'38px', padding:'0 16px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', border:'none', cursor:'pointer', opacity: busy === 'save' ? .6 : 1}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="save" /></span>{busy === 'save' ? '儲存中…' : '儲存'}</button>
    </div>
  </header>

  <div className="app-content">
    {error && <div style={{padding:'12px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'14px'}}>{error}</div>}
    {!form && !error && <div style={{padding:'60px', textAlign:'center', color:'var(--text-subtle)'}}>載入中…</div>}
    {form && (
      <div className="grid-split" style={{display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:'16px', maxWidth:'980px'}}>

        {/* Cấu hình */}
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'16px'}}>白標設定（spec §VIII）</div>

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>組織 Logo</label>
          <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px'}}>
            {form.logo_url
              ? <img src={form.logo_url} alt="logo" style={{width:'56px', height:'56px', borderRadius:'14px', objectFit:'cover', border:'1px solid var(--border-subtle)', background:'#fff'}} />
              : <div style={{width:'56px', height:'56px', borderRadius:'14px', background:'var(--surface-sunken)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-subtle)', fontSize:'22px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="image" /></span></div>}
            <label style={{display:'inline-flex', alignItems:'center', gap:'7px', height:'38px', padding:'0 14px', borderRadius:'8px', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'13px', fontWeight:'600', cursor:'pointer'}}>
              <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'logo' ? 'loader' : 'image-up'} /></span>{busy === 'logo' ? '上傳中…' : '上傳 Logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {form.logo_url && <button onClick={() => setForm({ ...form, logo_url: '' })} style={{border:'none', background:'none', color:'var(--text-subtle)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer'}}>移除</button>}
          </div>

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>主題色（活動網站按鈕／進度條）</label>
          <div style={{display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'10px'}}>
            {PRESETS.map((c) => (
              <button key={c} onClick={() => setForm({ ...form, theme_color: c })} title={c}
                style={{width:'32px', height:'32px', borderRadius:'9999px', background:c, border:'1px solid var(--border-default)', cursor:'pointer', boxShadow: form.theme_color === c ? '0 0 0 2px #fff, 0 0 0 4px var(--primary-600)' : 'none'}} />
            ))}
            <label style={{width:'32px', height:'32px', borderRadius:'9999px', overflow:'hidden', border:'1px dashed var(--border-default)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-subtle)', fontSize:'14px', position:'relative'}} title="自訂顏色">
              <Icon name="pipette" />
              <input type="color" value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} style={{position:'absolute', inset:0, opacity:0, cursor:'pointer'}} />
            </label>
          </div>
          <div style={{fontSize:'11.5px', color:'var(--text-subtle)', fontFamily:'var(--font-mono)', marginBottom:'18px'}}>{form.theme_color}</div>

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>自訂網域（Custom Domain）</label>
          <input value={form.custom_domain} onChange={(e) => setForm({ ...form, custom_domain: e.target.value })} placeholder="vinh.concept.com（留空 = 未綁定）"
            style={{width:'100%', height:'42px', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'0 13px', fontSize:'13.5px', fontFamily:'var(--font-mono)', outline:'none', marginBottom:'8px'}} />
          <div style={{fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.7, marginBottom:'16px'}}>
            儲存後，請於您的 DNS 加入一筆 <b>CNAME</b> 指向平台網域。訪客造訪您的網域即直接看到貴組織的活動網站（網址列保持您的網域）。
            {form.custom_domain.trim() && <><br/>目前綁定：<a href={`http://${form.custom_domain.trim()}${typeof window !== 'undefined' && window.location.port ? ':' + window.location.port : ''}/`} target="_blank" rel="noreferrer" style={{color:'var(--primary-600)', fontWeight:'700', fontFamily:'var(--font-mono)'}}>{form.custom_domain.trim()} ↗</a></>}
          </div>

          <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'14px', fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.6}}>
            LINE 綁定（LIFF 專屬通道）與「Powered by Zoustec」開關由平台方（Zoustec）於平台後台管理。
          </div>
        </div>

        {/* Live preview */}
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'16px'}}>即時預覽（參與者畫面）</div>
          <div style={{maxWidth:'320px', margin:'0 auto', borderRadius:'22px', overflow:'hidden', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-lg)'}}>
            <div style={{background:'linear-gradient(180deg,#0B2935,#134E61)', color:'#fff', padding:'20px 16px'}}>
              {form.logo_url
                ? <img src={form.logo_url} alt="logo" style={{width:'44px', height:'44px', borderRadius:'12px', objectFit:'cover', background:'#fff'}} />
                : <div style={{width:'44px', height:'44px', borderRadius:'12px', background:'linear-gradient(145deg,#38B0D6,#0E7490)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="scan-line" /></span></div>}
              <div style={{fontSize:'17px', fontWeight:'800', marginTop:'12px'}}>{brand?.tenant_name}</div>
              <div style={{fontSize:'11.5px', color:'#B6D4DE', marginTop:'4px'}}>活動網站標題區</div>
            </div>
            <div style={{padding:'14px 16px', background:'var(--surface-app)'}}>
              <div style={{height:'7px', borderRadius:'9999px', background:'var(--surface-sunken)', marginBottom:'12px', position:'relative'}}><span style={{position:'absolute', left:0, top:0, height:'7px', width:'55%', borderRadius:'9999px', background:form.theme_color}}></span></div>
              <div style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px', borderRadius:'11px', border:`1.5px solid ${form.theme_color}`, background:'#fff', marginBottom:'12px'}}>
                <span style={{width:'34px', height:'34px', borderRadius:'9px', background:form.theme_color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="qr-code" /></span></span>
                <div style={{fontSize:'12.5px', fontWeight:'700', color:'var(--text-strong)'}}>任務卡片</div>
                <span style={{marginLeft:'auto', fontSize:'10.5px', fontWeight:'800', color:'#fff', background:form.theme_color, padding:'4px 9px', borderRadius:'9999px'}}>前往</span>
              </div>
              <div style={{height:'42px', borderRadius:'9999px', background:form.theme_color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700'}}>主要按鈕</div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
</AdminShell>
  );
}
