'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../../components/Icon';
import AdminShell from '../../../components/admin/AdminShell';
import { adminApi, adminSession, AuthRequired, loginUrl } from '../../../lib/admin-client';
import { DEFAULT_SECTIONS } from '../../../lib/event-sections';
import SiteBody, { siteView } from '../../../components/event/SiteBody';

const TYPE_META = {
  city: { icon: 'building-2', label: '城市探索', template: 'Urban Explorer' },
  hiking: { icon: 'mountain', label: '登山步道', template: 'Trail Guide' },
  shopping: { icon: 'shopping-bag', label: '購物中心 / 展館', template: 'Mall Quest' },
};
const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };
// Demo checkpoint (Ho Chi Minh Square, Vinh) — quick-add GPS/hybrid
// tasks get a valid location the admin can fine-tune later.
const DEFAULT_LOCATION = { lat: 18.6766, lng: 105.6853 };

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';

/** Printed-QR payload (spec §II.3.A "Admin creates QR Code"): a LIFF deep-link
 * that opens LINE → auto-login → jumps straight into this task's AR screen
 * with the secret pre-applied. Path-style (`/ID/path?query`) because the LIFF
 * endpoint URL is the site root. Falls back to a web URL without a LIFF ID. */
function taskQrUrl(event, task, brand) {
  // The real tenant comes from branding (the env slug is only a dev
  // fallback); the tenant's own LIFF app (white-label plan) beats the shared one.
  const tenant = brand?.tenant_slug || TENANT;
  const liffId = brand?.line_liff_id || LIFF_ID;
  const params = new URLSearchParams({ tenant, event: event.id, task: task.id });
  if (task.qr_token) params.set('qr', task.qr_token);
  return liffId
    ? `https://liff.line.me/${liffId}/experience/login?${params}`
    : `${window.location.origin}/experience/login?${params}`;
}

/** Inert nav / CTA look-alikes — the preview must LOOK like the site without
 * navigating away from the builder or opening the LIFF QR modal. */
function previewNav(nav) {
  if (!nav.length) return null;
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px', flexWrap: 'wrap' }}>
      {nav.map((it) => (
        <span key={it.slug} style={{ padding: '5px 10px', borderRadius: '9999px', background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.92)', fontSize: '11.5px', fontWeight: 600 }}>{it.label}</span>
      ))}
    </nav>
  );
}
const previewCta = (
  <>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 20px', borderRadius: 'var(--site-btn-radius, 9999px)', background: '#fff', color: 'var(--brand-dark, #134E61)', fontSize: '13.5px', fontWeight: 800 }}>
      <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="qr-code" /></span>開始旅程
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 17px', borderRadius: 'var(--site-btn-radius, 9999px)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: '13px', fontWeight: 600, border: '1px solid rgba(255,255,255,.25)' }}>查看地圖</span>
  </>
);

/** Scaled-down render of the REAL site — SiteBody is the same component the
 * public page and the designer canvas use, so the three cannot disagree. */
function SitePreview({ event, tasks, brand }) {
  const view = siteView(event);
  const nav = (event?.config?.pages || []).filter((p) => p?.slug && p.nav !== false)
    .map((p) => ({ label: p.title || p.slug, href: '#', slug: p.slug }));
  const branding = {
    tenant_name: brand?.tenant_name || '',
    logo_url: brand?.logo_url || '',
    show_powered_by: brand?.show_powered_by,
  };
  // Same metadata contract as the public site so smart blocks + chrome render
  // real numbers, the live menu and the tenant's brand.
  const md = { event, tasks, branding, nav, eventHref: '#', joinHref: '#', currentSlug: null };
  return (
    <SiteBody
      compact
      event={event}
      tasks={tasks}
      branding={branding}
      view={view}
      metadata={md}
      nav={previewNav(nav)}
      heroCta={previewCta}
      statusLabel={event?.is_active ? '進行中' : '草稿'}
      emptyHint={<div style={{ padding: '26px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>尚無版面區塊 — 於「拖曳設計」新增</div>}
    />
  );
}

export default function Page() {
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(null); // {name, description, reward_name, reward_threshold}
  const [newTask, setNewTask] = useState({ name: '', verification_type: 'qr' });
  const [qrModal, setQrModal] = useState(null); // {task, dataUrl, url}
  const [noEvents, setNoEvents] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null); // null = event settings mode
  const [taskForm, setTaskForm] = useState(null);
  const [models, setModels] = useState([]); // succeeded AR-Studio jobs
  const [brand, setBrand] = useState(null); // tenant slug + own LIFF (QR links)
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const events = await adminApi('/api/admin/events');
        if (!events.length) { setNoEvents(true); return; }
        const params = new URLSearchParams(window.location.search);
        const ev = events.find((e) => e.id === params.get('event')) || events[0];
        setEvent(ev);
        setForm({ name: ev.name, description: ev.description || '', reward_name: ev.reward_name || '', reward_threshold: ev.reward_threshold || 1, sections: ev.config?.sections?.length ? ev.config.sections : (DEFAULT_SECTIONS[ev.event_type] || []), heroImage: ev.config?.heroImage || '' });
        setTasks(await adminApi(`/api/admin/events/${ev.id}/tasks`));
        try {
          const b = await adminApi('/api/admin/branding');
          setBrand(b);
          if (b.theme_color) {
            const { applyBrand } = await import('../../../lib/brand');
            applyBrand(b.theme_color);
          }
        } catch { /* platform default */ }
        try {
          const jobs = await adminApi('/api/admin/model3d/jobs');
          setModels(jobs.filter((j) => j.status === 'succeeded' && j.result_glb_url));
        } catch { /* AR Studio list is optional here */ }
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/builder'));
        setError(e.message);
      }
    })();
  }, [router]);

  function guard(e) {
    if (e instanceof AuthRequired) { router.replace(loginUrl('/admin/builder')); return true; }
    return false;
  }

  function note(msg) { setFlash(msg); setTimeout(() => setFlash(''), 2500); }

  async function addTask() {
    if (!event || !newTask.name.trim() || busy) return;
    setBusy('task'); setError('');
    try {
      const body = {
        name: newTask.name.trim(),
        verification_type: newTask.verification_type,
        sort_order: tasks.length + 1,
        ar_config: { glbUrl: '/models/mascot.glb', targetUrl: '/targets/demo.mind', scale: 0.4 },
      };
      if (newTask.verification_type !== 'qr') { body.location = DEFAULT_LOCATION; body.radius_m = 100; }
      const t = await adminApi(`/api/admin/events/${event.id}/tasks`, { method: 'POST', body });
      setTasks([...tasks, t]); setNewTask({ name: '', verification_type: 'qr' }); selectTask(t); note('已新增任務 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  async function removeTask(id) {
    if (busy) return;
    setBusy('del'); setError('');
    try {
      await adminApi(`/api/admin/tasks/${id}`, { method: 'DELETE', raw: true });
      setTasks(tasks.filter((t) => t.id !== id)); note('已刪除任務');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  function selectTask(t) {
    setSelectedTask(t);
    const glbUrl = t.ar_config?.glbUrl || '/models/mascot.glb';
    const savedTarget = t.ar_config?.targetUrl || '/targets/demo.mind';
    // Job match first: with the mock engine every job serves the same GLB
    // file, so testing the demo URL first would swallow AI jobs into "demo".
    const glbJob = models.find((m) => m.result_glb_url === glbUrl);
    const glbKey = glbJob ? `job:${glbJob.id}` : glbUrl === '/models/mascot.glb' ? 'demo' : 'custom';
    // Target is the same-image pair of the model — keep it locked to the
    // selected model (older data may have a mismatched target; re-pair it so
    // the read-only display and the saved value never disagree).
    const targetUrl = glbJob ? (glbJob.params?.targetUrl || '') : savedTarget;
    setTaskForm({
      name: t.name,
      description: t.description || '',
      verification_type: t.verification_type,
      coords: t.location ? `${t.location.lat}, ${t.location.lng}` : '18.6766, 105.6853',
      radius_m: t.radius_m || 100,
      glbUrl,
      targetUrl,
      glbKey,
      targetKey: glbKey,
      scale: t.ar_config?.scale ?? 0.4,
    });
  }

  // The GLB and its AR target are one pair: both come from the SAME 2D image
  // in AR Studio (image → AI 3D model + compiled .mind target). The target is
  // never chosen separately — it always follows the selected model, so a task
  // can't mix model A's mesh with model B's printed marker.
  function onModelSelect(v) {
    if (v === 'demo') {
      return setTaskForm({ ...taskForm, glbKey: 'demo', glbUrl: '/models/mascot.glb', targetKey: 'demo', targetUrl: '/targets/demo.mind' });
    }
    if (v === 'custom') {
      // External model: no auto-paired target — the admin supplies both URLs.
      return setTaskForm({ ...taskForm, glbKey: 'custom', targetKey: 'custom' });
    }
    const m = models.find((x) => `job:${x.id}` === v);
    if (!m) return;
    setTaskForm({
      ...taskForm,
      glbKey: v,
      glbUrl: m.result_glb_url,
      // Its own compiled target (empty until the .mind is compiled in AR Studio).
      targetKey: v,
      targetUrl: m.params?.targetUrl || '',
    });
  }

  async function saveTask() {
    if (!selectedTask || busy) return;
    setBusy('savetask'); setError('');
    try {
      // A model without its paired target can't be tracked by the AR camera —
      // block the save and point the admin to compile it in AR Studio.
      if (!taskForm.targetUrl.trim()) {
        throw new Error('此模型尚未有 AR 目標圖 — 請先到 AR Studio 完成「編譯辨識目標」。');
      }
      const body = {
        name: taskForm.name,
        description: taskForm.description,
        verification_type: taskForm.verification_type,
        ar_config: { glbUrl: taskForm.glbUrl.trim(), targetUrl: taskForm.targetUrl.trim(), scale: Number(taskForm.scale) || 0.4 },
      };
      if (taskForm.verification_type !== 'qr') {
        const parts = String(taskForm.coords).split(',').map((x) => parseFloat(x.trim()));
        if (parts.length !== 2 || parts.some(Number.isNaN)) throw new Error('座標格式：緯度, 經度（例：18.6766, 105.6853）');
        body.location = { lat: parts[0], lng: parts[1] };
        body.radius_m = Math.max(5, Number(taskForm.radius_m) || 100);
      }
      const updated = await adminApi(`/api/admin/tasks/${selectedTask.id}`, { method: 'PATCH', body });
      setTasks(tasks.map((x) => (x.id === updated.id ? updated : x)));
      selectTask(updated);
      note('任務已儲存 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  async function showQr(task) {
    setError('');
    try {
      const url = taskQrUrl(event, task, brand);
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
      setQrModal({ task, dataUrl, url });
    } catch (e) { setError(e.message); }
  }

  /** Full Next.js project zip — the same renderers the platform serves, so the
   * self-hosted site matches this one. Content live-syncs via the customer's
   * tenant API key (issued in the Zoustec console; pasted into .env.local). */
  async function exportBundle() {
    if (!event || busy) return;
    setBusy('export'); setError('');
    try {
      const s = adminSession.get('tenant');
      const res = await fetch('/api/export-nextjs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s?.token || ''}` },
        body: JSON.stringify({ eventId: event.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message || `HTTP ${res.status}`);
      }
      const name = (res.headers.get('content-disposition')?.match(/filename="(.+)"/) || [])[1]
        || `${event.slug}-site.zip`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      note('已匯出 Next.js 專案 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  const meta = TYPE_META[event?.event_type] || TYPE_META.city;
  // The AI-3D job currently selected as the task's model (drives the paired,
  // read-only target display below the model dropdown).
  const selectedModel = taskForm?.glbKey?.startsWith('job:')
    ? models.find((m) => `job:${m.id}` === taskForm.glbKey)
    : null;

  return (
<AdminShell active="builder">
<div className="editor-shell">

  {/* ── Toolbar ───────────────────────────────────────────────────────── */}
  <div className="editor-topbar" style={{height:'60px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 20px', gap:'18px'}}>
    <div style={{display:'flex', alignItems:'center', gap:'9px', fontSize:'14px', fontWeight:'700', color:'var(--text-strong)'}}><span style={{fontSize:'17px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span>網站產生器</div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px'}}>
      {flash && <span style={{fontSize:'12.5px', fontWeight:'700', color:'var(--success-600)'}}>{flash}</span>}
      {event && <Link href={`/admin/builder/design?event=${event.id}`} style={{display:'flex', alignItems:'center', gap:'7px', height:'36px', padding:'0 13px', borderRadius:'8px', border:'1px solid var(--primary-200)', background:'var(--primary-50)', color:'var(--primary-700)', fontSize:'13px', fontWeight:'700', textDecoration:'none'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-dashboard" /></span>拖曳設計</Link>}
      <button onClick={exportBundle} disabled={busy === 'export'} style={{display:'flex', alignItems:'center', gap:'7px', height:'36px', padding:'0 15px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', border:'none', cursor:'pointer'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="download" /></span>{busy === 'export' ? '匯出中…' : '匯出範本'}</button>
    </div>
  </div>

  {/* ── Editor body ───────────────────────────────────────────────────── */}
  <div className="editor-body">
    {noEvents ? (
      <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px', padding:'40px', textAlign:'center'}}>
        <span style={{width:'64px', height:'64px', borderRadius:'18px', background:'var(--primary-50)', color:'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span></span>
        <div style={{fontSize:'19px', fontWeight:'800', color:'var(--text-strong)'}}>貴組織尚未有任何活動</div>
        <div style={{fontSize:'13.5px', color:'var(--text-muted)', maxWidth:'42ch', lineHeight:1.6}}>從精靈開始：輸入活動名稱、選擇類型（城市探索／登山步道／購物中心）— 系統會自動生成網站架構。</div>
        <Link href="/admin/builder/new" style={{display:'inline-flex', alignItems:'center', gap:'9px', height:'48px', padding:'0 26px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14.5px', fontWeight:'700', textDecoration:'none', boxShadow:'var(--shadow-sm)'}}><span style={{fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="plus" /></span>建立第一個活動</Link>
      </div>
    ) : (<>

    {/* Tasks panel */}
    <aside className="editor-aside" style={{width:'310px', flex:'0 0 auto', background:'#fff', borderRight:'1px solid var(--border-subtle)', display:'flex', flexDirection:'column', padding:'16px 14px'}}>
      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', margin:'2px 6px 10px'}}>活動類型</div>
      <div style={{display:'flex', alignItems:'center', gap:'10px', padding:'11px', borderRadius:'10px', background:'var(--primary-50)', border:'1px solid var(--primary-200)', marginBottom:'16px'}}><span style={{width:'34px', height:'34px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={meta.icon} /></span></span><div><div style={{fontSize:'13px', fontWeight:'700', color:'var(--primary-800)'}}>{meta.label}</div><div style={{fontSize:'11px', color:'var(--primary-700)'}}>範本 · {meta.template}</div></div></div>

      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', margin:'2px 6px 10px'}}>任務（{tasks.length}）</div>
      <div style={{display:'flex', flexDirection:'column', gap:'7px'}}>
        {tasks.map((t) => (
          <div key={t.id} onClick={() => selectTask(t)} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px 11px', borderRadius:'9px', border: selectedTask?.id === t.id ? '1.5px solid var(--primary-600)' : '1px solid var(--border-subtle)', background: selectedTask?.id === t.id ? 'var(--primary-50)' : '#fff', fontSize:'13px', fontWeight:'500', color:'var(--text-body)', cursor:'pointer'}}>
            <span style={{fontSize:'15px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name={METHOD_ICON[t.verification_type] || 'qr-code'} /></span>
            <div style={{flex:'1', minWidth:0}}>
              <div style={{fontWeight:'600', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{t.name}</div>
              <div style={{fontSize:'10.5px', color:'var(--text-subtle)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{t.qr_token || METHOD_LABEL[t.verification_type]}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); showQr(t); }} title="產生 QR Code（列印用）" style={{border:'none', background:'none', color:'var(--primary-600)', fontSize:'15px', cursor:'pointer', display:'inline-flex', lineHeight:'0'}}><Icon name="qr-code" /></button>
            <button onClick={(e) => { e.stopPropagation(); removeTask(t.id); if (selectedTask?.id === t.id) { setSelectedTask(null); setTaskForm(null); } }} title="刪除" style={{border:'none', background:'none', color:'var(--text-subtle)', fontSize:'14px', cursor:'pointer', display:'inline-flex', lineHeight:'0'}}><Icon name="trash-2" /></button>
          </div>
        ))}
      </div>

      {/* Quick add */}
      <div style={{marginTop:'12px', padding:'11px', borderRadius:'9px', border:'1.5px dashed var(--border-default)', display:'flex', flexDirection:'column', gap:'8px'}}>
        <input value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} placeholder="新任務名稱…" style={{height:'36px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 10px', fontSize:'13px', outline:'none'}} />
        <div style={{display:'flex', gap:'6px'}}>
          <select value={newTask.verification_type} onChange={(e) => setNewTask({ ...newTask, verification_type: e.target.value })} style={{flex:1, height:'34px', border:'1px solid var(--border-default)', borderRadius:'8px', fontSize:'12.5px', padding:'0 6px', background:'#fff', color:'var(--text-body)'}}>
            <option value="qr">QR + AR</option>
            <option value="gps">GPS + AR</option>
            <option value="hybrid">混合驗證</option>
          </select>
          <button onClick={addTask} disabled={busy === 'task' || !newTask.name.trim()} style={{display:'inline-flex', alignItems:'center', gap:'5px', height:'34px', padding:'0 12px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'12.5px', fontWeight:'700', border:'none', cursor:'pointer'}}><span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="plus" /></span>新增</button>
        </div>
        <div style={{fontSize:'10.5px', color:'var(--text-subtle)', lineHeight:1.4}}>QR 代碼自動生成；GPS 任務預設榮市胡志明廣場座標（可於後台調整）。</div>
      </div>
    </aside>

    {/* Canvas — live preview of the REAL site (same renderer as production) */}
    <div className="editor-canvas" style={{padding:'26px', display:'flex', justifyContent:'center', alignItems:'flex-start'}}>
      <div style={{width:'100%', maxWidth:'640px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'9px', fontSize:'11.5px', color:'var(--text-subtle)'}}>
          <span style={{display:'inline-flex', lineHeight:'0', fontSize:'13px'}}><Icon name="eye" /></span>
          實際網站預覽 — 與公開網站相同的版面與佈景主題
          <a href={`/e/${brand?.tenant_slug || TENANT}/${event?.slug}`} target="_blank" rel="noreferrer" style={{marginLeft:'auto', color:'var(--primary-600)', fontWeight:'700', textDecoration:'none'}}>公開網站 ↗</a>
        </div>
        <div style={{background:'#fff', borderRadius:'14px', overflow:'hidden', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border-subtle)'}}>
          <SitePreview event={event} tasks={tasks} brand={brand} />
        </div>
      </div>
    </div>

    {/* Properties panel — live edit */}
    <aside className="editor-aside" style={{width:'340px', flex:'0 0 auto', background:'#fff', borderLeft:'1px solid var(--border-subtle)', padding:'18px 16px'}}>
      <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'4px'}}>{selectedTask ? '任務設定' : '活動'}</div>
      <div style={{fontSize:'11.5px', color:'var(--text-muted)', marginBottom:'16px'}}>{selectedTask ? `編輯「${selectedTask.name}」— 每個任務可獨立設定` : '任務與 QR 在此管理；內容與設計在拖曳設計'}</div>
      {error && <div style={{padding:'10px', borderRadius:'8px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'12px', fontWeight:'600', marginBottom:'12px'}}>{error}</div>}
      {selectedTask && taskForm ? (<>
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>任務名稱</label>
        <input value={taskForm.name} onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-strong)', fontWeight:'600', marginBottom:'12px', outline:'none'}} />

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>任務說明</label>
        <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'12px', outline:'none', resize:'vertical', fontFamily:'inherit'}} />

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>驗證方式</label>
        <select value={taskForm.verification_type} onChange={(e) => setTaskForm({ ...taskForm, verification_type: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 9px', fontSize:'13px', color:'var(--text-body)', marginBottom:'12px', background:'#fff'}}>
          <option value="qr">QR + AR（掃描現場 QR）</option>
          <option value="gps">GPS + AR（到場定位）</option>
          <option value="hybrid">混合（QR 且 GPS）</option>
        </select>

        {taskForm.verification_type !== 'qr' && (<>
          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>GPS 座標（緯度, 經度）</label>
          <input value={taskForm.coords} onChange={(e) => setTaskForm({ ...taskForm, coords: e.target.value })} placeholder="18.6766, 105.6853" style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-strong)', fontFamily:'var(--font-mono)', marginBottom:'6px', outline:'none'}} />
          <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'10px', lineHeight:1.5}}>Google Maps → 按右鍵地點 → 複製座標貼上。<a href={`https://maps.google.com/?q=${encodeURIComponent(taskForm.coords)}`} target="_blank" rel="noreferrer" style={{color:'var(--primary-600)', fontWeight:'700'}}>在地圖上檢視 ↗</a></div>
          <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>感應半徑（公尺）</label>
          <input type="number" min={5} value={taskForm.radius_m} onChange={(e) => setTaskForm({ ...taskForm, radius_m: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'12px', outline:'none'}} />
        </>)}

        <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'12px', fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'10px'}}>AR 內容</div>
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>3D 模型（來自 AR Studio）</label>
        <select value={taskForm.glbKey} onChange={(e) => onModelSelect(e.target.value)}
          style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 9px', fontSize:'13px', color:'var(--text-body)', marginBottom:'6px', background:'#fff'}}>
          <option value="demo">示範吉祥物（demo）</option>
          {models.map((m) => <option key={m.id} value={`job:${m.id}`}>{m.name}（AI 生成{m.params?.targetUrl ? ' · 含目標圖' : ''}）</option>)}
          <option value="custom">自訂 URL…</option>
        </select>
        {taskForm.glbKey === 'custom' && (
          <input value={taskForm.glbUrl} onChange={(e) => setTaskForm({ ...taskForm, glbUrl: e.target.value })} placeholder="/media/…/model.glb" style={{width:'100%', height:'38px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'12px', color:'var(--text-body)', fontFamily:'var(--font-mono)', marginBottom:'6px', outline:'none'}} />
        )}
        <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'12px', lineHeight:1.5}}>想用自己的吉祥物？<Link href="/admin/ar-studio" style={{color:'var(--primary-600)', fontWeight:'700'}}>前往 AR Studio 上傳 2D 圖生成 3D →</Link></div>

        {/* AR target — NOT independently editable: it's the same-image pair of
            the model above, so it just follows the selection (read-only), except
            for a custom external model where the admin supplies the .mind URL. */}
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>AR 目標圖（相機對準的印刷圖）</label>
        {taskForm.glbKey === 'custom' ? (
          <>
            <input value={taskForm.targetUrl} onChange={(e) => setTaskForm({ ...taskForm, targetUrl: e.target.value })} placeholder="/media/…/target.mind" style={{width:'100%', height:'38px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'12px', color:'var(--text-body)', fontFamily:'var(--font-mono)', marginBottom:'6px', outline:'none'}} />
            <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'12px', lineHeight:1.5}}>自訂模型請一併提供對應的 .mind 目標圖 URL。</div>
          </>
        ) : selectedModel && !selectedModel.params?.targetUrl ? (
          <div style={{padding:'8px 11px', borderRadius:'8px', background:'var(--status-warning-bg, #FEF3C7)', color:'var(--status-warning-fg, #92400E)', fontSize:'11px', fontWeight:'600', lineHeight:1.5, marginBottom:'12px'}}>
            此模型尚未編譯目標圖 — 請到 <Link href="/admin/ar-studio" style={{color:'inherit', textDecoration:'underline'}}>AR Studio</Link> 完成「編譯辨識目標」後再指派，否則相機無法對準。
          </div>
        ) : (
          <div style={{display:'flex', alignItems:'center', gap:'8px', padding:'9px 11px', borderRadius:'8px', background:'var(--surface-sunken)', border:'1px solid var(--border-subtle)', fontSize:'11.5px', color:'var(--text-muted)', fontWeight:'600', marginBottom:'12px', lineHeight:1.5}}>
            <span style={{color:'var(--success-600)', display:'inline-flex', lineHeight:'0', fontSize:'14px'}}><Icon name="link" /></span>
            已與上方模型配對：{taskForm.glbKey === 'demo' ? '示範目標圖' : `${selectedModel?.name || ''} 的原圖`}（即列印張貼於現場的 2D 圖）
          </div>
        )}

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>模型縮放</label>
        <input type="number" step="0.1" min="0.1" value={taskForm.scale} onChange={(e) => setTaskForm({ ...taskForm, scale: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'16px', outline:'none'}} />

        <button onClick={saveTask} disabled={busy === 'savetask'} style={{width:'100%', height:'44px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity: busy === 'savetask' ? .6 : 1}}>{busy === 'savetask' ? '儲存中…' : '儲存任務'}</button>
        <button onClick={() => { setSelectedTask(null); setTaskForm(null); }} style={{width:'100%', marginTop:'8px', background:'none', border:'none', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer'}}>← 返回活動設定</button>
      </>) : (<>
        {/* Event content editing is UNIFIED in the drag-drop designer (活動
            設定 root panel there owns title/description/hero/reward/theme) —
            this screen keeps tasks + QR only. */}
        <div style={{padding:'16px', borderRadius:'12px', background:'var(--primary-50)', border:'1px solid var(--primary-200)', marginBottom:'14px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'9px', marginBottom:'8px'}}>
            <span style={{width:'34px', height:'34px', borderRadius:'9px', background:'var(--primary-600)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="layout-dashboard" /></span></span>
            <div style={{fontSize:'13.5px', fontWeight:'800', color:'var(--primary-800)'}}>網站內容與設計</div>
          </div>
          {/* The 拖曳設計 button lives in the toolbar (always visible); this
              panel only explains what is edited where. */}
          <div style={{fontSize:'12px', color:'var(--primary-800)', lineHeight:1.65}}>
            標題、介紹、封面圖、獎勵、佈景主題、頁首／頁尾與所有版面區塊，都在右上角「拖曳設計」中編輯（點畫布空白處 → 右側「活動設定」）。支援多頁面與 7 種佈景主題。
          </div>
        </div>

        <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'8px'}}>活動摘要</div>
        <div style={{display:'flex', flexDirection:'column', gap:'6px', fontSize:'12.5px', color:'var(--text-body)', marginBottom:'14px'}}>
          <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><span style={{color:'var(--text-subtle)'}}>標題</span><span style={{fontWeight:'700', color:'var(--text-strong)', textAlign:'right'}}>{event?.name}</span></div>
          <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><span style={{color:'var(--text-subtle)'}}>任務數</span><span style={{fontWeight:'700', color:'var(--text-strong)'}}>{tasks.length}</span></div>
          <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><span style={{color:'var(--text-subtle)'}}>集章門檻</span><span style={{fontWeight:'700', color:'var(--text-strong)'}}>{event?.reward_threshold ?? '—'}</span></div>
          <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><span style={{color:'var(--text-subtle)'}}>獎勵</span><span style={{fontWeight:'700', color:'var(--text-strong)', textAlign:'right'}}>{event?.reward_name || '—'}</span></div>
          <div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><span style={{color:'var(--text-subtle)'}}>子頁面</span><span style={{fontWeight:'700', color:'var(--text-strong)'}}>{event?.config?.pages?.length || 0}</span></div>
        </div>

        <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'14px', fontSize:'11px', color:'var(--text-subtle)', lineHeight:1.8}}>
          公開網址：<a href={`/e/${TENANT}/${event?.slug}`} target="_blank" rel="noreferrer" style={{fontFamily:'var(--font-mono)', color:'var(--primary-600)', fontWeight:'700'}}>/e/{TENANT}/{event?.slug} ↗</a><br />
          匯出範本會產生含 export key 的 zip，可部署於任何靜態主機 — 邏輯仍由平台 API 提供。
        </div>
      </>)}
    </aside>
    </>)}
  </div>

  {/* ── QR modal: scan off-screen or download for print ───────────────── */}
  {qrModal && (
    <div onClick={() => setQrModal(null)} style={{position:'fixed', inset:0, zIndex:100, background:'rgba(11,41,53,.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
      <div onClick={(e) => e.stopPropagation()} style={{background:'#fff', borderRadius:'16px', boxShadow:'var(--shadow-xl)', padding:'22px', width:'100%', maxWidth:'380px', textAlign:'center'}}>
        <div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>{qrModal.task.name}</div>
        <div style={{fontSize:'12px', color:'var(--text-muted)', marginTop:'3px'}}>掃描直接進入此任務的 AR 畫面（自動登入）</div>
        <img src={qrModal.dataUrl} alt="QR Code" style={{width:'100%', maxWidth:'280px', margin:'14px auto 8px', display:'block', border:'1px solid var(--border-subtle)', borderRadius:'12px'}} />
        <div style={{fontSize:'10px', color:'var(--text-subtle)', fontFamily:'var(--font-mono)', wordBreak:'break-all', lineHeight:1.5, padding:'0 6px'}}>{qrModal.url}</div>
        <div style={{display:'flex', gap:'9px', marginTop:'16px'}}>
          <a href={qrModal.dataUrl} download={`${event?.slug || 'event'}-${qrModal.task.name.replace(/\s+/g, '-')}-qr.png`} style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', height:'42px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'13.5px', fontWeight:'700', textDecoration:'none'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="download" /></span>下載 PNG（列印）</a>
          <button onClick={() => setQrModal(null)} style={{width:'42px', height:'42px', borderRadius:'9999px', background:'#fff', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></button>
        </div>
      </div>
    </div>
  )}
</div>
</AdminShell>
  );
}
