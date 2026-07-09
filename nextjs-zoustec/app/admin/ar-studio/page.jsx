'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Icon } from '../../../components/Icon';
import AdminShell from '../../../components/admin/AdminShell';
import { adminApi, adminUpload, AuthRequired, loginUrl } from '../../../lib/admin-client';

const GlbPreview = dynamic(() => import('../../../components/GlbPreview'), { ssr: false });

const STATUS_META = {
  pending: { label: '排隊中…', color: 'var(--warning-600)' },
  processing: { label: 'AI 生成中…', color: 'var(--info-600)' },
  succeeded: { label: '已生成 · GLB 3D', color: 'var(--success-600)' },
  failed: { label: '生成失敗', color: 'var(--danger-600)' },
};
const TINTS = ['', '#0E7490', '#16A34A', '#D97706', '#7C3AED', '#DC2626'];

/** One row of the per-job pipeline (right panel). state: done|active|failed|todo */
function Step({ n, title, state, detail, children }) {
  const C = {
    done: { fg: 'var(--success-600)', bg: 'var(--status-success-bg, #ECFDF5)', icon: 'check' },
    failed: { fg: 'var(--danger-600)', bg: 'var(--status-danger-bg, #FEF2F2)', icon: 'x' },
    active: { fg: 'var(--primary-600)', bg: 'var(--primary-50)', icon: null },
    todo: { fg: 'var(--text-subtle)', bg: 'var(--surface-sunken, #F8FAFC)', icon: null },
  }[state];
  return (
    <div style={{display:'flex', gap:'10px', padding:'10px 0', borderBottom:'1px solid var(--border-subtle)'}}>
      <span style={{width:'24px', height:'24px', borderRadius:'9999px', background:C.bg, color:C.fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'800', flex:'0 0 auto', marginTop:'1px'}}>
        {C.icon ? <span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={C.icon} /></span> : n}
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:'12.5px', fontWeight:'700', color: state === 'todo' ? 'var(--text-subtle)' : 'var(--text-strong)'}}>{title}</div>
        {detail && <div style={{fontSize:'11px', color:C.fg, fontWeight:'600', marginTop:'2px'}}>{detail}</div>}
        {children}
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [jobs, setJobs] = useState(null);
  const [sel, setSel] = useState(null);        // selected job
  const [adjust, setAdjust] = useState(null);  // {scale, color_tint}
  const [busy, setBusy] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [compiling, setCompiling] = useState({}); // jobId -> % | 'done' | 'failed'
  const [prompt, setPrompt] = useState('');       // optional hint for the NEXT upload
  const [jobPrompt, setJobPrompt] = useState(''); // per-model description (retexture)
  const [usage, setUsage] = useState({});         // glbUrl -> ["event／task", …]
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  function note(m) { setFlash(m); setTimeout(() => setFlash(''), 2500); }
  function guard(e) {
    if (e instanceof AuthRequired) { router.replace(loginUrl('/admin/ar-studio')); return true; }
    return false;
  }
  function pick(job) {
    setSel(job);
    setAdjust(job ? { scale: job.params?.scale ?? 0.4, color_tint: job.params?.color_tint || '', name: job.name || '' } : null);
    setJobPrompt(job?.params?.prompt || '');
  }

  async function refresh(selectId) {
    const list = await adminApi('/api/admin/model3d/jobs');
    setJobs(list);
    const want = selectId || sel?.id;
    const found = list.find((j) => j.id === want) || list[0] || null;
    pick(found);
    return list;
  }

  /** Which tasks already use each model — lights up pipeline step ④. */
  async function loadUsage() {
    try {
      const events = await adminApi('/api/admin/events');
      const map = {};
      for (const ev of events) {
        const tasks = await adminApi(`/api/admin/events/${ev.id}/tasks`);
        for (const t of tasks) {
          const g = t.ar_config?.glbUrl;
          if (g) (map[g] = map[g] || []).push(`${ev.name}／${t.name}`);
        }
      }
      setUsage(map);
    } catch { /* enrichment only — never blocks the studio */ }
  }

  useEffect(() => {
    (async () => {
      try { await refresh(); loadUsage(); }
      catch (e) { if (!guard(e)) setError(e.message); }
    })();
    // Coming back from the builder tab → re-check assignments.
    const onFocus = () => loadUsage();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while any job is still generating (model, rigging or retexture).
  useEffect(() => {
    if (!jobs?.some((j) =>
      j.status === 'pending' || j.status === 'processing'
      || j.params?.rig?.status === 'processing'
      || j.params?.retexture?.status === 'processing'
    )) return;
    const t = setInterval(async () => {
      try { await refresh(); } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(t);
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Compile the source artwork into a MindAR .mind target IN THE BROWSER
   *  and attach it to the job — one image gives both the 3D model AND the
   *  printed AR target users point their camera at. */
  async function compileTarget(jobId, file) {
    try {
      setCompiling((c) => ({ ...c, [jobId]: 0 }));
      const mod = await import('mind-ar/dist/mindar-image.prod.js');
      const Compiler = mod.Compiler || mod.default?.Compiler || (typeof window !== 'undefined' && window.MINDAR?.IMAGE?.Compiler);
      if (!Compiler) throw new Error('compiler unavailable');
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
      });
      const compiler = new Compiler();
      await compiler.compileImageTargets([img], (p) => setCompiling((c) => ({ ...c, [jobId]: Math.min(99, Math.round(p)) })));
      const buf = await compiler.exportData();
      const fd = new FormData();
      fd.append('target', new Blob([buf]), 'target.mind');
      await adminUpload(`/api/admin/model3d/jobs/${jobId}/target`, fd);
      setCompiling((c) => ({ ...c, [jobId]: 'done' }));
      await refresh(jobId);
    } catch {
      setCompiling((c) => ({ ...c, [jobId]: 'failed' }));
    }
  }

  /** Re-compile the .mind from the DB-stored source image — recovers a
   *  missing/failed target without re-uploading (e.g. tab closed mid-compile). */
  async function recompile(job) {
    const src = job.params?.sourceImageUrl;
    if (!src || typeof compiling[job.id] === 'number') return;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error('source fetch failed');
      const blob = await res.blob();
      const file = new File([blob], 'source.png', { type: blob.type || 'image/png' });
      await compileTarget(job.id, file);
    } catch {
      setCompiling((c) => ({ ...c, [job.id]: 'failed' }));
    }
  }

  async function upload(file) {
    if (!file || busy) return;
    setBusy('upload'); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const q = new URLSearchParams({ name: file.name.replace(/\.[^.]+$/, '') });
      if (prompt.trim()) q.set('prompt', prompt.trim());
      const job = await adminUpload(`/api/admin/model3d/jobs?${q}`, fd);
      await refresh(job.id);
      note('已開始生成 — AI 處理中');
      compileTarget(job.id, file); // runs in the background with its own progress
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  /** Re-texture THIS model from its description (engine capability). */
  async function retexture() {
    if (!sel || busy) return;
    if (jobPrompt.trim().length < 2) return setError('請先輸入材質／風格描述');
    setBusy('retexture'); setError('');
    try {
      const updated = await adminApi(`/api/admin/model3d/jobs/${sel.id}/retexture`, {
        method: 'POST', body: { prompt: jobPrompt.trim() },
      });
      setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
      pick(updated);
      note('材質重生中 — 約 1–3 分鐘');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  /** Auto-rig + preset walk/run animations (engine capability, e.g. Meshy). */
  async function animate() {
    if (!sel || busy) return;
    setBusy('animate'); setError('');
    try {
      const updated = await adminApi(`/api/admin/model3d/jobs/${sel.id}/animate`, { method: 'POST' });
      setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
      pick(updated);
      note('動作生成中 — 約 1–2 分鐘');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  /** Serve a different GLB variant (static / walk / run) for this model. */
  async function setVariant(v) {
    if (!sel || busy) return;
    setBusy('variant'); setError('');
    try {
      const updated = await adminApi(`/api/admin/model3d/jobs/${sel.id}`, { method: 'PATCH', body: { variant: v } });
      setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
      pick(updated);
      note('已切換動作 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  async function saveAdjust() {
    if (!sel || busy) return;
    setBusy('adjust'); setError('');
    try {
      const body = { scale: Number(adjust.scale) || 0.4 };
      if (adjust.color_tint) body.color_tint = adjust.color_tint;
      if (adjust.name.trim() && adjust.name.trim() !== sel.name) body.name = adjust.name.trim();
      const updated = await adminApi(`/api/admin/model3d/jobs/${sel.id}`, { method: 'PATCH', body });
      setJobs(jobs.map((j) => (j.id === updated.id ? updated : j)));
      pick(updated);
      note('已儲存調整 ✓');
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  async function removeJob(id) {
    if (busy) return;
    setBusy('del'); setError('');
    try {
      await adminApi(`/api/admin/model3d/jobs/${id}`, { method: 'DELETE', raw: true });
      const list = jobs.filter((j) => j.id !== id);
      setJobs(list);
      if (sel?.id === id) pick(list[0] || null);
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); }
  }

  const st = sel ? STATUS_META[sel.status] : null;
  const srcUrl = sel?.params?.sourceImageUrl || null;
  const tgtState = sel
    ? (sel.params?.targetUrl ? 'done'
      : typeof compiling[sel.id] === 'number' ? 'active'
      : compiling[sel.id] === 'failed' ? 'failed' : 'todo')
    : 'todo';

  return (
<AdminShell active="arstudio">
<div className="editor-shell">

  {/* ── Toolbar ───────────────────────────────────────────────────────── */}
  <div className="editor-topbar" style={{height:'60px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 22px', gap:'12px'}}>
    <span style={{width:'34px', height:'34px', borderRadius:'9px', background:'linear-gradient(145deg,#6FCDE8,#0E7490)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="sparkles" /></span></span>
    <div><div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>AR Studio · AI 3D 生成</div><div style={{fontSize:'11.5px', color:'var(--text-muted)'}}>一張 2D 圖 = 3D 模型 + 現場印刷辨識圖 — 完成後於產生器指派給任務</div></div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px'}}>
      {flash && <span style={{fontSize:'12.5px', fontWeight:'700', color:'var(--success-600)'}}>{flash}</span>}
      <Link href="/admin/builder" style={{display:'flex', alignItems:'center', gap:'7px', height:'36px', padding:'0 15px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', textDecoration:'none'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span>到產生器指派</Link>
    </div>
  </div>

  {/* ── Body: upload+history / viewport / pipeline ────────────────────── */}
  <div className="editor-body">

    {/* Upload + history */}
    <aside className="editor-aside" style={{width:'310px', flex:'0 0 auto', background:'#fff', borderRight:'1px solid var(--border-subtle)', padding:'20px 18px', overflowY:'auto'}}>
      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'11px'}}>上傳 2D 來源圖</div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e) => upload(e.target.files?.[0])} />
      <button onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0]); }}
        style={{width:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px', padding:'26px 12px', borderRadius:'12px', border: dragOver ? '1.5px dashed var(--primary-600)' : '1.5px dashed var(--border-default)', background: dragOver ? 'var(--primary-50)' : 'var(--surface-sunken)', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer'}}>
        <span style={{fontSize:'26px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'upload' ? 'loader' : 'image-up'} /></span>
        {busy === 'upload' ? '上傳中…' : '點擊或拖曳上傳吉祥物 / 角色圖'}
        <span style={{fontSize:'10.5px', fontWeight:'500'}}>PNG / JPG / WebP · ≤10MB · 這張圖也會成為現場辨識圖</span>
      </button>

      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', margin:'14px 0 7px'}}>生成需求（本次上傳套用・選填）</div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={600} rows={2}
        placeholder="描述風格／材質，例如：毛絨玩具質感、卡通風格、金屬盔甲…"
        style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'8px 11px', fontSize:'12px', color:'var(--text-strong)', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5}} />
      <div style={{fontSize:'10px', color:'var(--text-subtle)', marginTop:'4px', lineHeight:1.5}}>套用於下一次上傳。已生成的模型請在右側「材質描述」修改並重生。</div>

      {error && <div style={{marginTop:'12px', padding:'10px', borderRadius:'8px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'12px', fontWeight:'600'}}>{error}</div>}

      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', margin:'20px 0 11px'}}>生成紀錄（{jobs?.length ?? '…'}）</div>
      <div style={{display:'flex', flexDirection:'column', gap:'7px'}}>
        {(jobs || []).map((j) => {
          const m = STATUS_META[j.status];
          const active = sel?.id === j.id;
          const thumb = j.params?.sourceImageUrl;
          return (
            <div key={j.id} onClick={() => pick(j)} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px 11px', borderRadius:'9px', border: active ? '1.5px solid var(--primary-600)' : '1px solid var(--border-subtle)', background: active ? 'var(--primary-50)' : '#fff', cursor:'pointer'}}>
              {thumb ? (
                <img src={thumb} alt="" style={{width:'34px', height:'34px', borderRadius:'8px', objectFit:'cover', flex:'0 0 auto', border:'1px solid var(--border-subtle)', background:'#fff'}} />
              ) : (
                <span style={{width:'34px', height:'34px', borderRadius:'8px', background:'var(--primary-50)', color:'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flex:'0 0 auto'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={j.status === 'failed' ? 'circle-alert' : 'box'} /></span></span>
              )}
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:'13px', fontWeight:'600', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{j.name}</div>
                <div style={{fontSize:'10.5px', fontWeight:'700', color:m.color}}>{m.label}</div>
                <div style={{fontSize:'10px', fontWeight:'600', color: j.params?.targetUrl ? 'var(--success-600)' : compiling[j.id] === 'failed' ? 'var(--danger-600)' : 'var(--text-subtle)'}}>
                  {j.params?.targetUrl ? '辨識圖 ✓' : typeof compiling[j.id] === 'number' ? `編譯辨識圖 ${compiling[j.id]}%` : compiling[j.id] === 'failed' ? '辨識圖編譯失敗' : '無辨識圖'}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeJob(j.id); }} title="刪除" style={{border:'none', background:'none', color:'var(--text-subtle)', fontSize:'14px', cursor:'pointer', display:'inline-flex', lineHeight:'0'}}><Icon name="trash-2" /></button>
            </div>
          );
        })}
        {jobs && !jobs.length && <div style={{padding:'14px', textAlign:'center', color:'var(--text-subtle)', fontSize:'12px'}}>尚無生成紀錄 — 上傳第一張圖</div>}
      </div>
    </aside>

    {/* 3D viewport */}
    <div className="editor-canvas" style={{display:'flex', flexDirection:'column', position:'relative', background:'radial-gradient(circle at 50% 40%,#134E61,#0B2935)'}}>
      {st && (
        <div style={{position:'absolute', top:'16px', left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:'8px', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.14)', padding:'7px 13px', borderRadius:'9999px', color:'#D0F1FB', fontSize:'12px', fontWeight:'600', backdropFilter:'blur(6px)', whiteSpace:'nowrap', zIndex:5}}>
          <span style={{width:'7px', height:'7px', borderRadius:'50%', background: sel.status === 'succeeded' ? 'var(--success-500)' : sel.status === 'failed' ? 'var(--danger-500)' : 'var(--warning-500)'}}></span>
          {sel.name} · {st.label}
        </div>
      )}
      <div style={{flex:'1', display:'flex', alignItems:'center', justifyContent:'center', minHeight:'420px', padding:'20px'}}>
        {sel?.status === 'succeeded' && sel.result_glb_url ? (
          <div style={{width:'100%', maxWidth:'560px'}}>
            <GlbPreview url={sel.result_glb_url} tint={adjust?.color_tint || ''} scale={1} height={380} />
          </div>
        ) : sel?.status === 'failed' ? (
          <div style={{color:'#FCA5A5', fontSize:'14px', fontWeight:'600', textAlign:'center', maxWidth:'40ch'}}>{sel.error || '生成失敗 — 請換一張圖再試'}</div>
        ) : sel ? (
          <div style={{color:'#D0F1FB', fontSize:'14px', fontWeight:'600', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px'}}>
            <span style={{fontSize:'40px', display:'inline-flex', lineHeight:'0', animation:'spin 1.2s linear infinite'}}><Icon name="loader" /></span>
            AI 正在生成 3D 模型…
          </div>
        ) : (
          <div style={{color:'#8FB6C2', fontSize:'14px', fontWeight:'600'}}>上傳圖片開始生成</div>
        )}
      </div>
      {sel?.status === 'succeeded' && (
        <div style={{height:'52px', flex:'0 0 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:'14px', borderTop:'1px solid rgba(255,255,255,.08)', color:'#B6D4DE', fontSize:'12px', fontFamily:'var(--font-mono)'}}>
          {sel.result_glb_url}
          <a href={sel.result_glb_url} download style={{color:'#fff', display:'inline-flex', lineHeight:'0', fontSize:'16px'}} title="下載 GLB"><Icon name="download" /></a>
        </div>
      )}
    </div>

    {/* Pipeline + adjust */}
    <aside className="editor-aside" style={{width:'340px', flex:'0 0 auto', background:'#fff', borderLeft:'1px solid var(--border-subtle)', padding:'20px 18px', overflowY:'auto'}}>
      {sel && adjust ? (<>
        <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'4px'}}>流程進度</div>

        {/* ① Source image — this IS the printed AR target */}
        <Step n="1" title="2D 原圖（＝現場印刷辨識圖）"
          state={srcUrl ? 'done' : 'failed'}
          detail={srcUrl ? null : '原圖已不可用（舊資料）— 請重新上傳'}>
          {srcUrl && (
            <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'8px'}}>
              <a href={srcUrl} target="_blank" rel="noreferrer" title="開新分頁檢視">
                <img src={srcUrl} alt="" style={{width:'52px', height:'52px', borderRadius:'8px', objectFit:'cover', border:'1px solid var(--border-subtle)', display:'block'}} />
              </a>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', gap:'6px', marginBottom:'5px'}}>
                  <a href={srcUrl} target="_blank" rel="noreferrer" style={{display:'inline-flex', alignItems:'center', gap:'5px', height:'28px', padding:'0 10px', borderRadius:'7px', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'11px', fontWeight:'700', textDecoration:'none'}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="printer" /></span>開啟／列印</a>
                  <a href={srcUrl} download={`${sel.name || 'target'}.png`} style={{display:'inline-flex', alignItems:'center', gap:'5px', height:'28px', padding:'0 10px', borderRadius:'7px', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'11px', fontWeight:'700', textDecoration:'none'}}><span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="download" /></span>下載</a>
                </div>
                <div style={{fontSize:'10px', color:'var(--text-subtle)', lineHeight:1.5}}>測試：在另一台螢幕開啟此圖，AR 相機對準即可。</div>
              </div>
            </div>
          )}
        </Step>

        {/* ② AI 3D generation */}
        <Step n="2" title="AI 生成 3D 模型"
          state={sel.status === 'succeeded' ? 'done' : sel.status === 'failed' ? 'failed' : 'active'}
          detail={sel.status === 'failed' ? (sel.error || '生成失敗') : STATUS_META[sel.status].label} />

        {/* ③ Compile .mind recognition target */}
        <Step n="3" title="編譯辨識目標（.mind）"
          state={tgtState}
          detail={
            tgtState === 'done' ? '已附加 — 相機將辨識這張原圖'
            : tgtState === 'active' ? `瀏覽器編譯中 ${compiling[sel.id]}%`
            : tgtState === 'failed' ? '編譯失敗' : '尚未編譯'
          }>
          {srcUrl && tgtState !== 'active' && tgtState !== 'done' && (
            <button onClick={() => recompile(sel)} style={{marginTop:'7px', height:'28px', padding:'0 11px', borderRadius:'7px', border:'1px solid var(--primary-600)', background:'#fff', color:'var(--primary-600)', fontSize:'11px', fontWeight:'700', cursor:'pointer'}}>重新編譯</button>
          )}
        </Step>

        {/* ④ Assign in the builder — lights up green once a task uses it */}
        {(() => { const used = usage[sel.result_glb_url] || []; return (
        <Step n="4" title="指派給任務"
          state={used.length ? 'done' : sel.status === 'succeeded' && sel.params?.targetUrl ? 'active' : 'todo'}
          detail={used.length ? `已指派：${used.join('、')}` : '產生器 → 點任務 → 3D 模型下拉選單（辨識圖會自動帶入）'}>
          {sel.status === 'succeeded' && (
            <Link href="/admin/builder" style={{marginTop:'7px', display:'inline-flex', alignItems:'center', gap:'6px', height:'28px', padding:'0 11px', borderRadius:'7px', background:'var(--primary-600)', color:'#fff', fontSize:'11px', fontWeight:'700', textDecoration:'none'}}>前往產生器<span style={{fontSize:'12px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></Link>
          )}
        </Step>
        ); })()}

        {/* Per-model style description → engine retexture pass */}
        {sel.status === 'succeeded' && (() => {
          const rt = sel.params?.retexture;
          return (
            <>
              <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', margin:'18px 0 8px'}}>材質描述（本模型）</div>
              <textarea value={jobPrompt} onChange={(e) => setJobPrompt(e.target.value)} maxLength={600} rows={2}
                placeholder="例如：毛絨玩具質感、卡通風格、金屬盔甲…"
                disabled={rt?.status === 'processing'}
                style={{width:'100%', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'8px 11px', fontSize:'12px', color:'var(--text-strong)', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5}} />
              {rt?.status === 'processing' ? (
                <div style={{display:'flex', alignItems:'center', gap:'9px', marginTop:'7px', padding:'10px 12px', borderRadius:'9px', background:'var(--primary-50)', color:'var(--primary-700)', fontSize:'12px', fontWeight:'700'}}>
                  <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0', animation:'spin 1.2s linear infinite'}}><Icon name="loader" /></span>
                  材質重生中…（約 1–3 分鐘）
                </div>
              ) : (
                <>
                  {rt?.status === 'failed' && <div style={{marginTop:'7px', padding:'9px 11px', borderRadius:'8px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'11.5px', fontWeight:'600', lineHeight:1.5}}>{rt.error || '材質重生失敗'}</div>}
                  <button onClick={retexture} disabled={busy === 'retexture'}
                    style={{marginTop:'7px', width:'100%', height:'36px', borderRadius:'9px', border:'1.5px solid var(--primary-600)', background:'#fff', color:'var(--primary-600)', fontSize:'12.5px', fontWeight:'700', cursor:'pointer', opacity: busy === 'retexture' ? .6 : 1}}>
                    {busy === 'retexture' ? '啟動中…' : '依描述重新生成材質'}
                  </button>
                  <div style={{fontSize:'10px', color:'var(--text-subtle)', marginTop:'4px', lineHeight:1.5}}>約 10 credits。形狀不變、外觀重繪；已生成的動作會清除，可重新生成。</div>
                </>
              )}
            </>
          );
        })()}

        {/* Actions — auto-rig + preset animations (engine capability) */}
        {sel.status === 'succeeded' && (() => {
          const rig = sel.params?.rig;
          const variants = sel.params?.variants || {};
          const active = sel.params?.activeVariant || 'static';
          const CHIP = { static: '靜態', walk: '走路', run: '跑步' };
          return (
            <>
              <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', margin:'18px 0 10px'}}>動作（骨骼動畫）</div>
              {!rig ? (
                <>
                  <button onClick={animate} disabled={busy === 'animate'}
                    style={{width:'100%', height:'40px', borderRadius:'9px', border:'1.5px solid var(--primary-600)', background:'#fff', color:'var(--primary-600)', fontSize:'13px', fontWeight:'700', cursor:'pointer', opacity: busy === 'animate' ? .6 : 1}}>
                    {busy === 'animate' ? '啟動中…' : '生成動作（走路＋跑步）'}
                  </button>
                  <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginTop:'6px', lineHeight:1.6}}>
                    自動綁骨後產生走路／跑步動畫（約 5 credits）。僅適合「人形、有貼圖、四肢清楚」的模型；示範引擎不支援。
                  </div>
                </>
              ) : rig.status === 'processing' ? (
                <div style={{display:'flex', alignItems:'center', gap:'9px', padding:'11px 12px', borderRadius:'9px', background:'var(--primary-50)', color:'var(--primary-700)', fontSize:'12px', fontWeight:'700'}}>
                  <span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0', animation:'spin 1.2s linear infinite'}}><Icon name="loader" /></span>
                  綁骨與動作生成中…（約 1–2 分鐘）
                </div>
              ) : rig.status === 'failed' ? (
                <>
                  <div style={{padding:'10px 12px', borderRadius:'9px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'11.5px', fontWeight:'600', lineHeight:1.5, marginBottom:'8px'}}>{rig.error || '動作生成失敗'}</div>
                  <button onClick={animate} disabled={busy === 'animate'} style={{height:'32px', padding:'0 14px', borderRadius:'8px', border:'1px solid var(--primary-600)', background:'#fff', color:'var(--primary-600)', fontSize:'12px', fontWeight:'700', cursor:'pointer'}}>重試</button>
                </>
              ) : (
                <>
                  <div style={{display:'flex', gap:'8px'}}>
                    {['static', 'walk', 'run'].filter((v) => variants[v]).map((v) => (
                      <button key={v} onClick={() => setVariant(v)} disabled={busy === 'variant' || active === v}
                        style={{flex:1, height:'36px', borderRadius:'9999px', border: active === v ? 'none' : '1px solid var(--border-default)', background: active === v ? 'var(--primary-600)' : '#fff', color: active === v ? '#fff' : 'var(--text-body)', fontSize:'12.5px', fontWeight:'700', cursor: active === v ? 'default' : 'pointer'}}>
                        {CHIP[v]}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:'10.5px', color:'var(--text-subtle)', marginTop:'6px', lineHeight:1.6}}>
                    切換後預覽與 AR 都會使用此動作。已指派給任務的模型，請到產生器重新選擇一次才會套用。
                  </div>
                </>
              )}
            </>
          );
        })()}

        <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', margin:'18px 0 12px'}}>調整</div>
        <div style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', marginBottom:'7px'}}>名稱（顯示於產生器下拉選單）</div>
        <input value={adjust.name} onChange={(e) => setAdjust({ ...adjust, name: e.target.value })} maxLength={255}
          style={{width:'100%', height:'38px', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'0 11px', fontSize:'13px', color:'var(--text-strong)', outline:'none', marginBottom:'16px'}} />
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'9px'}}><span style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)'}}>AR 比例</span><span style={{fontSize:'12px', fontWeight:'700', color:'var(--primary-600)', fontFamily:'var(--font-mono)'}}>{Number(adjust.scale).toFixed(1)}×</span></div>
        <input type="range" min="0.1" max="2" step="0.1" value={adjust.scale} onChange={(e) => setAdjust({ ...adjust, scale: e.target.value })} style={{width:'100%', marginBottom:'18px', accentColor:'var(--primary-600)'}} />

        <div style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', marginBottom:'9px'}}>色調（AR 顯示時套用）</div>
        <div style={{display:'flex', gap:'9px', marginBottom:'20px'}}>
          {TINTS.map((c) => (
            <button key={c || 'none'} onClick={() => setAdjust({ ...adjust, color_tint: c })} title={c || '原色'}
              style={{width:'34px', height:'34px', borderRadius:'9999px', background: c || 'linear-gradient(135deg,#fff 45%,#CBD5E1 55%)', border:'1px solid var(--border-default)', cursor:'pointer', boxShadow: adjust.color_tint === c ? '0 0 0 2px #fff, 0 0 0 4px var(--primary-600)' : 'none'}} />
          ))}
        </div>

        <button onClick={saveAdjust} disabled={busy === 'adjust' || sel.status !== 'succeeded'} style={{width:'100%', height:'44px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity: busy === 'adjust' || sel.status !== 'succeeded' ? .6 : 1}}>{busy === 'adjust' ? '儲存中…' : '儲存調整'}</button>
      </>) : (
        <div style={{fontSize:'12.5px', color:'var(--text-subtle)', lineHeight:1.6}}>選擇左側一筆生成紀錄，或上傳新圖片。</div>
      )}
    </aside>
  </div>
</div>
</AdminShell>
  );
}
