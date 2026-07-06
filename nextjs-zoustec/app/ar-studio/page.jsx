'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Icon } from '../../components/Icon';
import { adminApi, adminUpload, AuthRequired, loginUrl } from '../../lib/admin-client';

const GlbPreview = dynamic(() => import('../../components/GlbPreview'), { ssr: false });

const STATUS_META = {
  pending: { label: '排隊中…', color: 'var(--warning-600)' },
  processing: { label: 'AI 生成中…', color: 'var(--info-600)' },
  succeeded: { label: '已生成 · GLB 3D', color: 'var(--success-600)' },
  failed: { label: '生成失敗', color: 'var(--danger-600)' },
};
const TINTS = ['', '#0E7490', '#16A34A', '#D97706', '#7C3AED', '#DC2626'];

export default function Page() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [jobs, setJobs] = useState(null);
  const [sel, setSel] = useState(null);        // selected job
  const [adjust, setAdjust] = useState(null);  // {scale, color_tint}
  const [busy, setBusy] = useState('');
  const [compiling, setCompiling] = useState({}); // jobId -> % | 'done' | 'failed'
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  function note(m) { setFlash(m); setTimeout(() => setFlash(''), 2500); }
  function guard(e) {
    if (e instanceof AuthRequired) { router.replace(loginUrl('/ar-studio')); return true; }
    return false;
  }
  function pick(job) {
    setSel(job);
    setAdjust(job ? { scale: job.params?.scale ?? 0.4, color_tint: job.params?.color_tint || '' } : null);
  }

  async function refresh(selectId) {
    const list = await adminApi('/api/admin/model3d/jobs');
    setJobs(list);
    const want = selectId || sel?.id;
    const found = list.find((j) => j.id === want) || list[0] || null;
    pick(found);
    return list;
  }

  useEffect(() => {
    (async () => {
      try { await refresh(); }
      catch (e) { if (!guard(e)) setError(e.message); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while any job is still generating.
  useEffect(() => {
    if (!jobs?.some((j) => j.status === 'pending' || j.status === 'processing')) return;
    const t = setInterval(async () => {
      try { await refresh(); } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(t);
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Compile the uploaded artwork into a MindAR .mind target IN THE BROWSER
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

  async function upload(file) {
    if (!file || busy) return;
    setBusy('upload'); setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const job = await adminUpload(`/api/admin/model3d/jobs?name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, fd);
      await refresh(job.id);
      note('已開始生成 — AI 處理中');
      compileTarget(job.id, file); // chạy nền, có tiến độ riêng
    } catch (e) { if (!guard(e)) setError(e.message); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function saveAdjust() {
    if (!sel || busy) return;
    setBusy('adjust'); setError('');
    try {
      const body = { scale: Number(adjust.scale) || 0.4 };
      if (adjust.color_tint) body.color_tint = adjust.color_tint;
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

  return (
<div className="editor-shell">

  {/* ── Toolbar ───────────────────────────────────────────────────────── */}
  <div className="editor-topbar" style={{height:'60px', flex:'0 0 auto', background:'#fff', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', padding:'0 22px', gap:'12px'}}>
    <Link href="/dashboard" title="返回儀表板" style={{width:'34px', height:'34px', borderRadius:'8px', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'17px', textDecoration:'none', flex:'0 0 auto'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-left" /></span></Link>
    <span style={{width:'34px', height:'34px', borderRadius:'9px', background:'linear-gradient(145deg,#6FCDE8,#0E7490)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="sparkles" /></span></span>
    <div><div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>AR Studio · AI 3D 生成</div><div style={{fontSize:'11.5px', color:'var(--text-muted)'}}>上傳 2D 圖 → AI 生成 3D → 於網站產生器指派給任務</div></div>
    <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px'}}>
      {flash && <span style={{fontSize:'12.5px', fontWeight:'700', color:'var(--success-600)'}}>{flash}</span>}
      <Link href="/builder" style={{display:'flex', alignItems:'center', gap:'7px', height:'36px', padding:'0 15px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', fontSize:'13px', fontWeight:'600', textDecoration:'none'}}><span style={{fontSize:'15px', display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span>到產生器指派</Link>
    </div>
  </div>

  {/* ── Body: upload+history / viewport / adjust ──────────────────────── */}
  <div className="editor-body">

    {/* Upload + history */}
    <aside className="editor-aside" style={{width:'310px', flex:'0 0 auto', background:'#fff', borderRight:'1px solid var(--border-subtle)', padding:'20px 18px'}}>
      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'11px'}}>1 · 上傳 2D 來源圖</div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e) => upload(e.target.files?.[0])} />
      <button onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}
        style={{width:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px', padding:'26px 12px', borderRadius:'12px', border:'1.5px dashed var(--border-default)', background:'var(--surface-sunken)', color:'var(--text-muted)', fontSize:'12.5px', fontWeight:'600', cursor:'pointer'}}>
        <span style={{fontSize:'26px', color:'var(--primary-600)', display:'inline-flex', lineHeight:'0'}}><Icon name={busy === 'upload' ? 'loader' : 'image-up'} /></span>
        {busy === 'upload' ? '上傳中…' : '點擊上傳吉祥物 / 角色圖'}
        <span style={{fontSize:'10.5px', fontWeight:'500'}}>PNG / JPG / WebP · ≤10MB</span>
      </button>

      {error && <div style={{marginTop:'12px', padding:'10px', borderRadius:'8px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'12px', fontWeight:'600'}}>{error}</div>}

      <div style={{fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', margin:'20px 0 11px'}}>2 · 生成紀錄（{jobs?.length ?? '…'}）</div>
      <div style={{display:'flex', flexDirection:'column', gap:'7px'}}>
        {(jobs || []).map((j) => {
          const m = STATUS_META[j.status];
          const active = sel?.id === j.id;
          return (
            <div key={j.id} onClick={() => pick(j)} style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px 11px', borderRadius:'9px', border: active ? '1.5px solid var(--primary-600)' : '1px solid var(--border-subtle)', background: active ? 'var(--primary-50)' : '#fff', cursor:'pointer'}}>
              <span style={{width:'32px', height:'32px', borderRadius:'8px', background:'var(--primary-50)', color:'var(--primary-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flex:'0 0 auto'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={j.status === 'succeeded' ? 'box' : j.status === 'failed' ? 'circle-alert' : 'loader'} /></span></span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:'13px', fontWeight:'600', color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{j.name}</div>
                <div style={{fontSize:'10.5px', fontWeight:'700', color:m.color}}>{m.label}</div>
                <div style={{fontSize:'10px', fontWeight:'600', color: j.params?.targetUrl ? 'var(--success-600)' : compiling[j.id] === 'failed' ? 'var(--danger-600)' : 'var(--text-subtle)'}}>
                  {j.params?.targetUrl ? '目標圖 ✓' : typeof compiling[j.id] === 'number' ? `編譯目標圖 ${compiling[j.id]}%` : compiling[j.id] === 'failed' ? '目標圖編譯失敗' : '無目標圖'}
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

    {/* Adjust panel */}
    <aside className="editor-aside" style={{width:'340px', flex:'0 0 auto', background:'#fff', borderLeft:'1px solid var(--border-subtle)', padding:'20px 18px'}}>
      <div style={{fontSize:'13px', fontWeight:'800', color:'var(--text-strong)', marginBottom:'16px'}}>調整</div>
      {sel && adjust ? (<>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'9px'}}><span style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)'}}>AR 比例</span><span style={{fontSize:'12px', fontWeight:'700', color:'var(--primary-600)', fontFamily:'var(--font-mono)'}}>{Number(adjust.scale).toFixed(1)}×</span></div>
        <input type="range" min="0.1" max="2" step="0.1" value={adjust.scale} onChange={(e) => setAdjust({ ...adjust, scale: e.target.value })} style={{width:'100%', marginBottom:'20px', accentColor:'var(--primary-600)'}} />

        <div style={{fontSize:'12px', fontWeight:'600', color:'var(--text-body)', marginBottom:'9px'}}>色調（AR 顯示時套用）</div>
        <div style={{display:'flex', gap:'9px', marginBottom:'22px'}}>
          {TINTS.map((c) => (
            <button key={c || 'none'} onClick={() => setAdjust({ ...adjust, color_tint: c })} title={c || '原色'}
              style={{width:'34px', height:'34px', borderRadius:'9999px', background: c || 'linear-gradient(135deg,#fff 45%,#CBD5E1 55%)', border:'1px solid var(--border-default)', cursor:'pointer', boxShadow: adjust.color_tint === c ? '0 0 0 2px #fff, 0 0 0 4px var(--primary-600)' : 'none'}} />
          ))}
        </div>

        <button onClick={saveAdjust} disabled={busy === 'adjust' || sel.status !== 'succeeded'} style={{width:'100%', height:'44px', borderRadius:'9999px', background:'var(--primary-600)', color:'#fff', fontSize:'14px', fontWeight:'700', border:'none', cursor:'pointer', opacity: busy === 'adjust' || sel.status !== 'succeeded' ? .6 : 1, marginBottom:'18px'}}>{busy === 'adjust' ? '儲存中…' : '儲存調整'}</button>

        <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:'16px', fontSize:'11px', fontWeight:'700', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-subtle)', marginBottom:'12px'}}>下一步</div>
        <div style={{display:'flex', alignItems:'center', gap:'11px', padding:'12px', borderRadius:'10px', border:'1.5px solid var(--primary-600)', background:'var(--primary-50)'}}>
          <span style={{width:'32px', height:'32px', borderRadius:'8px', background:'var(--primary-600)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="layout-template" /></span></span>
          <div style={{flex:'1'}}><div style={{fontSize:'12.5px', fontWeight:'700', color:'var(--primary-800)'}}>指派給任務</div><div style={{fontSize:'11px', color:'var(--primary-700)'}}>網站產生器 → 點任務 → 3D 模型下拉選單</div></div>
          <Link href="/builder" style={{color:'var(--primary-600)', fontSize:'16px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></Link>
        </div>
      </>) : (
        <div style={{fontSize:'12.5px', color:'var(--text-subtle)', lineHeight:1.6}}>選擇左側一筆生成紀錄，或上傳新圖片。</div>
      )}
    </aside>
  </div>
</div>
  );
}
