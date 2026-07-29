'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Icon } from '../../../components/Icon';
import { api, getPosition, session } from '../../../lib/liff-client';

// MindAR + camera touch window — client only, never SSR.
const ARStage = dynamic(() => import('../../../components/ar/ARStage'), { ssr: false });
const QrScanner = dynamic(() => import('../../../components/ar/QrScanner'), { ssr: false });

const AR_STATUS_TEXT = {
  initializing: '正在啟動 AR 引擎…',
  'camera-started': '3D 吉祥物出現中…',
  completed: 'AR 展示完成！',
};

/** Printed standees encode the LIFF permalink (?tenant&event&task&qr, maybe
 * wrapped in liff.state). Users may also type the bare token. */
function parseQrText(text) {
  const t = (text || '').trim();
  if (!t) return { qr: '', taskId: null };
  let qs = null;
  try {
    const url = new URL(t);
    qs = url.searchParams;
    const st = qs.get('liff.state');
    if (st) {
      const dec = decodeURIComponent(st);
      const q = dec.includes('?') ? dec.slice(dec.indexOf('?') + 1) : dec.replace(/^[?/]+/, '');
      qs = new URLSearchParams(q);
    }
  } catch {
    return { qr: t, taskId: null }; // not a URL → bare token
  }
  return { qr: qs.get('qr') || '', taskId: qs.get('task') || null };
}

export default function Page() {
  const router = useRouter();
  const [task, setTask] = useState(null);
  const [qr, setQr] = useState('');
  const [manual, setManual] = useState('');
  const [phase, setPhase] = useState('boot'); // boot | scan | ar
  const [scanMsg, setScanMsg] = useState('');
  const [camDead, setCamDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [arStatus, setArStatus] = useState('');
  const [arDone, setArDone] = useState(false);
  // The 3D model is a reward for scanning THIS event's QR — never shown before
  // a code has been validated (or the user arrived via a printed standee QR).
  const [arUnlocked, setArUnlocked] = useState(false);
  const verifyingRef = useRef(false);
  const rejectedRef = useRef(new Set()); // raw codes already refused — stop re-verifying every scanner tick

  useEffect(() => {
    (async () => {
      if (!session.token || !session.taskId) return router.replace('/experience/map');
      try {
        // Deep-link: /experience/ar?task=ID&qr=TOKEN (standee scanned with the
        // phone camera before entering the app) → that scan already happened,
        // but the token still has to be right before the model unlocks.
        const params = new URLSearchParams(window.location.search);
        const urlQr = params.get('qr') || '';
        const viaPrintedQr = Boolean(params.get('task'));
        const t = await api(`/api/me/tasks/${session.taskId}`);
        setTask(t);
        const tNeedsQr = t.verification_type === 'qr' || t.verification_type === 'hybrid';
        const tHasAr = Boolean(t.ar_config?.glbUrl);
        if (tNeedsQr) {
          if (urlQr) {
            try {
              await api(`/api/me/tasks/${t.id}/verify-qr`, { method: 'POST', body: { qr_code: urlQr } });
              setQr(urlQr);
              setArUnlocked(true);
              setPhase('ar');
            } catch {
              setScanMsg('此 QR Code 不適用於這個任務 — 請掃描本任務立牌上的 QR');
              setPhase('scan');
            }
          } else setPhase('scan');
        } else if (tHasAr && !viaPrintedQr) {
          setPhase('scan'); // AR-only reveal gate: the on-site QR is the trigger
        } else {
          if (tHasAr) setArUnlocked(true);
          setPhase('ar');
        }
      } catch (e) {
        if (e.status === 401) return router.replace('/experience/login');
        setError(e.message);
        setPhase('ar');
      }
    })();
  }, [router]);

  const needsQr = task && (task.verification_type === 'qr' || task.verification_type === 'hybrid');
  const needsGps = task && (task.verification_type === 'gps' || task.verification_type === 'hybrid');
  const hasAr = Boolean(task?.ar_config?.glbUrl);

  /** Step 1: a code arrived (scanned or typed). Validate it BEFORE the model
   * shows — wrong/foreign codes stay on the scan step. The standee wins:
   * scanning another stop's QR switches to that task. Returns true on accept. */
  async function acceptQr({ qr: code, taskId }) {
    if (verifyingRef.current) return false;
    verifyingRef.current = true;
    try {
      let t = task;
      if (taskId && taskId !== session.taskId) {
        try {
          t = await api(`/api/me/tasks/${taskId}`);
          session.setTask(taskId);
          setTask(t);
        } catch {
          setScanMsg('這個 QR 不屬於本活動 — 請掃描本活動立牌上的 QR');
          return false;
        }
      }
      const tNeedsQr = t && (t.verification_type === 'qr' || t.verification_type === 'hybrid');
      if (tNeedsQr) {
        if (!code) { setScanMsg('這個 QR 不含活動代碼 — 請掃描現場立牌上的 QR'); return false; }
        try {
          await api(`/api/me/tasks/${t.id}/verify-qr`, { method: 'POST', body: { qr_code: code } });
        } catch (e) {
          setScanMsg(e.code === 'qr_invalid' ? '此 QR Code 不適用於這個任務 — 請掃描本任務立牌上的 QR' : e.message);
          return false;
        }
      } else if (!taskId) {
        // GPS-only stop: only its printed standee QR (a task deep-link)
        // proves the player scanned the right sign — bare text can't.
        setScanMsg('這個 QR 不屬於本活動 — 請掃描本活動立牌上的 QR');
        return false;
      }
      setQr(code);
      setScanMsg('');
      setError('');
      setArUnlocked(true);
      setPhase('ar');
      return true;
    } finally {
      verifyingRef.current = false;
    }
  }

  function handleScan(text) {
    if (rejectedRef.current.has(text)) return; // scanner re-reads the same frame ~4×/s
    const parsed = parseQrText(text);
    if (!parsed.qr && !parsed.taskId) {
      rejectedRef.current.add(text);
      return setScanMsg('這個 QR 不含活動代碼 — 請掃描現場立牌上的 QR');
    }
    acceptQr(parsed).then((ok) => { if (!ok) rejectedRef.current.add(text); });
  }

  async function complete() {
    if (busy || !task) return;
    setBusy(true); setError('');
    try {
      const payload = {};
      if (needsQr) {
        if (!qr.trim()) { setPhase('scan'); throw new Error('請先掃描現場 QR 代碼'); }
        payload.qr_code = qr.trim();
      }
      if (needsGps) {
        const pos = await getPosition();
        payload.lat = pos.lat; payload.lng = pos.lng;
      }
      const out = await api(`/api/me/tasks/${task.id}/complete`, { method: 'POST', body: payload });
      sessionStorage.setItem('zx_last_result', JSON.stringify({ task_name: task.name, ...out }));
      router.push('/experience/rewards');
    } catch (e) {
      if (e.code === 'qr_invalid') {
        // Bad code → back to the scan step (and re-lock the model).
        setQr(''); setArUnlocked(false); setArDone(false); setPhase('scan'); setScanMsg('QR 代碼不正確 — 請重新掃描現場立牌');
      } else {
        setError(e.code === 'gps_out_of_range' ? '您還不在打卡範圍內，請再靠近一點' : e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  // ─────────────────────────────────────────── Step 1 · scan the on-site QR
  if (phase === 'scan') {
    return (
<div style={{flex:'1', display:'flex', flexDirection:'column', background:'#000', position:'relative'}}>
  {!camDead && <QrScanner onResult={handleScan} onError={() => setCamDead(true)} />}
  {camDead && <div style={{position:'absolute', inset:'0', background:'linear-gradient(180deg,#243447,#0d1620 60%,#1a2733)'}}></div>}

  {/* Top bar */}
  <div style={{position:'relative', display:'flex', alignItems:'center', gap:'9px', padding:'14px', zIndex:10}}>
    <Link href="/experience/map" style={{width:'34px', height:'34px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', backdropFilter:'blur(6px)', textDecoration:'none'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-left" /></span></Link>
    <div style={{display:'flex', alignItems:'center', gap:'7px', background:'rgba(0,0,0,.35)', padding:'7px 12px', borderRadius:'9999px', color:'#fff', fontSize:'12px', fontWeight:'600', backdropFilter:'blur(6px)'}}>
      <span style={{width:'18px', height:'18px', borderRadius:'9999px', background:'var(--brand, #0E7490)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'10.5px', fontWeight:'800'}}>1</span>
      掃描現場 QR · {task?.name || '…'}
    </div>
  </div>

  {/* Viewfinder frame */}
  <div style={{position:'relative', flex:'1', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
    <div style={{width:'232px', height:'232px', borderRadius:'26px', border:'2px dashed rgba(255,255,255,.55)', boxShadow:'0 0 0 2000px rgba(0,0,0,.35)'}}></div>
  </div>

  {/* Instructions + manual entry */}
  <div style={{position:'relative', padding:'0 20px calc(24px + env(safe-area-inset-bottom, 0px))', display:'flex', flexDirection:'column', gap:'10px', zIndex:10}}>
    {scanMsg && <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(239,68,68,.3)', border:'1px solid rgba(239,68,68,.5)', color:'#FECACA', fontSize:'13px', fontWeight:'600', textAlign:'center', backdropFilter:'blur(6px)'}}>{scanMsg}</div>}
    <div style={{textAlign:'center', color:'#fff', fontSize:'13.5px', fontWeight:'700', textShadow:'0 1px 6px rgba(0,0,0,.7)'}}>
      {camDead ? '無法開啟相機 — 請在下方輸入立牌上的代碼' : '第 1 步 · 將相機對準活動立牌上的 QR 碼'}
    </div>
    {camDead && !needsQr && (
      /* GPS-only stop with a dead camera: the QR only unlocks the AR layer,
         so let the player skip straight to the GPS check (model stays locked). */
      <button onClick={() => setPhase('ar')} style={{height:'44px', borderRadius:'12px', border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.12)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:'pointer', backdropFilter:'blur(6px)'}}>跳過 AR，直接進行打卡</button>
    )}
    <div style={{display:'flex', gap:'8px'}}>
      <input
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        placeholder="或手動輸入 QR 代碼"
        style={{flex:'1', height:'46px', borderRadius:'12px', border:'1px solid rgba(255,255,255,.3)', background:'rgba(0,0,0,.45)', color:'#fff', padding:'0 14px', fontSize:'13px', fontWeight:'600', outline:'none', backdropFilter:'blur(6px)'}}
      />
      <button
        onClick={() => { const p = parseQrText(manual); p.qr ? acceptQr(p) : setScanMsg('請輸入代碼'); }}
        style={{height:'46px', padding:'0 18px', borderRadius:'12px', border:'none', background:'#fff', color:'var(--primary-700)', fontSize:'13.5px', fontWeight:'800', cursor:'pointer'}}
      >確認</button>
    </div>
  </div>
</div>
    );
  }

  // ───────────────────────────────────────────── Step 2 · AR + capture/verify
  return (
<div style={{flex:'1', display:'flex', flexDirection:'column', background:'#000', position:'relative'}}>
  {/* Backdrop: live camera + 3D model, but ONLY after this event's QR was
      scanned and validated (arUnlocked); static visual otherwise */}
  {phase === 'ar' && hasAr && arUnlocked ? (
    <ARStage
      glbUrl={task.ar_config.glbUrl}
      scale={task.ar_config.scale ?? 0.4}
      onComplete={() => setArDone(true)}
      onStatus={setArStatus}
    />
  ) : (
    <>
      <div style={{position:'absolute', inset:'0', background:'linear-gradient(180deg,#243447,#0d1620 60%,#1a2733)'}}></div>
      <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 50% 42%,rgba(56,176,214,.14),transparent 60%)'}}></div>
    </>
  )}

  {/* Top bar */}
  <div style={{position:'relative', display:'flex', alignItems:'center', gap:'9px', padding:'14px', zIndex:10, pointerEvents:'none'}}>
    <Link href="/experience/map" style={{width:'34px', height:'34px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', backdropFilter:'blur(6px)', textDecoration:'none', pointerEvents:'auto'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-left" /></span></Link>
    <div style={{display:'flex', alignItems:'center', gap:'7px', background:'rgba(0,0,0,.35)', padding:'7px 12px', borderRadius:'9999px', color:'#fff', fontSize:'12px', fontWeight:'600', backdropFilter:'blur(6px)'}}>
      {needsQr && <span style={{width:'18px', height:'18px', borderRadius:'9999px', background:'var(--brand, #0E7490)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'10.5px', fontWeight:'800'}}>2</span>}
      <span style={{width:'7px', height:'7px', borderRadius:'50%', background: arDone ? 'var(--success-500)' : 'var(--danger-500)'}}></span>AR · {task?.name || '…'}
    </div>
  </div>

  {/* Static scan frame + mascot (no AR config, or model still locked) */}
  {!(hasAr && arUnlocked) && (
    <div style={{position:'relative', flex:'1', display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{position:'absolute', width:'230px', height:'230px', borderRadius:'24px', border:'2px dashed rgba(255,255,255,.35)'}}></div>
      <div style={{position:'relative', display:'flex', flexDirection:'column', alignItems:'center'}}>
        <div style={{width:'56px', height:'14px', borderRadius:'50%', background:'rgba(0,0,0,.4)', filter:'blur(5px)', position:'absolute', bottom:'-10px'}}></div>
        <div style={{width:'118px', height:'118px', borderRadius:'26px', background:'linear-gradient(150deg,#38B0D6,#0E7490)', boxShadow:'0 20px 40px rgba(0,0,0,.5),inset 0 2px 10px rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', transform:'rotate(-8deg)'}}><span style={{fontSize:'64px', color:'rgba(255,255,255,.92)', display:'inline-flex', lineHeight:'0', transform:'rotate(8deg)'}}><Icon name="box" /></span></div>
      </div>
    </div>
  )}
  {hasAr && arUnlocked && <div style={{flex:'1', pointerEvents:'none'}}></div>}

  {/* AR status + verify controls */}
  <div style={{position:'relative', padding:'0 20px', marginBottom:'14px', display:'flex', flexDirection:'column', gap:'9px', zIndex:10}}>
    {hasAr && arStatus && (
      <div style={{alignSelf:'center', display:'inline-flex', alignItems:'center', gap:'8px', padding:'7px 14px', borderRadius:'9999px', background: arDone ? 'rgba(16,185,129,.25)' : 'rgba(0,0,0,.4)', border:`1px solid ${arDone ? 'rgba(16,185,129,.6)' : 'rgba(255,255,255,.2)'}`, color: arDone ? '#6EE7B7' : '#fff', fontSize:'12.5px', fontWeight:'700', backdropFilter:'blur(6px)'}}>
        {arDone && <span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="circle-check" /></span>}
        {AR_STATUS_TEXT[arStatus] || arStatus}
      </div>
    )}
    {needsQr && qr && (
      <div style={{alignSelf:'center', display:'inline-flex', alignItems:'center', gap:'8px', padding:'6px 12px', borderRadius:'9999px', background:'rgba(16,185,129,.22)', border:'1px solid rgba(16,185,129,.5)', color:'#6EE7B7', fontSize:'12px', fontWeight:'700', backdropFilter:'blur(6px)'}}>
        <span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="circle-check" /></span>QR 已確認
        <button onClick={() => { setQr(''); setArUnlocked(false); setArDone(false); setPhase('scan'); }} style={{background:'none', border:'none', color:'#A7F3D0', fontSize:'11.5px', fontWeight:'700', cursor:'pointer', padding:0, textDecoration:'underline'}}>重新掃描</button>
      </div>
    )}
    {error && <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(239,68,68,.3)', border:'1px solid rgba(239,68,68,.5)', color:'#FECACA', fontSize:'13px', fontWeight:'600', textAlign:'center', backdropFilter:'blur(6px)'}}>{error}</div>}
    <div style={{textAlign:'center', color:'#fff', fontSize:'13px', fontWeight:'600', textShadow:'0 1px 6px rgba(0,0,0,.7)'}}>
      {task ? (needsGps ? '按下快門將取得您的定位並完成驗證' : '按下快門完成打卡') : '載入任務中…'}
    </div>
  </div>

  {/* Controls */}
  <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'center', gap:'34px', paddingBottom:'calc(24px + env(safe-area-inset-bottom, 0px))', zIndex:10}}>
    <span style={{width:'46px', height:'46px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', backdropFilter:'blur(6px)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="rotate-3d" /></span></span>
    <button onClick={complete} disabled={busy || !task} style={{width:'74px', height:'74px', borderRadius:'9999px', background: arDone ? 'var(--success-500)' : '#fff', border:'5px solid rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', color: arDone ? '#fff' : 'var(--primary-700)', fontSize:'28px', cursor:'pointer', opacity:busy ? .6 : 1}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={busy ? 'loader' : 'camera'} /></span></button>
    <span style={{width:'46px', height:'46px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', backdropFilter:'blur(6px)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="share-2" /></span></span>
  </div>
</div>
  );
}
