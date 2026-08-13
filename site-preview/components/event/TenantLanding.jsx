/**
 * TENANT LANDING — what a customer's domain root shows when the tenant runs
 * several events at once (PRD §6.2 tenant resolver, spec §VIII white-label).
 *
 * A branded mini-portal: tenant logo + palette, one card per active event
 * linking to that event's website. No platform chrome beyond the optional
 * "Powered by Zoustec" flag.
 */

import Link from 'next/link';
import { Icon } from '../Icon';
import { brandPalette } from '../../lib/brand';

const TYPE_META = {
  city: { icon: 'building-2', label: '城市探索', gradient: 'linear-gradient(145deg,#134E61,#0B2935)' },
  hiking: { icon: 'mountain', label: '登山步道', gradient: 'linear-gradient(145deg,#15803D,#134E61)' },
  shopping: { icon: 'shopping-bag', label: '購物中心', gradient: 'linear-gradient(145deg,#0E7490,#134E61)' },
};

export default function TenantLanding({ site, linkBase }) {
  const { branding, events } = site;
  const p = brandPalette(branding.theme_color || '#0E7490') || {};
  const base = linkBase ?? `/e/${branding.tenant_slug}`;
  // Tenant-edited at /admin/dashboard/branding (活動總覽首頁 section); empty = defaults.
  const title = branding.landing_title || branding.tenant_name;
  const tagline = branding.landing_tagline || '選擇一個活動開始 — 掃描 AR、完成任務並收集紀念印章。';
  const heroImg = branding.landing_hero;

  return (
<div className="page-full" style={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, '--brand-hero-a': p.heroA, '--brand-hero-b': p.heroB, background: 'var(--surface-app)', display:'flex', flexDirection:'column' }}>

  {/* ── Hero: tenant identity ─────────────────────────────────────────── */}
  <div style={{background: heroImg ? `linear-gradient(rgba(11,41,53,.55), rgba(11,41,53,.66)), url(${heroImg}) center/cover` : `linear-gradient(150deg, ${p.heroA}, ${p.heroB})`, color:'#fff', padding:'clamp(36px, 7vw, 64px) clamp(20px, 5vw, 40px) clamp(30px, 5vw, 48px)', position:'relative', overflow:'hidden'}}>
    <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 82% 18%, rgba(255,255,255,.14), transparent 52%)'}}></div>
    <div style={{position:'relative', maxWidth:'1000px', margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'center', gap:'13px'}}>
        {branding.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'52px', height:'52px', borderRadius:'14px', objectFit:'cover', background:'#fff'}} />
          : <span style={{width:'48px', height:'48px', borderRadius:'13px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}><Icon name="scan-line" /></span>}
        <div style={{fontSize:'clamp(24px, 4.5vw, 34px)', fontWeight:'800', letterSpacing:'-.02em'}}>{title}</div>
      </div>
      <div style={{fontSize:'15px', color:'rgba(255,255,255,.82)', marginTop:'14px', maxWidth:'56ch', lineHeight:1.6}}>{tagline}</div>
    </div>
  </div>

  {/* ── Event cards ───────────────────────────────────────────────────── */}
  <div style={{flex:'1', padding:'26px clamp(20px, 5vw, 30px) 36px'}}>
    <div style={{maxWidth:'1000px', margin:'0 auto'}}>
      <div style={{fontSize:'13px', fontWeight:'700', color:'var(--text-muted)', letterSpacing:'.06em', marginBottom:'14px'}}>進行中的活動（{events.length}）</div>
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'18px'}}>
        {events.map((e) => {
          const t = TYPE_META[e.event_type] || TYPE_META.city;
          return (
            <Link key={e.slug} href={`${base}/${e.slug}`} style={{display:'block', textDecoration:'none', background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'14px', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
              <div style={{height:'140px', background: e.hero_image ? `linear-gradient(rgba(11,41,53,.35), rgba(11,41,53,.45)), url(${e.hero_image}) center/cover` : t.gradient, position:'relative'}}>
                <span style={{position:'absolute', top:'12px', left:'12px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 11px', borderRadius:'9999px', background:'rgba(255,255,255,.16)', color:'#fff', fontSize:'11px', fontWeight:'700', backdropFilter:'blur(4px)'}}><span style={{fontSize:'12px', display:'inline-flex', lineHeight:'0'}}><Icon name={t.icon} /></span>{t.label}</span>
                <span style={{position:'absolute', bottom:'12px', right:'12px', fontSize:'32px', color:'rgba(255,255,255,.85)', display:'inline-flex', lineHeight:'0'}}><Icon name={t.icon} /></span>
              </div>
              <div style={{padding:'16px'}}>
                <div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)', lineHeight:'1.25'}}>{e.name}</div>
                {e.description && <div style={{fontSize:'12.5px', color:'var(--text-muted)', marginTop:'6px', lineHeight:1.55, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{e.description}</div>}
                <div style={{display:'flex', alignItems:'center', gap:'14px', marginTop:'12px', fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>
                  <span style={{display:'inline-flex', alignItems:'center', gap:'5px'}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="map-pin" /></span>{e.task_count} 個任務</span>
                  {e.reward_name && <span style={{display:'inline-flex', alignItems:'center', gap:'5px', minWidth:0}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="gift" /></span><span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{e.reward_name}</span></span>}
                  <span style={{marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:'4px', color:p.brand, fontWeight:'700', flex:'0 0 auto'}}>參加<span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  </div>

  {/* ── Footer ────────────────────────────────────────────────────────── */}
  <div style={{padding:'16px', textAlign:'center', borderTop:'1px solid var(--border-subtle)', fontSize:'11.5px', color:'var(--text-subtle)', background:'#fff'}}>
    © {branding.tenant_name}{branding.show_powered_by && <> · Powered by <span style={{fontWeight:'700'}}>Zoustec</span></>}
  </div>
</div>
  );
}
