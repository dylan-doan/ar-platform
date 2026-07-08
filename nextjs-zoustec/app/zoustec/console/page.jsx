'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import { platformApi, AuthRequired, loginUrl, adminLogout } from '../../../lib/admin-client';
import { fmt, fmtCompact } from '../../../lib/format';

const PLAN_META = {
  saas: { label: 'SaaS', bg: 'var(--surface-brand-subtle)', fg: 'var(--primary-700)', bar: 'var(--primary-600)' },
  white_label: { label: 'White-label', bg: 'var(--status-info-bg)', fg: 'var(--status-info-fg)', bar: 'var(--info-500)' },
  one_time: { label: '單次', bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)', bar: 'var(--primary-300)' },
};

function MonthlyBars({ monthly }) {
  const W = 640, H = 190, BASE = 178;
  if (!monthly.length) {
    return <div style={{height:H, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-subtle)', fontSize:'13px'}}>尚無活動資料</div>;
  }
  const max = Math.max(...monthly.map((m) => m.stamps), 1);
  const n = monthly.length;
  const slot = W / n, barW = Math.min(60, slot * 0.58);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{display:'block'}}>
      <line x1="0" y1="40" x2={W} y2="40" stroke="#EEF2F6"/><line x1="0" y1="90" x2={W} y2="90" stroke="#EEF2F6"/><line x1="0" y1="140" x2={W} y2="140" stroke="#E2E8F0"/>
      <g fill="#0E7490">
        {monthly.map((m, i) => {
          const h = Math.max(4, (m.stamps / max) * 148);
          return <rect key={m.month} x={(i * slot + (slot - barW) / 2).toFixed(1)} y={(BASE - h).toFixed(1)} width={barW.toFixed(1)} height={h.toFixed(1)} rx="5" />;
        })}
      </g>
      <g fill="#64748B" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-sans)">
        {monthly.map((m, i) => (
          <text key={m.month} x={(i * slot + slot / 2).toFixed(1)} y={H - 0}>{m.month.slice(2).replace('-', '/')}</text>
        ))}
      </g>
    </svg>
  );
}

function Kpi({ label, value, icon }) {
  return (
    <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'18px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}><span style={{fontSize:'12px', fontWeight:'600', color:'var(--text-muted)'}}>{label}</span><span style={{width:'32px', height:'32px', borderRadius:'8px', background:'var(--primary-50)', color:'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={icon} /></span></span></div>
      <div style={{fontSize:'30px', fontWeight:'800', color:'var(--text-strong)', marginTop:'12px', fontVariantNumeric:'tabular-nums'}}>{value}</div>
      <div style={{display:'flex', alignItems:'center', gap:'5px', marginTop:'6px', fontSize:'12px', fontWeight:'500', color:'var(--text-subtle)'}}>累計資料 · 即時</div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const [ov, setOv] = useState(null);
  const [mgr, setMgr] = useState(null);       // full TenantOut being managed
  const [mgrForm, setMgrForm] = useState(null);
  const [mgrBusy, setMgrBusy] = useState(false);
  const [mgrError, setMgrError] = useState('');
  const [mgrFlash, setMgrFlash] = useState('');
  const [error, setError] = useState('');

  async function openManage(tenantId) {
    setMgrError('');
    try {
      const all = await platformApi('/api/platform/tenants');
      const t = all.find((x) => x.id === tenantId);
      if (!t) return;
      setMgr(t);
      setMgrForm({
        custom_domain: t.custom_domain || '',
        line_liff_id: t.line_liff_id || '',
        line_channel_id: t.line_channel_id || '',
        channel_secret: '',
        hide_powered_by: Boolean(t.brand_config?.hide_powered_by),
        plan: t.plan || 'saas',
        mrr_ntd: t.mrr_ntd ?? '',
      });
      setMgrFlash('');
    } catch (e) {
      if (e instanceof AuthRequired) return router.replace(loginUrl('/zoustec/console', { platform: true }));
      setError(e.message);
    }
  }

  async function saveManage() {
    if (!mgr || mgrBusy) return;
    setMgrBusy(true); setMgrError('');
    try {
      const body = {
        line_liff_id: mgrForm.line_liff_id || null,
        line_channel_id: mgrForm.line_channel_id || null,
        hide_powered_by: mgrForm.hide_powered_by,
        plan: mgrForm.plan,
        mrr_ntd: mgrForm.mrr_ntd === '' ? null : Number(mgrForm.mrr_ntd),
      };
      if (mgrForm.custom_domain) body.custom_domain = mgrForm.custom_domain.trim().toLowerCase();
      else body.clear_custom_domain = true;
      await platformApi(`/api/platform/tenants/${mgr.id}`, { method: 'PATCH', body });
      setMgr(null); setMgrForm(null);
      setOv(await platformApi('/api/platform/overview?months=6'));
    } catch (e) {
      if (e instanceof AuthRequired) return router.replace(loginUrl('/zoustec/console', { platform: true }));
      setMgrError(e.message);
    } finally { setMgrBusy(false); }
  }

  /** Spec item 5: the platform creates (or updates the endpoint of) the LIFF
   * app via the LIFF Server API — the customer provides Channel ID + Secret
   * just once. */
  async function provisionLiff() {
    if (!mgr || mgrBusy) return;
    setMgrBusy(true); setMgrError(''); setMgrFlash('');
    try {
      const t = await platformApi(`/api/platform/tenants/${mgr.id}/liff`, {
        method: 'POST',
        body: {
          channel_id: mgrForm.line_channel_id || null,
          channel_secret: mgrForm.channel_secret || null,
        },
      });
      setMgrForm({ ...mgrForm, line_liff_id: t.line_liff_id || '', channel_secret: '' });
      setMgrFlash(`LIFF app 已就緒 ✓ — ${t.line_liff_id}（Endpoint → https://${t.custom_domain}/）`);
    } catch (e) {
      if (e instanceof AuthRequired) return router.replace(loginUrl('/zoustec/console', { platform: true }));
      setMgrError(e.message);
    } finally { setMgrBusy(false); }
  }

  useEffect(() => {
    (async () => {
      try {
        setOv(await platformApi('/api/platform/overview?months=6'));
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/zoustec/console', { platform: true }));
        setError(e.message);
      }
    })();
  }, [router]);

  function logout() { adminLogout('platform'); router.replace(loginUrl('/zoustec/console', { platform: true })); }

  if (!ov) {
    return <div className="page-full" style={{display:'flex', alignItems:'center', justifyContent:'center', color: error ? 'var(--status-danger-fg)' : 'var(--text-subtle)', fontSize:'14px', fontWeight:'600'}}>{error || '載入中…'}</div>;
  }
  const { tenants, totals, plans, monthly } = ov;
  const planTotal = Object.values(plans).reduce((s, n) => s + n, 0) || 1;

  return (
<div className="app-shell">

  {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
  <aside className="app-sidebar">
    <div style={{display:'flex', alignItems:'center', gap:'11px', padding:'4px 8px 22px'}}>
      <div style={{width:'38px', height:'38px', borderRadius:'10px', background:'linear-gradient(145deg,var(--primary-500),var(--primary-700))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'20px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="server" /></span></div>
      <div><div style={{color:'#fff', fontWeight:'800', fontSize:'15px'}}>Zoustec</div><div style={{color:'#6FCDE8', fontSize:'11px', fontWeight:'600'}}>平台管理後台</div></div>
    </div>
    <div style={{fontSize:'10px', fontWeight:'700', letterSpacing:'.12em', color:'#4E7A88', padding:'8px 10px 6px'}}>平台</div>
    <a style={{display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', borderRadius:'8px', background:'var(--sidebar-active-bg)', color:'#fff', fontSize:'14px', fontWeight:'600', textDecoration:'none'}}><span style={{fontSize:'19px', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-dashboard" /></span>總覽</a>
    <div style={{fontSize:'10px', fontWeight:'700', letterSpacing:'.12em', color:'#4E7A88', padding:'18px 10px 6px'}}>系統</div>
    <a href="/portal" target="_blank" rel="noreferrer" style={{display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', borderRadius:'8px', color:'#B6D4DE', fontSize:'14px', fontWeight:'500', textDecoration:'none'}}><span style={{fontSize:'19px', display:'inline-flex', lineHeight:'0'}}><Icon name="globe" /></span>入口網站</a>
    <div style={{marginTop:'auto', display:'flex', alignItems:'center', gap:'11px', padding:'10px', borderTop:'1px solid rgba(255,255,255,.08)'}}>
      <div style={{width:'34px', height:'34px', borderRadius:'9999px', background:'var(--primary-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'13px'}}>ZT</div>
      <div style={{flex:'1', minWidth:'0'}}><div style={{color:'#fff', fontSize:'13px', fontWeight:'600'}}>Zoustec Team</div><div style={{color:'#6FCDE8', fontSize:'11px'}}>平台擁有者</div></div>
      <button onClick={logout} title="登出" style={{fontSize:'17px', color:'#8FB6C2', display:'inline-flex', lineHeight:'0', background:'none', border:'none', cursor:'pointer', padding:0}}><Icon name="log-out" /></button>
    </div>
  </aside>

  {/* ── Main column ───────────────────────────────────────────────────── */}
  <div className="app-main">
    <header className="app-topbar" style={{height:'66px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 26px', gap:'16px'}}>
      <div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)'}}>平台總覽</div>
      <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap'}}>
        <div style={{display:'flex', alignItems:'center', gap:'8px', height:'38px', padding:'0 14px', borderRadius:'8px', border:'1px solid var(--border-default)', fontSize:'13px', fontWeight:'600', color:'var(--text-body)'}}><span style={{fontSize:'15px', color:'var(--text-muted)', display:'inline-flex', lineHeight:'0'}}><Icon name="calendar" /></span>最近 6 個月</div>
      </div>
    </header>

    <div className="app-content">
      {/* KPI cards — live data */}
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'16px'}}>
        <Kpi label="客戶" value={fmt(totals.tenants)} icon="building-2" />
        <Kpi label="進行中活動" value={fmt(totals.active_events)} icon="calendar-check" />
        <Kpi label="集章總數" value={fmtCompact(totals.stamps)} icon="activity" />
        <Kpi label="營收 (MRR)" value={`NT$${fmtCompact(totals.mrr_ntd)}`} icon="credit-card" />
      </div>

      {/* Charts row — live data */}
      <div className="grid-split" style={{display:'grid', gridTemplateColumns:'1.9fr 1fr', gap:'16px', marginBottom:'16px'}}>
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'10px'}}><div><div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)'}}>全平台活動量</div><div style={{fontSize:'12px', color:'var(--text-muted)', marginTop:'2px'}}>每月完成任務數</div></div><span style={{fontSize:'12px', fontWeight:'700', color:'var(--primary-600)', background:'var(--primary-50)', padding:'5px 11px', borderRadius:'9999px'}}>6 個月</span></div>
          <MonthlyBars monthly={monthly} />
          <div style={{display:'flex', gap:'18px', marginTop:'12px', fontSize:'12px', flexWrap:'wrap'}}><span style={{display:'flex', alignItems:'center', gap:'7px', color:'var(--text-body)', fontWeight:'600'}}><span style={{width:'10px', height:'10px', borderRadius:'3px', background:'#0E7490'}}></span>完成任務（集章）</span></div>
        </div>
        <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', padding:'20px'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)', marginBottom:'16px'}}>服務方案</div>
          <div style={{display:'flex', flexDirection:'column', gap:'14px'}}>
            {['saas', 'white_label', 'one_time'].map((p) => {
              const meta = PLAN_META[p];
              const count = plans[p] || 0;
              return (
                <div key={p}>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'6px'}}><span style={{fontWeight:'600', color:'var(--text-body)'}}>{meta.label}</span><span style={{fontWeight:'700', color:'var(--text-strong)'}}>{count}</span></div>
                  <div style={{height:'8px', borderRadius:'9999px', background:'var(--surface-sunken)'}}><span style={{display:'block', height:'8px', width:`${Math.round((count / planTotal) * 100)}%`, borderRadius:'9999px', background:meta.bar}}></span></div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:'18px', paddingTop:'16px', borderTop:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:'10px'}}><span style={{width:'34px', height:'34px', borderRadius:'9px', background:'var(--status-success-bg)', color:'var(--status-success-fg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="users" /></span></span><div><div style={{fontSize:'12px', color:'var(--text-muted)'}}>全平台會員</div><div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)'}}>{fmt(totals.members)}</div></div></div>
        </div>
      </div>

      {/* Customers table — live data */}
      <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border-subtle)', flexWrap:'wrap', gap:'10px'}}><div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)'}}>客戶</div></div>
        <div className="table-scroll">
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'680px'}}>
            <thead><tr style={{textAlign:'left', color:'var(--text-muted)', fontSize:'11px', letterSpacing:'.06em', textTransform:'uppercase'}}><th style={{padding:'11px 20px', fontWeight:'700'}}>客戶</th><th style={{padding:'11px', fontWeight:'700'}}>方案</th><th style={{padding:'11px', fontWeight:'700'}}>活動</th><th style={{padding:'11px', fontWeight:'700', textAlign:'right'}}>會員</th><th style={{padding:'11px', fontWeight:'700', textAlign:'right'}}>MRR</th><th style={{padding:'11px', fontWeight:'700'}}>狀態</th><th style={{padding:'11px 20px'}}></th></tr></thead>
            <tbody style={{color:'var(--text-body)'}}>
              {tenants.map((t) => {
                const meta = PLAN_META[t.plan] || PLAN_META.saas;
                return (
                  <tr key={t.tenant_id} style={{borderTop:'1px solid var(--border-subtle)'}}>
                    <td style={{padding:'13px 20px'}}><div style={{display:'flex', alignItems:'center', gap:'11px'}}><span style={{width:'34px', height:'34px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'12px'}}>{t.name.slice(0, 2)}</span><div><div style={{fontWeight:'700', color:'var(--text-strong)'}}>{t.name}</div><div style={{color:'var(--text-subtle)', fontSize:'11.5px', fontFamily:'var(--font-mono)'}}>{t.slug}</div></div></div></td>
                    <td style={{padding:'13px'}}><span style={{display:'inline-flex', padding:'4px 10px', borderRadius:'9999px', background:meta.bg, color:meta.fg, fontWeight:'700', fontSize:'11.5px'}}>{meta.label}</span></td>
                    <td style={{padding:'13px', fontWeight:'600'}}>{t.events}</td>
                    <td style={{padding:'13px', textAlign:'right', fontWeight:'700', fontVariantNumeric:'tabular-nums'}}>{fmt(t.members)}</td>
                    <td style={{padding:'13px', textAlign:'right', fontWeight:'700', fontVariantNumeric:'tabular-nums'}}>{t.mrr_ntd ? `NT$${fmt(t.mrr_ntd)}` : '—'}</td>
                    <td style={{padding:'13px'}}>
                      {t.is_active
                        ? <span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'9999px', background:'var(--status-success-bg)', color:'var(--status-success-fg)', fontWeight:'700', fontSize:'11.5px'}}><span style={{width:'6px', height:'6px', borderRadius:'50%', background:'currentColor'}}></span>營運中</span>
                        : <span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'9999px', background:'var(--status-neutral-bg)', color:'var(--status-neutral-fg)', fontWeight:'700', fontSize:'11.5px'}}><span style={{width:'6px', height:'6px', borderRadius:'50%', background:'currentColor'}}></span>停用</span>}
                    </td>
                    <td style={{padding:'13px 20px', textAlign:'right'}}>
                      <button onClick={() => openManage(t.tenant_id)} title="白標設定" style={{width:'32px', height:'32px', borderRadius:'8px', border:'1px solid var(--border-subtle)', background:'#fff', color:'var(--text-muted)', fontSize:'15px', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="settings" /></span></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {/* ── Tenant white-label modal (spec §VIII) ───────────────────────── */}
    {mgr && mgrForm && (
      <div onClick={() => setMgr(null)} style={{position:'fixed', inset:0, zIndex:100, background:'rgba(11,41,53,.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff', borderRadius:'16px', boxShadow:'var(--shadow-xl)', padding:'22px', width:'100%', maxWidth:'440px', maxHeight:'88vh', overflow:'auto'}}>
          <div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>{mgr.name}</div>
          <div style={{fontSize:'12px', color:'var(--text-muted)', marginBottom:'16px', fontFamily:'var(--font-mono)'}}>{mgr.slug}</div>
          {mgrError && <div style={{padding:'10px', borderRadius:'8px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'12px', fontWeight:'600', marginBottom:'12px'}}>{mgrError}</div>}

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>自訂網域（Custom Domain）</label>
          <input value={mgrForm.custom_domain} onChange={(e) => setMgrForm({ ...mgrForm, custom_domain: e.target.value })} placeholder="walk.customer.tw（留空 = 未綁定）" style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', fontFamily:'var(--font-mono)', marginBottom:'4px', outline:'none'}} />
          <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'12px'}}>客戶將網域 CNAME 指向平台；本機測試可用 <span style={{fontFamily:'var(--font-mono)'}}>bnk.lvh.me</span></div>

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>LIFF ID（Option B — 客戶自有 LINE）</label>
          <input value={mgrForm.line_liff_id} onChange={(e) => setMgrForm({ ...mgrForm, line_liff_id: e.target.value })} placeholder="留空 = 使用平台共用 LIFF" style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', fontFamily:'var(--font-mono)', marginBottom:'12px', outline:'none'}} />

          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>LINE Channel ID</label>
          <input value={mgrForm.line_channel_id} onChange={(e) => setMgrForm({ ...mgrForm, line_channel_id: e.target.value })} placeholder="留空 = 平台共用" style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', fontFamily:'var(--font-mono)', marginBottom:'12px', outline:'none'}} />

          {/* Spec item 5 — 自動建立 LIFF: channel is made by hand, the LIFF app is created by the platform via API */}
          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>LINE Channel Secret（自動建立 LIFF 用）</label>
          <div style={{display:'flex', gap:'8px', marginBottom:'6px'}}>
            <input type="password" value={mgrForm.channel_secret} onChange={(e) => setMgrForm({ ...mgrForm, channel_secret: e.target.value })} placeholder="留空 = 使用已儲存的 Secret" autoComplete="off" style={{flex:1, height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', fontFamily:'var(--font-mono)', outline:'none'}} />
            <button onClick={provisionLiff} disabled={mgrBusy} style={{height:'40px', padding:'0 14px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'12.5px', fontWeight:'700', border:'none', cursor:'pointer', whiteSpace:'nowrap', opacity: mgrBusy ? .6 : 1}}>{mgrBusy ? '處理中…' : '自動建立 LIFF'}</button>
          </div>
          <div style={{fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.6, marginBottom:'12px'}}>
            需先綁定自訂網域 — LIFF Endpoint 會指向該網域。已有本 channel 的 LIFF 時改為更新 Endpoint（客戶換網域後按一次即可）。
          </div>
          {mgrFlash && <div style={{padding:'9px 12px', borderRadius:'8px', background:'var(--status-success-bg, #ECFDF5)', color:'var(--status-success-fg, #047857)', fontSize:'12px', fontWeight:'700', marginBottom:'12px'}}>{mgrFlash}</div>}

          <div style={{display:'flex', gap:'10px', marginBottom:'12px'}}>
            <div style={{flex:1}}>
              <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>方案</label>
              <select value={mgrForm.plan} onChange={(e) => setMgrForm({ ...mgrForm, plan: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 9px', fontSize:'13px', background:'#fff'}}>
                <option value="saas">SaaS</option>
                <option value="white_label">White-label</option>
                <option value="one_time">單次</option>
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>MRR（NT$）</label>
              <input type="number" min="0" value={mgrForm.mrr_ntd} onChange={(e) => setMgrForm({ ...mgrForm, mrr_ntd: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', outline:'none'}} />
            </div>
          </div>

          <label style={{display:'flex', alignItems:'center', gap:'9px', fontSize:'13px', fontWeight:'600', color:'var(--text-body)', marginBottom:'18px', cursor:'pointer'}}>
            <input type="checkbox" checked={mgrForm.hide_powered_by} onChange={(e) => setMgrForm({ ...mgrForm, hide_powered_by: e.target.checked })} style={{width:'16px', height:'16px', accentColor:'var(--primary-600)'}} />
            隱藏「Powered by Zoustec」（完全白標）
          </label>

          <div style={{display:'flex', gap:'9px'}}>
            <button onClick={saveManage} disabled={mgrBusy} style={{flex:1, height:'44px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity: mgrBusy ? .6 : 1}}>{mgrBusy ? '儲存中…' : '儲存'}</button>
            <button onClick={() => setMgr(null)} style={{width:'44px', height:'44px', borderRadius:'9999px', background:'#fff', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></button>
          </div>
        </div>
      </div>
    )}

    {/* ── Bottom navigation (mobile) ──────────────────────────────────── */}
    <nav className="app-bottom-nav">
      <a className="bn-item active"><span style={{fontSize:'21px', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-dashboard" /></span>總覽</a>
      <a className="bn-item" href="/portal" target="_blank" rel="noreferrer"><span style={{fontSize:'21px', display:'inline-flex', lineHeight:'0'}}><Icon name="globe" /></span>入口網站</a>
      <button onClick={logout} className="bn-item" style={{background:'none', border:'none', cursor:'pointer'}}>
        <span style={{fontSize:'21px', display:'inline-flex', lineHeight:'0'}}><Icon name="log-out" /></span>登出
      </button>
    </nav>
  </div>
</div>
  );
}
