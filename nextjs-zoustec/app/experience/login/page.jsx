'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import EventSections from '../../../components/event/EventSections';
import { api, ensureEvent, getLiff, hasLiff, loginDev, loginWithLiff, session } from '../../../lib/liff-client';

const TYPE_LABEL = { city: '城市探索', hiking: '登山路線', shopping: '商場集點' };

export default function Page() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [me, setMe] = useState(null);           // {display_name} after login
  const [event, setEvent] = useState(null);     // event preview (name/desc/type)
  const [target, setTarget] = useState(null);   // {tenant, eventId} from portal link
  const [devMode, setDevMode] = useState(false); // desktop testing escape hatch
  const [brand, setBrand] = useState(null);      // white-label branding (logo/powered-by)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      // LIFF links carry extra params inside `liff.state` and the SDK only
      // unpacks them during liff.init() — so init FIRST, then read the URL.
      if (hasLiff()) { try { await getLiff(); } catch { /* handled below */ } }

      // Deep-links:
      //   Portal card:  ?tenant=..&event=..
      //   Printed QR:   ?tenant=..&event=..&task=..&qr=TOKEN  → thẳng màn AR
      const params = new URLSearchParams(window.location.search);
      let qTenant = params.get('tenant');
      let qEvent = params.get('event');
      let qTask = params.get('task');
      let qQr = params.get('qr');
      // Fallback: parse liff.state ourselves in case the SDK hasn't rewritten
      // the URL (timing differs across LINE versions / external browsers).
      const rawState = params.get('liff.state');
      if ((!qTenant || !qEvent || !qTask) && rawState) {
        try {
          const st = new URLSearchParams(decodeURIComponent(rawState).replace(/^[?/]+/, ''));
          qTenant = qTenant || st.get('tenant');
          qEvent = qEvent || st.get('event');
          qTask = qTask || st.get('task');
          qQr = qQr || st.get('qr');
        } catch { /* ignore malformed state */ }
      }
      const tgt = { tenant: qTenant || session.tenant || null, eventId: qEvent || null, taskId: qTask || null, qr: qQr || null };
      setTarget(tgt);

      // JWT is tenant-scoped — switching tenant needs a fresh login.
      if (session.token && qTenant && session.tenant && qTenant !== session.tenant) {
        session.clear();
      }

      // White-label branding (logo / powered-by) — pre-auth by design.
      try {
        const bres = await fetch(`/api/public/tenants/${tgt.tenant || 'taipei'}/branding`);
        if (bres.ok) setBrand(await bres.json());
      } catch { /* platform default */ }

      // Event preview from the public portal listing (pre-auth).
      if (qEvent) {
        try {
          const evts = await api('/api/public/events');
          const ev = evts.find((x) => x.event_id === qEvent);
          if (ev) setEvent({ name: ev.name, description: ev.description, event_type: ev.event_type, tenant_name: ev.tenant_name });
        } catch { /* preview only — ignore */ }
      }

      // Returning visitor with a valid session for this tenant.
      if (session.token) {
        try {
          const ev = await ensureEvent(qEvent || undefined);
          if (!qEvent) setEvent(ev);
          setMe({ display_name: session.name });
          return;
        } catch { session.clear(); }
      }

      // Inside the LINE app with LIFF configured → silent auto-login
      // (spec/PoC: opening from LINE completes login automatically).
      if (hasLiff()) {
        try {
          const liff = await getLiff();
          if (liff.isInClient() && liff.isLoggedIn()) {
            const out = await loginWithLiff(tgt.tenant || undefined);
            setMe(out);
            const ev = await ensureEvent(tgt.eventId || undefined);
            if (!qEvent) setEvent(ev);
            // Printed-QR deep-link: jump straight into that task's AR screen.
            if (tgt.taskId) return goToTask(tgt);
          }
        } catch { /* fall through to manual button */ }
      }
    })();
  }, []);

  function goToTask(tgt) {
    session.setTask(tgt.taskId);
    router.push(`/experience/ar${tgt.qr ? `?qr=${encodeURIComponent(tgt.qr)}` : ''}`);
  }

  async function handleStart() {
    setBusy(true); setError('');
    try {
      const tenant = target?.tenant || undefined;
      if (!me) {
        const useLiff = hasLiff() && !devMode;
        const out = useLiff ? await loginWithLiff(tenant) : await loginDev(name || '訪客', tenant);
        setMe(out);
      }
      await ensureEvent(target?.eventId || undefined);
      if (target?.taskId) return goToTask(target);
      router.push('/experience/map');
    } catch (e) {
      setError(e.code === 'tenant_not_found' ? '找不到這個活動的主辦方' : e.message || '登入失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
<div style={{flex:'1', display:'flex', flexDirection:'column', minHeight:'100dvh'}}>
  {/* LINE LIFF header */}
  <div style={{height:'44px', flex:'0 0 auto', background:'#06C755', display:'flex', alignItems:'center', padding:'0 14px', gap:'9px', color:'#fff'}}><span style={{fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-left" /></span><span style={{fontWeight:'800', fontSize:'14px', letterSpacing:'-.01em'}}>LINE</span><span style={{fontSize:'12px', opacity:'.85', fontWeight:'600'}}>· {event ? event.name : 'Zoustec AR'}</span><span style={{marginLeft:'auto', fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></div>

  {/* Hero / auto-login */}
  <div style={{flex:'1', display:'flex', flexDirection:'column', background: event?.config?.heroImage ? `linear-gradient(rgba(11,41,53,.78), rgba(19,78,97,.82)), url(${event.config.heroImage}) center/cover` : 'linear-gradient(180deg, var(--brand-hero-b), var(--brand-hero-a))', color:'#fff', padding:'30px 22px 88px', position:'relative'}}>
    <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 70% 12%,rgba(56,176,214,.35),transparent 55%)'}}></div>
    {brand?.logo_url ? (
      <img src={brand.logo_url} alt={brand.tenant_name} style={{position:'relative', marginTop:'14px', width:'64px', height:'64px', borderRadius:'18px', objectFit:'cover', boxShadow:'0 14px 30px rgba(0,0,0,.35)', background:'#fff'}} />
    ) : (
      <div style={{position:'relative', marginTop:'14px', width:'64px', height:'64px', borderRadius:'18px', background:'linear-gradient(145deg,#38B0D6,#0E7490)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', boxShadow:'0 14px 30px rgba(0,0,0,.35)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="scan-line" /></span></div>
    )}
    <div style={{position:'relative', fontSize:'12px', fontWeight:'700', letterSpacing:'.12em', textTransform:'uppercase', color:'var(--brand-light)', marginTop:'24px'}}>
      {event ? `${TYPE_LABEL[event.event_type] || '互動體驗'}${event.tenant_name ? ` · ${event.tenant_name}` : ''}` : '互動集章體驗'}
    </div>
    <div style={{position:'relative', fontSize:'29px', fontWeight:'800', lineHeight:'1.12', letterSpacing:'-.02em', marginTop:'8px'}}>{event ? event.name : '歡迎來到 Zoustec AR'}</div>
    <div style={{position:'relative', fontSize:'14px', color:'#B6D4DE', lineHeight:'1.55', marginTop:'12px'}}>{event?.description || '完成任務、掃描 AR 並收集紀念印章。'}</div>

    {/* Kiến trúc website theo loại sự kiện (spec §III.2) */}
    {event?.config?.sections?.length > 0 && (
      <div style={{position:'relative', marginTop:'16px'}}>
        <EventSections sections={event.config.sections} variant="dark" />
      </div>
    )}

    {error && <div style={{position:'relative', marginTop:'14px', padding:'10px 14px', borderRadius:'10px', background:'rgba(239,68,68,.18)', border:'1px solid rgba(239,68,68,.4)', color:'#FCA5A5', fontSize:'13px', fontWeight:'600'}}>{error}</div>}

    {/* Identity card: LIFF auto / dev name input */}
    {me ? (
      <div style={{position:'relative', marginTop:'auto', display:'flex', alignItems:'center', gap:'11px', padding:'12px', borderRadius:'14px', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)'}}>
        <div style={{width:'38px', height:'38px', borderRadius:'9999px', background:'#6FCDE8', color:'#0B2935', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'14px'}}>{(me.display_name || '訪').slice(0, 2)}</div>
        <div style={{flex:'1', minWidth:'0'}}><div style={{fontSize:'13px', fontWeight:'700'}}>{me.display_name}</div><div style={{fontSize:'11px', color:'#8FB6C2'}}>{hasLiff() ? '透過 LINE 自動登入' : '開發模式登入'}</div></div>
        <span style={{color:'var(--success-500)', fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name="circle-check" /></span>
      </div>
    ) : hasLiff() && !devMode ? (
      <div style={{position:'relative', marginTop:'auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:'11px', padding:'12px', borderRadius:'14px', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)', color:'#B6D4DE', fontSize:'13px'}}>
          <span style={{fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name="lock" /></span>按下「開始旅程」將透過 LINE 自動登入
        </div>
        <button onClick={() => setDevMode(true)} style={{marginTop:'8px', background:'none', border:'none', color:'#4E7A88', fontSize:'11px', fontWeight:'600', cursor:'pointer', padding:0}}>或使用開發模式測試（不經 LINE）</button>
      </div>
    ) : (
      <div style={{position:'relative', marginTop:'auto'}}>
        <div style={{fontSize:'11px', fontWeight:'700', color:'#8FB6C2', marginBottom:'7px', letterSpacing:'.06em'}}>開發模式 · 輸入暱稱體驗</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="您的暱稱（例：陳美安）"
          style={{width:'100%', height:'48px', borderRadius:'12px', border:'1px solid rgba(255,255,255,.22)', background:'rgba(255,255,255,.1)', color:'#fff', padding:'0 14px', fontSize:'14px', fontWeight:'600', outline:'none'}}
        />
      </div>
    )}

    <button onClick={handleStart} disabled={busy} style={{position:'relative', marginTop:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', height:'52px', borderRadius:'9999px', background:'#fff', color:'var(--brand-dark)', fontSize:'16px', fontWeight:'800', border:'none', cursor:'pointer', opacity:busy ? .6 : 1, width:'100%'}}>
      <span style={{fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name={busy ? 'loader' : 'play'} /></span>{busy ? '登入中…' : '開始旅程'}
    </button>
    {(brand ? brand.show_powered_by : true) && (
      <div style={{position:'relative', textAlign:'center', marginTop:'12px', fontSize:'10.5px', fontWeight:'600', color:'rgba(255,255,255,.45)'}}>Powered by Zoustec</div>
    )}
  </div>
</div>
  );
}
