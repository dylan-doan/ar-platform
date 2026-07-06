'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../../components/Icon';
import { adminApi, AuthRequired, loginUrl } from '../../../lib/admin-client';
import { DEFAULT_SECTIONS } from '../../../lib/event-sections';

const TYPES = [
  { key: 'city', icon: 'building-2', title: '城市探索', sub: 'Urban exploration · 景點與文化', feats: ['景點地圖', '各點文化內容', '古蹟 QR + AR 任務'] },
  { key: 'hiking', icon: 'mountain', title: '登山步道', sub: 'Outdoor · 戶外路線', feats: ['安全提醒', '路線與難度資訊', 'GPS 檢查點'] },
  { key: 'shopping', icon: 'shopping-bag', title: '購物中心 / 展館', sub: 'Indoor · 商場、展場', feats: ['店家位置圖', '消費任務', '室內 QR 任務'] },
];

const slugify = (s) =>
  (s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event')
    .slice(0, 40) + '-' + Date.now().toString(36).slice(-4);

export default function Page() {
  const router = useRouter();
  const [type, setType] = useState('city');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const eventName = name.trim() || TYPES.find((t) => t.key === type).title + '活動';
      const ev = await adminApi('/api/admin/events', {
        method: 'POST',
        body: { slug: slugify(eventName), name: eventName, event_type: type, config: { sections: DEFAULT_SECTIONS[type] }, reward_threshold: 2, reward_name: '紀念獎勵' },
      });
      router.push(`/builder?event=${ev.id}`);
    } catch (e) {
      if (e instanceof AuthRequired) return router.replace(loginUrl('/builder/new'));
      setError(e.message || '建立失敗');
      setBusy(false);
    }
  }

  return (
<div className="page-full" style={{display:'flex', flexDirection:'column'}}>

  {/* ── Wizard header ─────────────────────────────────────────────────── */}
  <div style={{height:'56px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 22px', gap:'11px'}}>
    <span style={{width:'20px', height:'20px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700'}}>1</span>
    <div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>建立新活動</div>
    <Link href="/dashboard" style={{marginLeft:'auto', width:'34px', height:'34px', borderRadius:'8px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'17px', textDecoration:'none'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></Link>
  </div>

  <div style={{flex:'1', background:'var(--surface-app)', padding:'44px 24px 40px'}}>
    <div style={{maxWidth:'820px', margin:'0 auto'}}>
      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.12em', textTransform:'uppercase', color:'var(--primary-600)', textAlign:'center'}}>步驟 1 · 建立</div>
      <h3 style={{margin:'10px 0 0', textAlign:'center', fontSize:'30px', fontWeight:'800', letterSpacing:'-.02em', color:'var(--text-strong)'}}>您想舉辦什麼活動？</h3>
      <p style={{margin:'12px auto 0', textAlign:'center', maxWidth:'60ch', fontSize:'15px', color:'var(--text-muted)', lineHeight:'1.6'}}>輸入活動名稱並選擇類型 — 系統會依活動類型自動生成網站架構、內容區塊與任務建議。</p>

      {/* Event name */}
      <div style={{marginTop:'28px', background:'#fff', border:'1.5px solid var(--primary-200)', borderRadius:'16px', boxShadow:'var(--shadow-md)', overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px', padding:'14px 18px', borderBottom:'1px solid var(--border-subtle)', flexWrap:'wrap'}}>
          <span style={{width:'30px', height:'30px', borderRadius:'8px', background:'linear-gradient(145deg,#6FCDE8,#0E7490)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="sparkles" /></span></span>
          <span style={{fontSize:'14px', fontWeight:'800', color:'var(--text-strong)'}}>活動名稱</span>
          <span style={{marginLeft:'auto', fontSize:'12px', color:'var(--text-subtle)'}}>網址代稱將自動生成</span>
        </div>
        <div style={{padding:'16px 18px'}}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：台南府城古蹟巡禮 2026"
            style={{width:'100%', height:'48px', border:'1px solid var(--border-default)', borderRadius:'10px', padding:'0 14px', fontSize:'15px', fontWeight:'600', color:'var(--text-strong)', outline:'none', background:'#fff'}}
          />
        </div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:'16px', margin:'26px 0 18px'}}><span style={{flex:'1', height:'1px', background:'var(--border-subtle)'}}></span><span style={{fontSize:'12px', fontWeight:'700', color:'var(--text-subtle)', letterSpacing:'.04em'}}>選擇活動類型</span><span style={{flex:'1', height:'1px', background:'var(--border-subtle)'}}></span></div>

      {/* Event type cards — interactive */}
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px'}}>
        {TYPES.map((t) => {
          const active = type === t.key;
          return (
            <button key={t.key} onClick={() => setType(t.key)} style={{textAlign:'left', cursor:'pointer', background:'#fff', border: active ? '1.5px solid var(--primary-600)' : '1px solid var(--border-subtle)', borderRadius:'14px', padding:'18px', boxShadow: active ? '0 0 0 3px var(--primary-50)' : 'none'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{width:'44px', height:'44px', borderRadius:'11px', background: active ? 'var(--primary-600)' : 'var(--primary-50)', color: active ? '#fff' : 'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'21px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={t.icon} /></span></span>
                {active
                  ? <span style={{color:'var(--primary-600)', fontSize:'20px', display:'inline-flex', lineHeight:'0'}}><Icon name="circle-check" /></span>
                  : <span style={{width:'20px', height:'20px', borderRadius:'9999px', border:'1.5px solid var(--border-default)'}}></span>}
              </div>
              <div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)', marginTop:'14px'}}>{t.title}</div>
              <div style={{fontSize:'12.5px', color:'var(--text-muted)', marginTop:'3px', lineHeight:'1.5'}}>{t.sub}</div>
              <div style={{marginTop:'14px', display:'flex', flexDirection:'column', gap:'8px'}}>
                {t.feats.map((f) => (
                  <div key={f} style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'12.5px', color:'var(--text-body)'}}><span style={{fontSize:'14px', color: active ? 'var(--success-600)' : 'var(--text-muted)', display:'inline-flex', lineHeight:'0'}}><Icon name="check" /></span>{f}</div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {error && <div style={{marginTop:'16px', padding:'12px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600'}}>{error}</div>}

      <div style={{display:'flex', alignItems:'center', gap:'12px', marginTop:'22px', flexWrap:'wrap'}}>
        <div style={{display:'flex', alignItems:'center', gap:'9px', flex:'1', minWidth:'260px', padding:'12px 15px', borderRadius:'11px', background:'var(--surface-brand-subtle)', border:'1px solid var(--primary-200)', fontSize:'12.5px', color:'var(--primary-800)', lineHeight:'1.5'}}><span style={{fontSize:'16px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name="info" /></span>網站架構與內容區塊會依類型自動生成 — 您可在步驟 2 進一步調整。</div>
        <button onClick={create} disabled={busy} style={{display:'inline-flex', alignItems:'center', gap:'8px', height:'46px', padding:'0 22px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', boxShadow:'var(--shadow-sm)', border:'none', cursor:'pointer', opacity: busy ? .6 : 1}}>{busy ? '建立中…' : '生成並編輯'}<span style={{fontSize:'16px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></button>
      </div>
    </div>
  </div>
</div>
  );
}
