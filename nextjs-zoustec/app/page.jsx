import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '../components/Icon';
import LiffOAuthCompleter from '../components/LiffOAuthCompleter';
import { publicGet } from '../lib/api';

export const metadata = { title: '活動入口網站 · Zoustec AR' };
export const dynamic = 'force-dynamic';

const TYPE_META = {
  city: { icon: 'building-2', gradient: 'linear-gradient(145deg,#134E61,#0B2935)', stat: 'award', statLabel: (e) => `${e.task_count} 個任務` },
  hiking: { icon: 'mountain', gradient: 'linear-gradient(145deg,#15803D,#134E61)', stat: 'footprints', statLabel: (e) => `${e.task_count} 個任務` },
  shopping: { icon: 'shopping-bag', gradient: 'linear-gradient(145deg,#0E7490,#134E61)', stat: 'gift', statLabel: (e) => `${e.task_count} 個任務` },
};

/** The LIFF Endpoint URL points at the site root (so LINE accepts login
 * redirects for every page). LIFF opens the root with the deep-link packed in
 * `liff.state`; unpack it server-side and forward before rendering the portal.
 * Also forwards legacy query-style event links (?tenant=..&event=..). */
function forwardLiffDeepLink(searchParams) {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  // OAuth callback (LINE web-login trả code+state về endpoint, thường kèm cả
  // liff.state): KHÔNG redirect server-side — redirect sẽ vứt mất code trước
  // khi liff.init kịp đổi nó lấy phiên. LiffOAuthCompleter xử lý phía client.
  if (first(searchParams?.code) && first(searchParams?.state)) return;
  const state = first(searchParams?.['liff.state']);
  if (state) {
    const dec = decodeURIComponent(state);
    // Path-style state → that path; query-style → the experience entry.
    if (dec.startsWith('/') && !dec.startsWith('//')) redirect(dec);
    redirect(`/experience/login${dec.startsWith('?') ? dec : `?${dec}`}`);
  }
  if (searchParams?.tenant || searchParams?.event) {
    const p = new URLSearchParams();
    for (const k of ['tenant', 'event', 'task', 'qr']) {
      const v = first(searchParams[k]);
      if (v) p.set(k, v);
    }
    redirect(`/experience/login?${p}`);
  }
}

export default async function Page({ searchParams }) {
  forwardLiffDeepLink(searchParams);
  const events = await publicGet('/api/public/events');
  return (
<div className="page-full" style={{display:'flex', flexDirection:'column'}}>
  {/* Hoàn tất LIFF web-login khi LINE trả code về endpoint (trang gốc) */}
  <LiffOAuthCompleter />

  {/* ── Site header ───────────────────────────────────────────────────── */}
  <div style={{minHeight:'64px', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'12px 30px', gap:'24px', flexWrap:'wrap'}}>
    <div style={{display:'flex', alignItems:'center', gap:'10px'}}><span style={{width:'34px', height:'34px', borderRadius:'9px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="compass" /></span></span><span style={{fontWeight:'800', fontSize:'16px', color:'var(--text-strong)'}}>探索 Zoustec</span></div>
    <div className="hide-mobile" style={{display:'flex', gap:'22px', fontSize:'14px', fontWeight:'600', color:'var(--text-body)', marginLeft:'14px'}}><span style={{color:'var(--primary-700)'}}>活動</span><span>景點</span><span>地圖</span><span>關於</span></div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px'}}><div style={{width:'38px', height:'38px', borderRadius:'9999px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="search" /></span></div><div style={{height:'38px', padding:'0 16px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'700', display:'flex', alignItems:'center'}}>LINE 登入</div></div>
  </div>

  {/* ── Hero ──────────────────────────────────────────────────────────── */}
  <div style={{position:'relative', padding:'56px clamp(20px, 5vw, 40px) 48px', background:'linear-gradient(150deg,#134E61,#0B2935)', color:'#fff', overflow:'hidden'}}>
    <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 82% 18%,rgba(56,176,214,.35),transparent 52%)'}}></div>
    <div style={{position:'relative', maxWidth:'1160px', margin:'0 auto'}}>
      <div style={{fontSize:'12px', fontWeight:'700', letterSpacing:'.14em', textTransform:'uppercase', color:'#6FCDE8'}}>互動體驗 · WebAR</div>
      <div style={{fontSize:'clamp(30px, 5vw, 44px)', fontWeight:'800', lineHeight:'1.08', letterSpacing:'-.03em', marginTop:'12px', maxWidth:'20ch'}}>透過集章旅程探索台灣</div>
      <div style={{fontSize:'16px', color:'#B6D4DE', marginTop:'14px', maxWidth:'52ch'}}>參與互動活動：在景點掃描 AR、完成任務並收集紀念印章。</div>
      <div style={{marginTop:'26px', display:'flex', alignItems:'center', gap:'10px', background:'#fff', borderRadius:'9999px', padding:'7px 8px 7px 20px', maxWidth:'560px', boxShadow:'var(--shadow-lg)'}}><span style={{color:'var(--text-muted)', fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name="search" /></span><span style={{flex:'1', color:'var(--text-subtle)', fontSize:'14px'}}>搜尋活動、城市、景點…</span><span style={{height:'40px', padding:'0 22px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', display:'flex', alignItems:'center'}}>搜尋</span></div>
      <div style={{display:'flex', gap:'10px', marginTop:'20px', flexWrap:'wrap'}}><span style={{display:'inline-flex', alignItems:'center', gap:'7px', padding:'8px 14px', borderRadius:'9999px', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.16)', fontSize:'13px', fontWeight:'600'}}><span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="building-2" /></span>城市</span><span style={{display:'inline-flex', alignItems:'center', gap:'7px', padding:'8px 14px', borderRadius:'9999px', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.16)', fontSize:'13px', fontWeight:'600'}}><span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="mountain" /></span>登山</span><span style={{display:'inline-flex', alignItems:'center', gap:'7px', padding:'8px 14px', borderRadius:'9999px', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.16)', fontSize:'13px', fontWeight:'600'}}><span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="shopping-bag" /></span>購物</span></div>
    </div>
  </div>

  {/* ── Popular events ────────────────────────────────────────────────── */}
  <div style={{flex:'1', padding:'28px clamp(20px, 5vw, 30px) 34px', background:'var(--surface-app)'}}>
    <div style={{maxWidth:'1160px', margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}><div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)'}}>熱門活動</div><span style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:'700', color:'var(--primary-700)'}}>查看全部<span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></span></div>
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'18px'}}>
        {events.map((e) => {
          const t = TYPE_META[e.event_type] || TYPE_META.city;
          return (
            <Link key={e.event_id} href={`/e/${e.tenant_slug}/${e.slug}`} style={{display:'block', textDecoration:'none', background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'14px', overflow:'hidden', boxShadow:'var(--shadow-sm)'}}>
              <div style={{height:'150px', background: e.hero_image ? `linear-gradient(rgba(11,41,53,.35), rgba(11,41,53,.45)), url(${e.hero_image}) center/cover` : t.gradient, position:'relative'}}>
                <span style={{position:'absolute', top:'12px', left:'12px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 11px', borderRadius:'9999px', background:'rgba(255,255,255,.16)', color:'#fff', fontSize:'11px', fontWeight:'700', backdropFilter:'blur(4px)'}}><span style={{width:'6px', height:'6px', borderRadius:'50%', background:'#28C840'}}></span>進行中</span>
                <span style={{position:'absolute', bottom:'12px', right:'12px', fontSize:'34px', color:'rgba(255,255,255,.85)', display:'inline-flex', lineHeight:'0'}}><Icon name={t.icon} /></span>
              </div>
              <div style={{padding:'16px'}}>
                <div style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'11px', fontWeight:'700', color:'var(--primary-700)', background:'var(--primary-50)', padding:'3px 9px', borderRadius:'9999px', marginBottom:'9px'}}>{e.tenant_name}</div>
                <div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)', lineHeight:'1.25'}}>{e.name}</div>
                <div style={{display:'flex', alignItems:'center', gap:'14px', marginTop:'12px', fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>
                  <span style={{display:'inline-flex', alignItems:'center', gap:'5px'}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="map-pin" /></span>{e.task_count} 個點</span>
                  <span style={{display:'inline-flex', alignItems:'center', gap:'5px'}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name={t.stat} /></span>{t.statLabel(e)}</span>
                  <span style={{marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:'4px', color:'var(--primary-600)', fontWeight:'700'}}>參加<span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></span>
                </div>
              </div>
            </Link>
          );
        })}
        {!events.length && (
          <div style={{gridColumn:'1 / -1', padding:'40px', textAlign:'center', color:'var(--text-subtle)'}}>目前沒有進行中的活動</div>
        )}
      </div>
    </div>
  </div>

  {/* ── Footer ────────────────────────────────────────────────────────── */}
  <div style={{background:'#0B2935', padding:'22px clamp(20px, 5vw, 30px)', display:'flex', alignItems:'center', gap:'12px', color:'#8FB6C2', fontSize:'13px', flexWrap:'wrap'}}><span style={{width:'28px', height:'28px', borderRadius:'7px', background:'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', color:'#6FCDE8', fontSize:'14px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="compass" /></span></span>© 2025 探索 Zoustec<span style={{marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:'8px', fontWeight:'600'}}>Powered by <span style={{color:'#fff', fontWeight:'800'}}>Zoustec</span></span></div>
</div>
  );
}
