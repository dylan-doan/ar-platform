'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import AdminShell from '../../../components/admin/AdminShell';
import { adminApi, AuthRequired, loginUrl } from '../../../lib/admin-client';
import { fmt, fmtDate } from '../../../lib/format';

const ROLE_LABEL = { member: '參與者', tenant_admin: '管理員', platform_admin: '平台管理員' };

/** Client-side CSV export of the loaded table (spec §IX "xuất báo cáo"). */
function exportCsv(members) {
  const header = ['display_name', 'line_user_id', 'role', 'joined_at', 'stamps', 'rewards'];
  const rows = members.map((m) =>
    [m.display_name, m.line_user_id, m.role, m.created_at, m.stamps, m.rewards]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  // BOM để Excel mở tiếng Trung/Việt không vỡ font.
  const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const router = useRouter();
  const [members, setMembers] = useState(null);
  const [activeTasks, setActiveTasks] = useState(0);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ms, ov] = await Promise.all([
          adminApi('/api/admin/members'),
          adminApi('/api/admin/overview?days=14'),
        ]);
        setMembers(ms);
        setActiveTasks(ov.kpis.active_tasks || 0);
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/dashboard/members'));
        setError(e.message);
      }
    })();
  }, [router]);

  const filtered = (members || []).filter((m) =>
    !q.trim() || m.display_name.toLowerCase().includes(q.trim().toLowerCase()) || m.line_user_id.includes(q.trim())
  );

  return (
<AdminShell active="members">
  <header className="app-topbar" style={{height:'66px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 26px', gap:'16px'}}>
    <div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)', letterSpacing:'-.01em'}}>參與者</div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap'}}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', height:'38px', padding:'0 12px', borderRadius:'8px', border:'1px solid var(--border-default)', background:'#fff'}}>
        <span style={{fontSize:'15px', color:'var(--text-muted)', display:'inline-flex', lineHeight:'0'}}><Icon name="search" /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名 / LINE ID…" style={{border:'none', outline:'none', fontSize:'13px', width:'170px', color:'var(--text-strong)', background:'transparent'}} />
      </div>
      <button onClick={() => exportCsv(filtered)} disabled={!filtered.length}
        style={{display:'flex', alignItems:'center', gap:'8px', height:'38px', padding:'0 15px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', border:'none', cursor:'pointer', opacity: filtered.length ? 1 : .5}}>
        <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="download" /></span>匯出 CSV
      </button>
    </div>
  </header>

  <div className="app-content">
    {error && <div style={{padding:'12px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'14px'}}>{error}</div>}
    {!members && !error && <div style={{padding:'60px', textAlign:'center', color:'var(--text-subtle)'}}>載入中…</div>}
    {members && (
      <div style={{background:'#fff', border:'1px solid var(--border-subtle)', borderRadius:'12px', boxShadow:'var(--shadow-sm)', overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border-subtle)'}}>
          <div style={{fontSize:'15px', fontWeight:'700', color:'var(--text-strong)'}}>全部參與者</div>
          <div style={{fontSize:'12.5px', color:'var(--text-muted)', fontWeight:'600'}}>{fmt(filtered.length)} 位{q ? `（篩選自 ${fmt(members.length)}）` : ''}</div>
        </div>
        <div className="table-scroll">
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'760px'}}>
            <thead><tr style={{textAlign:'left', color:'var(--text-muted)', fontSize:'11px', letterSpacing:'.06em', textTransform:'uppercase'}}>
              <th style={{padding:'11px 20px', fontWeight:'700'}}>姓名（LINE）</th>
              <th style={{padding:'11px', fontWeight:'700'}}>身份</th>
              <th style={{padding:'11px', fontWeight:'700'}}>加入日期</th>
              <th style={{padding:'11px', fontWeight:'700', textAlign:'right'}}>印章</th>
              <th style={{padding:'11px', fontWeight:'700', width:'220px'}}>進度</th>
              <th style={{padding:'11px 20px', fontWeight:'700', textAlign:'right'}}>獎勵</th>
            </tr></thead>
            <tbody style={{color:'var(--text-body)'}}>
              {filtered.map((m) => {
                const pct = activeTasks ? Math.min(100, Math.round((m.stamps / activeTasks) * 100)) : 0;
                return (
                  <tr key={m.id} style={{borderTop:'1px solid var(--border-subtle)'}}>
                    <td style={{padding:'13px 20px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'11px'}}>
                        <span style={{width:'34px', height:'34px', borderRadius:'9999px', background:'var(--primary-100)', color:'var(--primary-700)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'12px', flex:'0 0 auto'}}>{(m.display_name || '?').slice(0, 2)}</span>
                        <div><div style={{fontWeight:'700', color:'var(--text-strong)'}}>{m.display_name || '—'}</div><div style={{color:'var(--text-subtle)', fontSize:'11px', fontFamily:'var(--font-mono)'}}>{m.line_user_id}</div></div>
                      </div>
                    </td>
                    <td style={{padding:'13px'}}>
                      <span style={{display:'inline-flex', padding:'4px 10px', borderRadius:'9999px', background: m.role === 'member' ? 'var(--status-neutral-bg)' : 'var(--status-info-bg)', color: m.role === 'member' ? 'var(--status-neutral-fg)' : 'var(--status-info-fg)', fontWeight:'700', fontSize:'11.5px'}}>{ROLE_LABEL[m.role] || m.role}</span>
                    </td>
                    <td style={{padding:'13px', fontVariantNumeric:'tabular-nums'}}>{fmtDate(m.created_at)}</td>
                    <td style={{padding:'13px', textAlign:'right', fontWeight:'700', fontVariantNumeric:'tabular-nums'}}>{fmt(m.stamps)}</td>
                    <td style={{padding:'13px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <div style={{flex:1, height:'7px', borderRadius:'9999px', background:'var(--surface-sunken)'}}><span style={{display:'block', height:'7px', width:`${pct}%`, borderRadius:'9999px', background:'var(--primary-600)'}}></span></div>
                        <span style={{fontSize:'11.5px', fontWeight:'700', color:'var(--text-muted)', minWidth:'34px', textAlign:'right'}}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{padding:'13px 20px', textAlign:'right'}}>
                      {m.rewards > 0
                        ? <span style={{display:'inline-flex', alignItems:'center', gap:'5px', padding:'4px 10px', borderRadius:'9999px', background:'var(--status-warning-bg)', color:'var(--status-warning-fg)', fontWeight:'700', fontSize:'11.5px'}}><span style={{fontSize:'12px', display:'inline-flex', lineHeight:'0'}}><Icon name="award" /></span>{m.rewards}</span>
                        : <span style={{color:'var(--text-subtle)'}}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr style={{borderTop:'1px solid var(--border-subtle)'}}><td colSpan={6} style={{padding:'24px 20px', textAlign:'center', color:'var(--text-subtle)'}}>{q ? '找不到符合的參與者' : '尚無參與者'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
</AdminShell>
  );
}
