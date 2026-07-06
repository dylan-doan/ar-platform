'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Icon } from '../../../components/Icon';
import { api, getPosition, session } from '../../../lib/liff-client';

// MindAR touches window/camera — client only, never SSR.
const ARStage = dynamic(() => import('../../../components/ar/ARStage'), { ssr: false });

const AR_STATUS_TEXT = {
  initializing: '正在啟動 AR 引擎…',
  'camera-started': '將相機對準現場圖像目標',
  'target-found': '目標鎖定中 — 保持穩定…',
  'target-lost': '目標丟失 — 請重新對準',
  completed: 'AR 掃描完成！',
};

export default function Page() {
  const router = useRouter();
  const [task, setTask] = useState(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [arStatus, setArStatus] = useState('');
  const [arDone, setArDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!session.token || !session.taskId) return router.replace('/experience/map');
      try {
        // QR deep-link: /experience/ar?qr=TOKEN (URL in trên standee, quét bằng camera máy)
        const params = new URLSearchParams(window.location.search);
        if (params.get('qr')) setQr(params.get('qr'));
        setTask(await api(`/api/me/tasks/${session.taskId}`));
      } catch (e) {
        if (e.status === 401) return router.replace('/experience/login');
        setError(e.message);
      }
    })();
  }, [router]);

  const needsQr = task && (task.verification_type === 'qr' || task.verification_type === 'hybrid');
  const needsGps = task && (task.verification_type === 'gps' || task.verification_type === 'hybrid');
  const hasAr = Boolean(task?.ar_config?.glbUrl && task?.ar_config?.targetUrl);

  async function complete() {
    if (busy || !task) return;
    setBusy(true); setError('');
    try {
      const payload = {};
      if (needsQr) {
        if (!qr.trim()) throw new Error('請輸入或掃描 QR 代碼');
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
      setError(e.code === 'gps_out_of_range' ? '您還不在打卡範圍內，請再靠近一點' : e.code === 'qr_invalid' ? 'QR 代碼不正確' : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
<div style={{flex:'1', display:'flex', flexDirection:'column', minHeight:'100dvh', background:'#000', position:'relative'}}>
  {/* Backdrop: real AR camera (MindAR) when the task ships ar_config; static visual otherwise */}
  {hasAr ? (
    <ARStage
      glbUrl={task.ar_config.glbUrl}
      targetUrl={task.ar_config.targetUrl}
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
    <div style={{display:'flex', alignItems:'center', gap:'7px', background:'rgba(0,0,0,.35)', padding:'7px 12px', borderRadius:'9999px', color:'#fff', fontSize:'12px', fontWeight:'600', backdropFilter:'blur(6px)'}}><span style={{width:'7px', height:'7px', borderRadius:'50%', background: arDone ? 'var(--success-500)' : 'var(--danger-500)'}}></span>AR · {task?.name || '…'}</div>
  </div>

  {/* Static scan frame + mascot (only when no real AR engine) */}
  {!hasAr && (
    <div style={{position:'relative', flex:'1', display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{position:'absolute', width:'230px', height:'230px', borderRadius:'24px', border:'2px dashed rgba(255,255,255,.35)'}}></div>
      <div style={{position:'relative', display:'flex', flexDirection:'column', alignItems:'center'}}>
        <div style={{width:'56px', height:'14px', borderRadius:'50%', background:'rgba(0,0,0,.4)', filter:'blur(5px)', position:'absolute', bottom:'-10px'}}></div>
        <div style={{width:'118px', height:'118px', borderRadius:'26px', background:'linear-gradient(150deg,#38B0D6,#0E7490)', boxShadow:'0 20px 40px rgba(0,0,0,.5),inset 0 2px 10px rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', transform:'rotate(-8deg)'}}><span style={{fontSize:'64px', color:'rgba(255,255,255,.92)', display:'inline-flex', lineHeight:'0', transform:'rotate(8deg)'}}><Icon name="box" /></span></div>
      </div>
    </div>
  )}
  {hasAr && <div style={{flex:'1', pointerEvents:'none'}}></div>}

  {/* AR status + verify controls */}
  <div style={{position:'relative', padding:'0 20px', marginBottom:'14px', display:'flex', flexDirection:'column', gap:'9px', zIndex:10}}>
    {hasAr && arStatus && (
      <div style={{alignSelf:'center', display:'inline-flex', alignItems:'center', gap:'8px', padding:'7px 14px', borderRadius:'9999px', background: arDone ? 'rgba(16,185,129,.25)' : 'rgba(0,0,0,.4)', border:`1px solid ${arDone ? 'rgba(16,185,129,.6)' : 'rgba(255,255,255,.2)'}`, color: arDone ? '#6EE7B7' : '#fff', fontSize:'12.5px', fontWeight:'700', backdropFilter:'blur(6px)'}}>
        {arDone && <span style={{fontSize:'14px', display:'inline-flex', lineHeight:'0'}}><Icon name="circle-check" /></span>}
        {AR_STATUS_TEXT[arStatus] || arStatus}
      </div>
    )}
    {error && <div style={{padding:'10px 14px', borderRadius:'10px', background:'rgba(239,68,68,.3)', border:'1px solid rgba(239,68,68,.5)', color:'#FECACA', fontSize:'13px', fontWeight:'600', textAlign:'center', backdropFilter:'blur(6px)'}}>{error}</div>}
    {needsQr && (
      <input
        value={qr}
        onChange={(e) => setQr(e.target.value)}
        placeholder="輸入或掃描 QR 代碼"
        style={{height:'46px', borderRadius:'12px', border:'1px solid rgba(255,255,255,.3)', background:'rgba(0,0,0,.4)', color:'#fff', padding:'0 14px', fontSize:'13px', fontWeight:'600', outline:'none', backdropFilter:'blur(6px)'}}
      />
    )}
    <div style={{textAlign:'center', color:'#fff', fontSize:'13px', fontWeight:'600', textShadow:'0 1px 6px rgba(0,0,0,.7)'}}>
      {task ? (needsGps ? '按下快門將取得您的定位並完成驗證' : '掃描或輸入現場 QR 後按下快門') : '載入任務中…'}
    </div>
  </div>

  {/* Controls */}
  <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'center', gap:'34px', paddingBottom:'92px', zIndex:10}}>
    <span style={{width:'46px', height:'46px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', backdropFilter:'blur(6px)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="rotate-3d" /></span></span>
    <button onClick={complete} disabled={busy || !task} style={{width:'74px', height:'74px', borderRadius:'9999px', background: arDone ? 'var(--success-500)' : '#fff', border:'5px solid rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', color: arDone ? '#fff' : 'var(--primary-700)', fontSize:'28px', cursor:'pointer', opacity:busy ? .6 : 1}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={busy ? 'loader' : 'camera'} /></span></button>
    <span style={{width:'46px', height:'46px', borderRadius:'9999px', background:'rgba(0,0,0,.35)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', backdropFilter:'blur(6px)'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="share-2" /></span></span>
  </div>
</div>
  );
}
