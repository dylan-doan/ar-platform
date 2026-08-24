'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../../components/Icon';
import AdminShell from '../../../../components/admin/AdminShell';
import { adminApi, adminUpload, AuthRequired, loginUrl } from '../../../../lib/admin-client';

const PRESETS = ['#0E7490', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5'];

export default function Page() {
  const router = useRouter();
  const [brand, setBrand] = useState(null);   // server truth
  const [form, setForm] = useState(null);     // {logo_url, theme_color, custom_domain, home}
  const [events, setEvents] = useState([]);   // active events → 首頁顯示 options
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [line, setLine] = useState({ channel_id: '', channel_secret: '' });

  useEffect(() => {
    (async () => {
      try {
        const b = await adminApi('/api/admin/branding');
        setBrand(b);
        if (b.line_liff_id && b.line_liff_id.includes('-')) setLine((l) => ({ ...l, channel_id: b.line_liff_id.split('-')[0] }));
        setForm({
          logo_url: b.logo_url || '',
          theme_color: b.theme_color || '#0E7490',
          custom_domain: b.custom_domain || '',
          home: b.home_mode === 'event' && b.home_event_slug ? `event:${b.home_event_slug}` : (b.home_mode || 'auto'),
          landing_title: b.landing_title || '',
          landing_tagline: b.landing_tagline || '',
          landing_hero: b.landing_hero || '',
        });
        try {
          const evs = await adminApi('/api/admin/events');
          setEvents(evs.filter((e) => e.is_active));
        } catch { /* dropdown falls back to just auto/list */ }
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/dashboard/branding'));
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
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  async function uploadLandingHero(file) {
    if (!file || busy) return;
    setBusy('hero'); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const out = await adminUpload('/api/admin/media', fd);
      setForm({ ...form, landing_hero: out.url });
      note('封面已上傳 — 按「儲存」生效');
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  async function save() {
    if (busy || !form) return;
    setBusy('save'); setError('');
    try {
      const body = { logo_url: form.logo_url || null, theme_color: form.theme_color };
      // People paste full URLs — normalize down to the bare hostname the
      // backend expects: strip scheme, path, port, trailing dots.
      const domain = form.custom_domain.trim().toLowerCase()
        .replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0].replace(/\.+$/, '');
      if (domain) body.custom_domain = domain;
      else body.clear_custom_domain = true;
      if (form.home.startsWith('event:')) {
        body.home_mode = 'event';
        body.home_event_slug = form.home.slice(6);
      } else {
        body.home_mode = form.home;
      }
      body.landing_title = form.landing_title.trim() || null;
      body.landing_tagline = form.landing_tagline.trim() || null;
      body.landing_hero = form.landing_hero || null;
      const b = await adminApi('/api/admin/branding', { method: 'PATCH', body });
      setBrand(b);
      note('已儲存 ✓ — 活動網站即刻套用');
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  async function provisionLiff() {
    if (busy) return;
    setBusy('liff'); setError('');
    try {
      const body = {};
      if (line.channel_id.trim()) body.channel_id = line.channel_id.trim();
      if (line.channel_secret.trim()) body.channel_secret = line.channel_secret.trim();
      const b = await adminApi('/api/admin/branding/liff', { method: 'POST', body });
      setBrand(b);
      setLine({ channel_id: b.line_liff_id ? b.line_liff_id.split('-')[0] : line.channel_id, channel_secret: '' });
      note('LINE 專屬 LIFF 已建立 ✓');
    } catch (e) { if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/dashboard/branding')); setError(e.message); }
    finally { setBusy(''); }
  }

  const liffId = brand?.line_liff_id || '';
  const domainSaved = !!(brand?.custom_domain);
  const liffLink = liffId ? `https://liff.line.me/${liffId}` : '';

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

        {/* Configuration */}
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

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>首頁顯示（訪客造訪網域根目錄）</label>
          <select value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })}
            style={{width:'100%', height:'42px', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'0 10px', fontSize:'13.5px', color:'var(--text-body)', background:'#fff', marginBottom:'8px'}}>
            <option value="auto">自動 — 單一活動時直接顯示；多個活動時顯示活動總覽</option>
            <option value="list">活動總覽頁 — 列出所有進行中的活動</option>
            {events.map((e) => <option key={e.id} value={`event:${e.slug}`}>指定活動：{e.name}</option>)}
          </select>
          <div style={{fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.7, marginBottom:'16px'}}>
            各活動也有專屬網址：您的網域 + <span style={{fontFamily:'var(--font-mono)'}}>/活動代稱</span>（例：<span style={{fontFamily:'var(--font-mono)'}}>{(form.custom_domain.trim() || '您的網域')}/{events[0]?.slug || 'event-slug'}</span>）。
          </div>

          <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'16px', fontSize:'13px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'12px'}}>活動總覽首頁內容</div>

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>首頁標題</label>
          <input value={form.landing_title} onChange={(e) => setForm({ ...form, landing_title: e.target.value })} placeholder={`留空 = 組織名稱（${brand?.tenant_name || ''}）`}
            style={{width:'100%', height:'42px', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'0 13px', fontSize:'13.5px', outline:'none', marginBottom:'12px'}} />

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>首頁副標（歡迎語）</label>
          <textarea value={form.landing_tagline} onChange={(e) => setForm({ ...form, landing_tagline: e.target.value })} rows={2} placeholder="留空 = 選擇一個活動開始 — 掃描 AR、完成任務並收集紀念印章。"
            style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'10px 13px', fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:'12px'}} />

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'8px'}}>首頁封面圖</label>
          {form.landing_hero ? (
            <div style={{position:'relative', marginBottom:'8px'}}>
              <img src={form.landing_hero} alt="landing hero" style={{width:'100%', height:'96px', objectFit:'cover', borderRadius:'10px', border:'1px solid var(--border-subtle)'}} />
              <button onClick={() => setForm({ ...form, landing_hero: '' })} title="移除" style={{position:'absolute', top:'6px', right:'6px', width:'26px', height:'26px', borderRadius:'9999px', background:'rgba(11,41,53,.72)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></button>
            </div>
          ) : null}
          <label style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'10px', borderRadius:'9px', border:'1.5px dashed var(--border-default)', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer', marginBottom:'8px'}}>
            <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'hero' ? 'loader' : 'image-up'} /></span>{busy === 'hero' ? '上傳中…' : form.landing_hero ? '更換封面圖' : '上傳封面圖（留空 = 主題色漸層）'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e) => uploadLandingHero(e.target.files?.[0])} />
          </label>
          <div style={{fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.7, marginBottom:'16px'}}>
            這些內容顯示於「活動總覽頁」（多活動時的網域首頁）。各活動網站的標題、介紹與封面請於<b>網站產生器</b>編輯。
          </div>

          <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'16px', fontSize:'13px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'6px'}}>LINE 入口（專屬 LIFF）</div>
          <div style={{fontSize:'11.5px', color:'var(--text-subtle)', lineHeight:1.7, marginBottom:'12px'}}>
            目前入口：{liffId
              ? <><span style={{fontFamily:'var(--font-mono)', color:'var(--text-body)', fontWeight:'700'}}>{liffId}</span>（貴組織專屬）— 分享連結 <a href={liffLink} target="_blank" rel="noreferrer" style={{color:'var(--primary-600)', fontWeight:'700', fontFamily:'var(--font-mono)'}}>{liffLink} ↗</a>，可放入 LINE 官方帳號的 Rich Menu、訊息按鈕或 QR Code。</>
              : <>平台共用 LIFF（尚未綁定貴組織的 LINE channel）。</>}
          </div>
          <ol style={{fontSize:'11.5px', color:'var(--text-subtle)', lineHeight:1.8, margin:'0 0 12px 18px', padding:0}}>
            <li>前往 <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" style={{color:'var(--primary-600)', fontWeight:'700'}}>LINE Developers Console</a>，在貴組織的 Provider 下建立一個 <b>LINE Login</b> channel（LINE 未提供 API，此步驟需手動）。</li>
            <li>在該 channel 的 <b>Basic settings</b> 分頁複製 <b>Channel ID</b> 與 <b>Channel secret</b>，貼到下方。</li>
            <li>點「自動建立 LIFF」— 平台會在您的 channel 內建立 LIFF app，入口網址指向您的自訂網域；日後更換網域再按一次即可更新。</li>
          </ol>
          {!domainSaved && (
            <div style={{fontSize:'11.5px', fontWeight:'600', color:'var(--status-warning-fg, #92400e)', background:'var(--status-warning-bg, #fef3c7)', borderRadius:'8px', padding:'8px 10px', marginBottom:'10px'}}>
              請先在上方填寫自訂網域並按「儲存」— LIFF 入口網址將指向該網域。
            </div>
          )}
          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>Channel ID</label>
          <input value={line.channel_id} onChange={(e) => setLine({ ...line, channel_id: e.target.value })} placeholder="例：2010638570" inputMode="numeric"
            style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'0 13px', fontSize:'13.5px', fontFamily:'var(--font-mono)', outline:'none', marginBottom:'10px'}} />
          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>Channel secret{liffId ? '（已儲存；僅在更換時重新填寫）' : ''}</label>
          <input type="password" value={line.channel_secret} onChange={(e) => setLine({ ...line, channel_secret: e.target.value })} placeholder={liffId ? '留空 = 使用已儲存的 secret' : '貼上 Channel secret'} autoComplete="off"
            style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'9px', padding:'0 13px', fontSize:'13.5px', fontFamily:'var(--font-mono)', outline:'none', marginBottom:'10px'}} />
          <button onClick={provisionLiff} disabled={busy === 'liff' || !domainSaved}
            style={{display:'inline-flex', alignItems:'center', gap:'8px', height:'38px', padding:'0 16px', borderRadius:'8px', background:'#06C755', color:'#fff', fontSize:'13px', fontWeight:'700', border:'none', cursor: (busy === 'liff' || !domainSaved) ? 'not-allowed' : 'pointer', opacity: (busy === 'liff' || !domainSaved) ? .55 : 1, marginBottom:'14px'}}>
            <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'liff' ? 'loader' : 'link'} /></span>{busy === 'liff' ? '建立中…' : liffId ? '更新 LIFF 入口網址' : '自動建立 LIFF'}
          </button>

          <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'14px', fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.6}}>
            「Powered by Zoustec」開關由平台方（Zoustec）於平台後台管理；組織名稱由平台方協助變更。若不便自行設定 LINE，也可請 Zoustec 代為綁定。
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
