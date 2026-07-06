/**
 * The EVENT WEBSITE (spec §VII "tự động tạo website sự kiện" + §III.3
 * "website chính thức / tên miền của khách hàng").
 *
 * Server-rendered public page for ONE event — the real thing the builder
 * canvas previews: brand-tinted hero, stats, task stops, content sections,
 * and the 開始旅程 CTA into the LIFF experience. White-label: colors/logo
 * come from tenant branding; "Powered by Zoustec" obeys the platform flag.
 */

import Link from 'next/link';
import { Icon } from '../Icon';
import EventSections from './EventSections';
import { brandPalette } from '../../lib/brand';

const TYPE_LABEL = { city: '城市探索', hiking: '登山步道', shopping: '購物中心' };
const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };

export default function EventSite({ site }) {
  const { branding, event, tasks, other_events: others } = site;
  const p = brandPalette(branding.theme_color || '#0E7490') || {};
  const joinHref = `/experience/login?tenant=${branding.tenant_slug}&event=${event.id}`;
  const hero = event.config?.heroImage;

  return (
<div className="page-full" style={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, '--brand-hero-a': p.heroA, '--brand-hero-b': p.heroB, background: 'var(--surface-app)' }}>
  <div style={{maxWidth:'760px', margin:'0 auto', minHeight:'100dvh', background:'#fff', boxShadow:'var(--shadow-lg)', display:'flex', flexDirection:'column'}}>

    {/* ── Hero ─────────────────────────────────────────────────────────── */}
    <div style={{minHeight:'340px', background: hero ? `linear-gradient(rgba(11,41,53,.6), rgba(11,41,53,.68)), url(${hero}) center/cover` : `linear-gradient(150deg, ${p.heroA}, ${p.heroB})`, position:'relative', display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:'clamp(20px, 4vw, 32px)', color:'#fff'}}>
      <div style={{position:'absolute', top:'18px', left:'18px', display:'flex', alignItems:'center', gap:'9px', fontSize:'13px', fontWeight:'700'}}>
        {branding.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'30px', height:'30px', borderRadius:'8px', objectFit:'cover', background:'#fff'}} />
          : <span style={{width:'28px', height:'28px', borderRadius:'8px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'15px'}}><Icon name="scan-line" /></span>}
        {branding.tenant_name}
      </div>
      <div style={{position:'absolute', top:'18px', right:'18px', display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', fontWeight:'600', background:'rgba(255,255,255,.14)', padding:'6px 11px', borderRadius:'9999px', backdropFilter:'blur(4px)'}}><span style={{width:'7px', height:'7px', borderRadius:'50%', background:'#28C840'}}></span>進行中</div>

      <div style={{fontSize:'12px', fontWeight:'700', letterSpacing:'.12em', textTransform:'uppercase', color:p.light, marginBottom:'8px'}}>{TYPE_LABEL[event.event_type] || '互動體驗'} · WebAR 集章</div>
      <h1 style={{margin:0, fontSize:'clamp(28px, 6vw, 40px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.02em', color:'#fff', maxWidth:'18ch'}}>{event.name}</h1>
      {event.description && <p style={{margin:'12px 0 0', fontSize:'15px', color:'rgba(255,255,255,.82)', lineHeight:1.6, maxWidth:'56ch'}}>{event.description}</p>}
      <div style={{display:'flex', gap:'10px', marginTop:'20px', flexWrap:'wrap'}}>
        <Link href={joinHref} style={{display:'inline-flex', alignItems:'center', gap:'8px', padding:'13px 24px', borderRadius:'9999px', background:'#fff', color:p.dark, fontSize:'15px', fontWeight:'800', textDecoration:'none'}}><span style={{fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="qr-code" /></span>開始旅程</Link>
        <Link href={joinHref} style={{display:'inline-flex', alignItems:'center', gap:'8px', padding:'13px 20px', borderRadius:'9999px', background:'rgba(255,255,255,.12)', color:'#fff', fontSize:'14px', fontWeight:'600', border:'1px solid rgba(255,255,255,.25)', textDecoration:'none'}}>查看地圖</Link>
      </div>
    </div>

    {/* ── Stats ────────────────────────────────────────────────────────── */}
    <div style={{padding:'clamp(18px, 3vw, 26px)'}}>
      <div style={{display:'flex', gap:'12px', marginBottom:'24px', flexWrap:'wrap'}}>
        <div style={{flex:'1', minWidth:'110px', textAlign:'center', padding:'16px', borderRadius:'12px', background:'var(--surface-sunken)'}}><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)'}}>{tasks.length}</div><div style={{fontSize:'11.5px', color:'var(--text-muted)', fontWeight:'600'}}>任務</div></div>
        <div style={{flex:'1', minWidth:'110px', textAlign:'center', padding:'16px', borderRadius:'12px', background:'var(--surface-sunken)'}}><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)'}}>{event.reward_threshold}</div><div style={{fontSize:'11.5px', color:'var(--text-muted)', fontWeight:'600'}}>集章門檻</div></div>
        <div style={{flex:'2', minWidth:'160px', textAlign:'center', padding:'16px', borderRadius:'12px', background:'var(--surface-sunken)'}}><div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{event.reward_name || '—'}</div><div style={{fontSize:'11.5px', color:'var(--text-muted)', fontWeight:'600'}}>獎勵</div></div>
      </div>

      {/* ── Task stops ─────────────────────────────────────────────────── */}
      {tasks.length > 0 && (<>
        <h2 style={{margin:'0 0 12px', fontSize:'17px', fontWeight:'800', color:'var(--text-strong)'}}>任務停靠點</h2>
        <div style={{display:'flex', flexDirection:'column', gap:'10px', marginBottom:'24px'}}>
          {tasks.map((t, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:'13px', padding:'13px', borderRadius:'12px', border:'1px solid var(--border-subtle)'}}>
              <span style={{width:'42px', height:'42px', borderRadius:'10px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', flex:'0 0 auto'}}><Icon name={METHOD_ICON[t.verification_type] || 'map-pin'} /></span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:'700', fontSize:'14.5px', color:'var(--text-strong)'}}>{t.name}</div>
                <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{METHOD_LABEL[t.verification_type]}{t.radius_m ? ` · 範圍 ${t.radius_m}m` : ''}</div>
              </div>
              <span style={{fontSize:'16px', color:'var(--text-subtle)', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-right" /></span>
            </div>
          ))}
        </div>
      </>)}

      {/* ── Content sections (per event type) ──────────────────────────── */}
      {event.config?.sections?.filter((x) => !x.hidden).length > 0 && (<>
        <h2 style={{margin:'0 0 12px', fontSize:'17px', fontWeight:'800', color:'var(--text-strong)'}}>活動資訊</h2>
        <div style={{marginBottom:'24px'}}>
          <EventSections sections={event.config.sections} variant="light" />
        </div>
      </>)}

      {/* ── CTA cuối trang ─────────────────────────────────────────────── */}
      <Link href={joinHref} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', height:'52px', borderRadius:'9999px', background:p.brand, color:'#fff', fontSize:'15.5px', fontWeight:'800', textDecoration:'none', marginBottom:'18px'}}>
        <span style={{fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name="play" /></span>立即參加 — 免下載，LINE 直接玩
      </Link>

      {others?.length > 0 && (
        <div style={{marginBottom:'18px'}}>
          <div style={{fontSize:'12px', fontWeight:'700', color:'var(--text-subtle)', marginBottom:'8px'}}>此主辦方的其他活動</div>
          <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
            {others.map((o) => (
              <Link key={o.slug} href={`/e/${branding.tenant_slug}/${o.slug}`} style={{padding:'7px 13px', borderRadius:'9999px', background:'var(--surface-sunken)', color:'var(--text-body)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none'}}>{o.name}</Link>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* ── Footer ───────────────────────────────────────────────────────── */}
    <div style={{marginTop:'auto', padding:'16px', textAlign:'center', borderTop:'1px solid var(--border-subtle)', fontSize:'11.5px', color:'var(--text-subtle)'}}>
      © {branding.tenant_name}{branding.show_powered_by && <> · Powered by <span style={{fontWeight:'700'}}>Zoustec</span></>}
    </div>
  </div>
</div>
  );
}
