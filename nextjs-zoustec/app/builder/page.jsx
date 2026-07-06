'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../components/Icon';
import { adminApi, adminDownload, adminUpload, AuthRequired, loginUrl } from '../../lib/admin-client';
import EventSections from '../../components/event/EventSections';
import { DEFAULT_SECTIONS, sectionBodyToText, textToSectionBody, SECTION_TYPE_META } from '../../lib/event-sections';

const TYPE_META = {
  city: { icon: 'building-2', label: '城市探索', template: 'Urban Explorer' },
  hiking: { icon: 'mountain', label: '登山步道', template: 'Trail Guide' },
  shopping: { icon: 'shopping-bag', label: '購物中心 / 展館', template: 'Mall Quest' },
};
const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };
// Demo checkpoint (Quảng trường Hồ Chí Minh, Vinh) — quick-add GPS/hybrid
// tasks get a valid location the admin can fine-tune later.
const DEFAULT_LOCATION = { lat: 18.6766, lng: 105.6853 };

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';

/** Printed-QR payload (spec §II.3.A "Admin tạo QR Code"): a LIFF deep-link
 * that opens LINE → auto-login → jumps straight into this task's AR screen
 * with the secret pre-applied. Path-style (`/ID/path?query`) because the LIFF
 * endpoint URL is the site root. Falls back to a web URL without a LIFF ID. */
function taskQrUrl(event, task) {
  const params = new URLSearchParams({ tenant: TENANT, event: event.id, task: task.id });
  if (task.qr_token) params.set('qr', task.qr_token);
  return LIFF_ID
    ? `https://liff.line.me/${LIFF_ID}/experience/login?${params}`
    : `${window.location.origin}/experience/login?${params}`;
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
          if (b.theme_color) {
            const { applyBrand } = await import('../../lib/brand');
            applyBrand(b.theme_color);
          }
        } catch { /* platform default */ }
        try {
          const jobs = await adminApi('/api/admin/model3d/jobs');
          setModels(jobs.filter((j) => j.status === 'succeeded' && j.result_glb_url));
        } catch { /* AR Studio list is optional here */ }
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/builder'));
        setError(e.message);
      }
    })();
  }, [router]);

  function guard(e) {
    if (e instanceof AuthRequired) { router.replace(loginUrl('/builder')); return true; }
    return false;
  }

  function note(msg) { setFlash(msg); setTimeout(() => setFlash(''), 2500); }

  async function uploadHero(file) {
    if (!file || busy) return;
    setBusy('hero'); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const out = await adminUpload('/api/admin/media', fd);
      setForm({ ...form, heroImage: out.url });
      note('封面已上傳 — 按「儲存」生效');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  async function saveEvent() {
    if (!event || busy) return;
    setBusy('save'); setError('');
    try {
      const updated = await adminApi(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        body: { name: form.name, description: form.description, reward_name: form.reward_name, reward_threshold: Number(form.reward_threshold) || 1, config: { ...(event.config || {}), sections: form.sections, heroImage: form.heroImage || undefined } },
      });
      setEvent(updated); note('已儲存 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

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
    const targetUrl = t.ar_config?.targetUrl || '/targets/demo.mind';
    const glbJob = models.find((m) => m.result_glb_url === glbUrl);
    const tgtJob = models.find((m) => m.params?.targetUrl === targetUrl);
    setTaskForm({
      name: t.name,
      description: t.description || '',
      verification_type: t.verification_type,
      coords: t.location ? `${t.location.lat}, ${t.location.lng}` : '18.6766, 105.6853',
      radius_m: t.radius_m || 100,
      glbUrl,
      targetUrl,
      glbKey: glbUrl === '/models/mascot.glb' ? 'demo' : glbJob ? `job:${glbJob.id}` : 'custom',
      targetKey: targetUrl === '/targets/demo.mind' ? 'demo' : tgtJob ? `job:${tgtJob.id}` : 'custom',
      scale: t.ar_config?.scale ?? 0.4,
    });
  }

  function onModelSelect(v) {
    if (v === 'demo') return setTaskForm({ ...taskForm, glbKey: 'demo', glbUrl: '/models/mascot.glb' });
    if (v === 'custom') return setTaskForm({ ...taskForm, glbKey: 'custom' });
    const m = models.find((x) => `job:${x.id}` === v);
    if (!m) return;
    const next = { ...taskForm, glbKey: v, glbUrl: m.result_glb_url };
    // Model AI kèm sẵn ảnh mục tiêu compile từ chính ảnh gốc → tự điền luôn.
    if (m.params?.targetUrl) { next.targetKey = v; next.targetUrl = m.params.targetUrl; }
    setTaskForm(next);
  }

  function onTargetSelect(v) {
    if (v === 'demo') return setTaskForm({ ...taskForm, targetKey: 'demo', targetUrl: '/targets/demo.mind' });
    if (v === 'custom') return setTaskForm({ ...taskForm, targetKey: 'custom' });
    const m = models.find((x) => `job:${x.id}` === v);
    if (m?.params?.targetUrl) setTaskForm({ ...taskForm, targetKey: v, targetUrl: m.params.targetUrl });
  }

  async function saveTask() {
    if (!selectedTask || busy) return;
    setBusy('savetask'); setError('');
    try {
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
      const url = taskQrUrl(event, task);
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
      setQrModal({ task, dataUrl, url });
    } catch (e) { setError(e.message); }
  }

  async function exportBundle() {
    if (!event || busy) return;
    setBusy('export'); setError('');
    try {
      await adminDownload(`/api/admin/events/${event.id}/export-bundle`, `${event.slug}-bundle.zip`);
      note('已匯出範本 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  const meta = TYPE_META[event?.event_type] || TYPE_META.city;

  return (
<div className="editor-shell">

  {/* ── Toolbar ───────────────────────────────────────────────────────── */}
  <div className="editor-topbar" style={{height:'60px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 20px', gap:'18px'}}>
    <Link href="/dashboard" title="返回儀表板" style={{width:'34px', height:'34px', borderRadius:'8px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'17px', textDecoration:'none', flex:'0 0 auto'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-left" /></span></Link>
    <div style={{display:'flex', alignItems:'center', gap:'9px', fontSize:'14px', fontWeight:'700', color:'var(--text-strong)'}}><span style={{fontSize:'17px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span>網站產生器</div>
    <div className="hide-mobile" style={{display:'flex', alignItems:'center', gap:'6px', marginLeft:'8px'}}>
      <Link href="/builder/new" style={{display:'inline-flex', alignItems:'center', gap:'7px', fontSize:'12.5px', fontWeight:'600', color:'var(--text-muted)', textDecoration:'none'}}><span style={{width:'20px', height:'20px', borderRadius:'9999px', background:'var(--success-500)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="check" /></span></span>範本</Link>
      <span style={{width:'22px', height:'1px', background:'var(--border-default)'}}></span>
      <span style={{display:'inline-flex', alignItems:'center', gap:'7px', fontSize:'12.5px', fontWeight:'700', color:'var(--primary-700)'}}><span style={{width:'20px', height:'20px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700'}}>2</span>內容</span>
      <span style={{width:'22px', height:'1px', background:'var(--border-default)'}}></span>
      <span style={{display:'inline-flex', alignItems:'center', gap:'7px', fontSize:'12.5px', fontWeight:'600', color:'var(--text-subtle)'}}><span style={{width:'20px', height:'20px', borderRadius:'9999px', background:'var(--neutral-200)', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700'}}>3</span>匯出</span>
    </div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px'}}>
      {flash && <span style={{fontSize:'12.5px', fontWeight:'700', color:'var(--success-600)'}}>{flash}</span>}
      <button onClick={saveEvent} disabled={busy === 'save'} style={{display:'flex', alignItems:'center', gap:'7px', height:'36px', padding:'0 13px', borderRadius:'8px', border:'1px solid var(--border-default)', background:'#fff', color:'var(--text-body)', fontSize:'13px', fontWeight:'600', cursor:'pointer'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="save" /></span>{busy === 'save' ? '儲存中…' : '儲存'}</button>
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
        <Link href="/builder/new" style={{display:'inline-flex', alignItems:'center', gap:'9px', height:'48px', padding:'0 26px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14.5px', fontWeight:'700', textDecoration:'none', boxShadow:'var(--shadow-sm)'}}><span style={{fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="plus" /></span>建立第一個活動</Link>
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

    {/* Canvas — live preview */}
    <div className="editor-canvas" style={{padding:'26px', display:'flex', justifyContent:'center', alignItems:'flex-start'}}>
      <div style={{width:'100%', maxWidth:'640px', background:'#fff', borderRadius:'14px', overflow:'hidden', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border-subtle)'}}>
        <div style={{height:'280px', background: form?.heroImage ? `linear-gradient(rgba(11,41,53,.62), rgba(19,78,97,.68)), url(${form.heroImage}) center/cover` : 'linear-gradient(150deg, var(--brand-hero-a), var(--brand-hero-b))', position:'relative', display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:'26px', color:'#fff'}}>
          <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 78% 20%,rgba(56,176,214,.35),transparent 55%)'}}></div>
          <div style={{position:'absolute', top:'18px', left:'18px', display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', fontWeight:'700'}}><span style={{width:'26px', height:'26px', borderRadius:'7px', background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="scan-line" /></span></span>{event?.slug || '…'}</div>
          <div style={{position:'absolute', top:'18px', right:'18px', display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', fontWeight:'600', background:'rgba(255,255,255,.12)', padding:'6px 11px', borderRadius:'9999px', backdropFilter:'blur(4px)'}}><span style={{width:'7px', height:'7px', borderRadius:'50%', background:'#28C840'}}></span>{event?.is_active ? '進行中' : '草稿'}</div>
          <div style={{position:'relative', fontSize:'12px', fontWeight:'700', letterSpacing:'.1em', color:'var(--brand-light)', textTransform:'uppercase', marginBottom:'8px'}}>{meta.label}</div>
          <div style={{position:'relative', fontSize:'34px', fontWeight:'800', lineHeight:'1.1', letterSpacing:'-.02em', maxWidth:'16ch'}}>{form?.name || '…'}</div>
          <div style={{position:'relative', display:'flex', gap:'10px', marginTop:'18px', flexWrap:'wrap'}}><span style={{display:'inline-flex', alignItems:'center', gap:'8px', padding:'11px 20px', borderRadius:'9999px', background:'#fff', color:'var(--brand-dark)', fontSize:'14px', fontWeight:'700'}}><span style={{fontSize:'16px', display:'inline-flex', lineHeight:'0'}}><Icon name="qr-code" /></span>開始旅程</span><span style={{display:'inline-flex', alignItems:'center', gap:'8px', padding:'11px 18px', borderRadius:'9999px', background:'rgba(255,255,255,.12)', color:'#fff', fontSize:'14px', fontWeight:'600', border:'1px solid rgba(255,255,255,.25)'}}>查看地圖</span></div>
        </div>
        <div style={{padding:'24px 26px'}}>
          <div style={{display:'flex', gap:'12px', marginBottom:'22px'}}>
            <div style={{flex:'1', textAlign:'center', padding:'14px', borderRadius:'10px', background:'var(--surface-sunken)'}}><div style={{fontSize:'22px', fontWeight:'800', color:'var(--text-strong)'}}>{tasks.length}</div><div style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'600'}}>任務</div></div>
            <div style={{flex:'1', textAlign:'center', padding:'14px', borderRadius:'10px', background:'var(--surface-sunken)'}}><div style={{fontSize:'22px', fontWeight:'800', color:'var(--text-strong)'}}>{form?.reward_threshold ?? '—'}</div><div style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'600'}}>集章門檻</div></div>
            <div style={{flex:'1', textAlign:'center', padding:'14px', borderRadius:'10px', background:'var(--surface-sunken)'}}><div style={{fontSize:'22px', fontWeight:'800', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{form?.reward_name || '—'}</div><div style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'600'}}>獎勵</div></div>
          </div>
          <div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'12px'}}>任務停靠點</div>
          <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
            {tasks.slice(0, 4).map((t) => (
              <div key={t.id} style={{display:'flex', alignItems:'center', gap:'13px', padding:'13px', borderRadius:'11px', border:'1px solid var(--border-subtle)'}}><span style={{width:'40px', height:'40px', borderRadius:'9px', background:'var(--primary-50)', color:'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={METHOD_ICON[t.verification_type] || 'map-pin'} /></span></span><div style={{flex:'1'}}><div style={{fontWeight:'700', fontSize:'14px', color:'var(--text-strong)'}}>{t.name}</div><div style={{fontSize:'12px', color:'var(--text-muted)'}}>{METHOD_LABEL[t.verification_type]}{t.radius_m ? ` · ${t.radius_m}m` : ''}</div></div><span style={{fontSize:'16px', color:'var(--text-subtle)', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-right" /></span></div>
            ))}
            {!tasks.length && <div style={{padding:'20px', textAlign:'center', color:'var(--text-subtle)', fontSize:'13px'}}>尚無任務 — 從左側新增</div>}
          </div>
          {form?.sections?.filter((x) => !x.hidden).length > 0 && (
            <div style={{marginTop:'20px'}}>
              <div style={{fontSize:'16px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'12px'}}>活動資訊</div>
              <EventSections sections={form.sections} variant="light" />
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Properties panel — live edit */}
    <aside className="editor-aside" style={{width:'340px', flex:'0 0 auto', background:'#fff', borderLeft:'1px solid var(--border-subtle)', padding:'18px 16px'}}>
      <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'4px'}}>{selectedTask ? '任務設定' : '活動內容'}</div>
      <div style={{fontSize:'11.5px', color:'var(--text-muted)', marginBottom:'16px'}}>{selectedTask ? `編輯「${selectedTask.name}」— 每個任務可獨立設定` : '編輯後按上方「儲存」'}</div>
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
        <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'12px', lineHeight:1.5}}>想用自己的吉祥物？<Link href="/ar-studio" style={{color:'var(--primary-600)', fontWeight:'700'}}>前往 AR Studio 上傳 2D 圖生成 3D →</Link></div>

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>AR 目標圖（相機對準的印刷圖）</label>
        <select value={taskForm.targetKey} onChange={(e) => onTargetSelect(e.target.value)}
          style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 9px', fontSize:'13px', color:'var(--text-body)', marginBottom:'6px', background:'#fff'}}>
          <option value="demo">示範目標圖（demo）</option>
          {models.filter((m) => m.params?.targetUrl).map((m) => <option key={m.id} value={`job:${m.id}`}>{m.name} 的原圖</option>)}
          <option value="custom">自訂 URL…</option>
        </select>
        {taskForm.targetKey === 'custom' && (
          <input value={taskForm.targetUrl} onChange={(e) => setTaskForm({ ...taskForm, targetUrl: e.target.value })} placeholder="/media/…/target.mind" style={{width:'100%', height:'38px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'12px', color:'var(--text-body)', fontFamily:'var(--font-mono)', marginBottom:'6px', outline:'none'}} />
        )}
        <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginBottom:'12px', lineHeight:1.5}}>選 AI 模型時會自動帶入其目標圖 — 即上傳到 AR Studio 的那張 2D 圖（列印張貼於現場）。</div>

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>模型縮放</label>
        <input type="number" step="0.1" min="0.1" value={taskForm.scale} onChange={(e) => setTaskForm({ ...taskForm, scale: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'16px', outline:'none'}} />

        <button onClick={saveTask} disabled={busy === 'savetask'} style={{width:'100%', height:'44px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity: busy === 'savetask' ? .6 : 1}}>{busy === 'savetask' ? '儲存中…' : '儲存任務'}</button>
        <button onClick={() => { setSelectedTask(null); setTaskForm(null); }} style={{width:'100%', marginTop:'8px', background:'none', border:'none', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer'}}>← 返回活動設定</button>
      </>) : form && (<>
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>標題</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-strong)', fontWeight:'600', marginBottom:'14px', outline:'none'}} />
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>活動介紹</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'10px 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'14px', outline:'none', resize:'vertical', fontFamily:'inherit'}} />
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>封面圖</label>
        {form.heroImage ? (
          <div style={{position:'relative', marginBottom:'8px'}}>
            <img src={form.heroImage} alt="hero" style={{width:'100%', height:'110px', objectFit:'cover', borderRadius:'10px', border:'1px solid var(--border-subtle)'}} />
            <button onClick={() => setForm({ ...form, heroImage: '' })} title="移除" style={{position:'absolute', top:'6px', right:'6px', width:'26px', height:'26px', borderRadius:'9999px', background:'rgba(11,41,53,.72)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="x" /></span></button>
          </div>
        ) : null}
        <label style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'10px', borderRadius:'9px', border:'1.5px dashed var(--border-default)', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer', marginBottom:'14px'}}>
          <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'hero' ? 'loader' : 'image-up'} /></span>{busy === 'hero' ? '上傳中…' : form.heroImage ? '更換封面圖' : '上傳封面圖'}
          <input type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e) => uploadHero(e.target.files?.[0])} />
        </label>

        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>獎勵名稱</label>
        <input value={form.reward_name} onChange={(e) => setForm({ ...form, reward_name: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'14px', outline:'none'}} />
        <label style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', display:'block', marginBottom:'6px'}}>集章門檻（收集幾枚解鎖獎勵）</label>
        <input type="number" min={1} value={form.reward_threshold} onChange={(e) => setForm({ ...form, reward_threshold: e.target.value })} style={{width:'100%', height:'40px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'var(--text-body)', marginBottom:'16px', outline:'none'}} />
        <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'12px', fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'10px'}}>內容區塊（依活動類型）</div>
        {(form.sections || []).map((sec, i) => {
          const meta = SECTION_TYPE_META[sec.type] || SECTION_TYPE_META.text;
          const setSec = (patch) => {
            const next = form.sections.map((x, j) => (j === i ? { ...x, ...patch } : x));
            setForm({ ...form, sections: next });
          };
          return (
            <div key={i} style={{border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'10px', marginBottom:'10px', opacity: sec.hidden ? .55 : 1}}>
              <div style={{display:'flex', alignItems:'center', gap:'7px', marginBottom:'7px'}}>
                <span style={{fontSize:'13px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name={meta.icon} /></span>
                <input value={sec.title || ''} onChange={(e) => setSec({ title: e.target.value })} style={{flex:1, minWidth:0, height:'30px', border:'1px solid var(--border-default)', borderRadius:'7px', padding:'0 9px', fontSize:'12.5px', fontWeight:'700', color:'var(--text-strong)', outline:'none'}} />
                <span style={{fontSize:'10px', fontWeight:'700', color:'var(--text-subtle)', background:'var(--surface-sunken)', padding:'3px 7px', borderRadius:'9999px', flex:'0 0 auto'}}>{meta.label}</span>
                <button onClick={() => setSec({ hidden: !sec.hidden })} title={sec.hidden ? '顯示' : '隱藏'} style={{border:'none', background:'none', color: sec.hidden ? 'var(--text-subtle)' : 'var(--primary-600)', fontSize:'14px', cursor:'pointer', display:'inline-flex', lineHeight:'0', padding:0}}><Icon name={sec.hidden ? 'eye-off' : 'eye'} /></button>
              </div>
              <textarea value={sectionBodyToText(sec)} onChange={(e) => setSec(textToSectionBody(sec, e.target.value))} rows={3} style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'7px', padding:'7px 9px', fontSize:'12px', color:'var(--text-body)', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5}} />
              <div style={{fontSize:'10px', color:'var(--text-subtle)', marginTop:'4px'}}>{meta.hint}</div>
            </div>
          );
        })}

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
  );
}
