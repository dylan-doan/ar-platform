'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../components/Icon';
import AdminShell from '../../components/admin/AdminShell';
import { adminApi, AuthRequired, loginUrl } from '../../lib/admin-client';
import { fmt, fmtCompact, fmtPct } from '../../lib/format';

const METHOD_META = {
  qr: { label: 'QR + AR', color: '#0E7490' },
  gps: { label: 'GPS + AR', color: '#3B82F6' },
  hybrid: { label: '混合', color: '#6FCDE8' },
};

const TYPE_META = {
  city: { icon: 'building-2', label: '城市' },
  hiking: { icon: 'mountain', label: '登山' },
  shopping: { icon: 'shopping-bag', label: '購物' },
};

function LineChart({ daily }) {
  const W = 640, H = 210, BASE = 190, TOP = 40;
  if (!daily.length) {
    return (
      <div style={{height:H, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-subtle)', fontSize:'13px'}}>尚無參與資料 — 完成第一個任務後即顯示</div>
    );
  }
  const pts = daily.length === 1 ? [daily[0], daily[0]] : daily;
  const max = Math.max(...pts.map((d) => d.participants), 1);
  const step = W / (pts.length - 1);
  const xy = pts.map((d, i) => [i * step, BASE - (d.participants / max) * (BASE - TOP)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${W},${BASE} L0,${BASE} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{display:'block'}}>
      <defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E7490" stopOpacity="0.22"/><stop offset="1" stopColor="#0E7490" stopOpacity="0"/></linearGradient></defs>
      <line x1="0" y1="40" x2={W} y2="40" stroke="#EEF2F6"/><line x1="0" y1="90" x2={W} y2="90" stroke="#EEF2F6"/><line x1="0" y1="140" x2={W} y2="140" stroke="#EEF2F6"/><line x1="0" y1={BASE} x2={W} y2={BASE} stroke="#E2E8F0"/>
      <path d={area} fill="url(#lg1)"/>
      <polyline points={line} fill="none" stroke="#0E7490" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lx} cy={ly} r="4.5" fill="#0E7490" stroke="#fff" strokeWidth="2"/>
    </svg>
  );
}

function MethodDonut({ methods }) {
  const R = 54, C = 2 * Math.PI * R;
  const total = methods.reduce((s, m) => s + m.completions, 0);
  let offset = 0;
  const segments = methods
    .filter((m) => m.completions > 0)
    .map((m) => {
      const len = (m.completions / total) * C;
      const seg = { ...m, len, offset };
      offset += len;
      return seg;
    });
  return (
    <div style={{display:'flex', alignItems:'center', gap:'18px', flexWrap:'wrap'}}>
      <svg viewBox="0 0 130 130" width="120" height="120" style={{flex:'0 0 auto'}}>
        <g transform="rotate(-90 65 65)">
          <circle cx="65" cy="65" r={R} fill="none" stroke="#EEF2F6" strokeWidth="18"/>
          {segments.map((s) => (
            <circle key={s.method} cx="65" cy="65" r={R} fill="none" stroke={METHOD_META[s.method]?.color || '#94A3B8'} strokeWidth="18" strokeDasharray={`${s.len.toFixed(2)} ${(C - s.len).toFixed(2)}`} strokeDashoffset={(-s.offset).toFixed(2)}/>
          ))}
        </g>
        <text x="65" y="61" textAnchor="middle" fontSize="21" fontWeight="800" fill="#0F1B2D" fontFamily="var(--font-sans)">{fmtCompact(total)}</text>
        <text x="65" y="79" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748B">任務</text>
      </svg>
      <div style={{display:'flex', flexDirection:'column', gap:'10px', fontSize:'12.5px', flex:'1', minWidth:'140px'}}>
        {(segments.length ? segments : [{ method: 'qr', completions: 0 }]).map((m) => (
          <div key={m.method} style={{display:'flex', alignItems:'center', gap:'8px'}}>
            <span style={{width:'10px', height:'10px', borderRadius:'3px', background:METHOD_META[m.method]?.color || '#94A3B8'}}></span>
            <span style={{color:'var(--text-body)', fontWeight:'600'}}>{METHOD_META[m.method]?.label || m.method}</span>
            <span style={{marginLeft:'auto', color:'var(--text-muted)', fontWeight:'700'}}>{total ? `${Math.round((m.completions / total) * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }) {
  return (
    <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'18px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}><span style={{fontSize:'12px', fontWeight:'600', color:'var(--text-muted)'}}>{label}</span><span style={{width:'32px', height:'32px', borderRadius:'8px', background:'var(--primary-50)', color:'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={icon} /></span></span></div>
      <div style={{fontSize:'30px', fontWeight:'800', color:'var(--text-strong)', letterSpacing:'-.02em', marginTop:'12px', fontVariantNumeric:'tabular-nums'}}>{value}</div>
      <div style={{display:'flex', alignItems:'center', gap:'5px', marginTop:'6px', fontSize:'12px', fontWeight:'500', color:'var(--text-subtle)'}}>累計資料 · 即時</div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const [ov, setOv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setOv(await adminApi('/api/admin/overview?days=14'));
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/dashboard'));
        setError(e.message);
      }
    })();
  }, [router]);

  return (
<AdminShell active="overview">
  <header className="app-topbar" style={{height:'66px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 26px', gap:'16px'}}>
    <div><div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)', letterSpacing:'-.01em'}}>總覽</div></div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap'}}>
      <div style={{display:'flex', alignItems:'center', gap:'9px', height:'38px', padding:'0 14px', borderRadius:'8px', border:'1px solid var(--border-default)', background:'#fff', fontSize:'13px', fontWeight:'600', color:'var(--text-body)'}}><span style={{width:'8px', height:'8px', borderRadius:'50%', background:'var(--success-500)'}}></span>全部活動<span style={{fontSize:'15px', color:'var(--text-muted)', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-down" /></span></div>
      <div style={{width:'38px', height:'38px', borderRadius:'8px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'18px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="search" /></span></div>
      <div style={{width:'38px', height:'38px', borderRadius:'8px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'18px', position:'relative'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="bell" /></span><span style={{position:'absolute', top:'8px', right:'9px', width:'7px', height:'7px', borderRadius:'50%', background:'var(--danger-500)', border:'1.5px solid #fff'}}></span></div>
    </div>
  </header>

  <div className="app-content">
    {error && <div style={{padding:'12px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'14px'}}>{error}</div>}
    {!ov && !error && <div style={{padding:'60px', textAlign:'center', color:'var(--text-subtle)'}}>載入中…</div>}
    {ov && (<>
      {/* KPI cards */}
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'16px'}}>
        <Kpi label="參與人次" value={fmt(ov.kpis.participants)} icon="users" />
        <Kpi label="完成任務數" value={fmt(ov.kpis.total_stamps)} icon="list-checks" />
        <Kpi label="已解鎖獎勵" value={fmt(ov.kpis.rewards_unlocked)} icon="award" />
        <Kpi label="完成率" value={fmtPct(ov.kpis.completion_rate)} icon="trophy" />
      </div>

      {/* Charts row */}
      <div className="grid-split" style={{display:'grid', gridTemplateColumns:'1.9fr 1fr', gap:'16px', marginBottom:'16px'}}>
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px'}}>
            <div><div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)'}}>每日參與人次</div><div style={{fontSize:'12px', color:'var(--text-muted)', marginTop:'2px'}}>最近 14 天</div></div>
            <div style={{display:'flex', gap:'6px'}}>
              <span style={{fontSize:'12px', fontWeight:'600', padding:'5px 11px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff'}}>14天</span>
              <span style={{fontSize:'12px', fontWeight:'600', padding:'5px 11px', borderRadius:'9999px', color:'var(--text-muted)'}}>30天</span>
              <span style={{fontSize:'12px', fontWeight:'600', padding:'5px 11px', borderRadius:'9999px', color:'var(--text-muted)'}}>季</span>
            </div>
          </div>
          <LineChart daily={ov.daily} />
        </div>
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'4px'}}>任務類型分布</div>
          <div style={{fontSize:'12px', color:'var(--text-muted)', marginBottom:'12px'}}>驗證方式分布</div>
          <MethodDonut methods={ov.methods} />
        </div>
      </div>

      {/* Events table */}
      <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border-subtle)', flexWrap:'wrap', gap:'10px'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)'}}>管理中的活動</div>
          <Link href="/builder/new" style={{display:'flex', alignItems:'center', gap:'8px', height:'36px', padding:'0 14px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', textDecoration:'none'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="plus" /></span>建立活動</Link>
        </div>
        <div className="table-scroll">
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'720px'}}>
            <thead><tr style={{textAlign:'left', color:'var(--text-muted)', fontSize:'11px', letterSpacing:'.06em', textTransform:'uppercase'}}>
              <th style={{padding:'11px 20px', fontWeight:'700'}}>活動</th><th style={{padding:'11px', fontWeight:'700'}}>類型</th><th style={{padding:'11px', fontWeight:'700'}}>任務</th><th style={{padding:'11px', fontWeight:'700', textAlign:'right'}}>參與人次</th><th style={{padding:'11px', fontWeight:'700'}}>狀態</th><th style={{padding:'11px 20px'}}></th>
            </tr></thead>
            <tbody style={{color:'var(--text-body)'}}>
              {ov.events.map((e) => {
                const t = TYPE_META[e.event_type] || TYPE_META.city;
                return (
                  <tr key={e.event_id} style={{borderTop:'1px solid var(--border-subtle)'}}>
                    <td style={{padding:'13px 20px'}}><div style={{fontWeight:'700', color:'var(--text-strong)'}}>{e.name}</div><div style={{color:'var(--text-subtle)', fontSize:'11.5px', fontFamily:'var(--font-mono)'}}>{e.slug}</div></td>
                    <td style={{padding:'13px'}}><span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 9px', borderRadius:'9999px', background:'var(--primary-50)', color:'var(--primary-700)', fontWeight:'600', fontSize:'11.5px'}}><span style={{fontSize:'12px', display:'inline-flex', lineHeight:'0'}}><Icon name={t.icon} /></span>{t.label}</span></td>
                    <td style={{padding:'13px', fontWeight:'600'}}>{e.tasks}</td>
                    <td style={{padding:'13px', textAlign:'right', fontWeight:'700', fontVariantNumeric:'tabular-nums'}}>{e.participants ? fmt(e.participants) : '—'}</td>
                    <td style={{padding:'13px'}}>
                      {e.is_active
                        ? <span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'9999px', background:'var(--status-success-bg)', color:'var(--status-success-fg)', fontWeight:'700', fontSize:'11.5px'}}><span style={{width:'6px', height:'6px', borderRadius:'50%', background:'currentColor'}}></span>進行中</span>
                        : <span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'9999px', background:'var(--status-neutral-bg)', color:'var(--status-neutral-fg)', fontWeight:'700', fontSize:'11.5px'}}><span style={{width:'6px', height:'6px', borderRadius:'50%', background:'currentColor'}}></span>停用</span>}
                    </td>
                    <td style={{padding:'13px 20px', textAlign:'right', color:'var(--text-muted)', fontSize:'17px'}}><Link href={`/builder?event=${e.event_id}`} style={{color:'inherit', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-right" /></Link></td>
                  </tr>
                );
              })}
              {!ov.events.length && (
                <tr style={{borderTop:'1px solid var(--border-subtle)'}}><td colSpan={6} style={{padding:'24px 20px', textAlign:'center', color:'var(--text-subtle)'}}>尚無活動 — 點擊「建立活動」開始</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>)}
  </div>
</AdminShell>
  );
}
