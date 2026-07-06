'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icon';
import { api, session } from '../../../lib/liff-client';

const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: 'QR + GPS + AR' };
const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };

export default function Page() {
  const router = useRouter();
  const [tasks, setTasks] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!session.token || !session.eventId) return router.replace('/experience/login');
      try {
        const [t, p] = await Promise.all([
          api(`/api/me/events/${session.eventId}/tasks`),
          api(`/api/me/events/${session.eventId}/progress`),
        ]);
        setTasks(t); setProgress(p);
      } catch (e) {
        if (e.status === 401) return router.replace('/experience/login');
        setError(e.message);
      }
    })();
  }, [router]);

  function goTask(t) {
    session.setTask(t.id);
    router.push('/experience/ar');
  }

  const done = progress?.stamps_collected ?? 0;
  const total = progress?.total_tasks ?? 0;

  return (
<div style={{flex:'1', display:'flex', flexDirection:'column', minHeight:'100dvh'}}>

  {/* Map area (decorative) */}
  <div style={{height:'320px', flex:'0 0 auto', position:'relative', background:'#E7EFEA', overflow:'hidden'}}>
    <svg viewBox="0 0 440 320" width="100%" height="320" preserveAspectRatio="xMidYMid slice" style={{position:'absolute', inset:'0'}}><rect width="440" height="320" fill="#DDE9E2"/><path d="M-10,90 C110,65 170,155 310,130 S470,165 470,165" fill="none" stroke="#C3D6CB" strokeWidth="28"/><path d="M60,-10 C85,90 35,165 125,245 S180,355 205,355" fill="none" stroke="#C3D6CB" strokeWidth="22"/><path d="M0,220 L440,238" stroke="#CBD9D0" strokeWidth="3"/><rect x="44" y="165" width="78" height="60" rx="6" fill="#CFDDD4"/><rect x="260" y="66" width="66" height="50" rx="6" fill="#CFDDD4"/><path d="M28,44 Q130,132 232,99 T436,121" fill="none" stroke="#0E7490" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round"/></svg>
    <div style={{position:'absolute', top:'14px', left:'12px', right:'12px', display:'flex', alignItems:'center', gap:'9px', height:'42px', background:'#fff', borderRadius:'12px', boxShadow:'var(--shadow-md)', padding:'0 13px'}}><span style={{color:'var(--brand)', fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name="navigation" /></span><span style={{fontSize:'13px', fontWeight:'700', color:'var(--text-strong)'}}>行程地圖</span><span style={{marginLeft:'auto', fontSize:'11px', fontWeight:'700', color:'var(--brand)', background:'var(--primary-50)', padding:'4px 9px', borderRadius:'9999px'}}>{done} / {total}</span></div>
    {(tasks || []).slice(0, 5).map((t, i) => {
      const spots = [[128, '22%'], [88, '58%'], [204, '44%'], [150, '75%'], [230, '18%']];
      const [top, left] = spots[i % spots.length];
      const style = { position:'absolute', top:`${top}px`, left, border:'3px solid #fff', borderRadius:'9999px', boxShadow:'var(--shadow-md)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' };
      return t.completed
        ? <div key={t.id} style={{...style, width:'34px', height:'34px', background:'var(--success-500)', fontSize:'15px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="check" /></span></div>
        : <div key={t.id} style={{...style, width:'40px', height:'40px', background:'var(--brand)', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="map-pin" /></span></div>;
    })}
  </div>

  {/* Task sheet — live data */}
  <div style={{flex:'1', background:'#fff', borderRadius:'20px 20px 0 0', marginTop:'-18px', position:'relative', padding:'14px 16px 88px'}}>
    <div style={{width:'38px', height:'4px', borderRadius:'9999px', background:'var(--neutral-300)', margin:'0 auto 14px'}}></div>
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}><div style={{fontSize:'15px', fontWeight:'800', color:'var(--text-strong)'}}>任務</div><div style={{fontSize:'12px', fontWeight:'700', color:'var(--text-muted)'}}>{done}/{total} 完成</div></div>
    <div style={{height:'7px', borderRadius:'9999px', background:'var(--surface-sunken)', marginBottom:'16px', position:'relative'}}><span style={{position:'absolute', left:'0', top:'0', height:'7px', width:`${total ? Math.round((done / total) * 100) : 0}%`, borderRadius:'9999px', background:'var(--brand)', transition:'width .3s'}}></span></div>

    {error && <div style={{padding:'12px', borderRadius:'10px', background:'var(--status-danger-bg)', color:'var(--status-danger-fg)', fontSize:'13px', fontWeight:'600', marginBottom:'10px'}}>{error}</div>}
    {!tasks && !error && <div style={{padding:'30px', textAlign:'center', color:'var(--text-subtle)', fontSize:'13px'}}>載入中…</div>}

    {(tasks || []).map((t) => t.completed ? (
      <div key={t.id} style={{display:'flex', alignItems:'center', gap:'12px', padding:'12px', borderRadius:'12px', border:'1px solid var(--border-subtle)', marginBottom:'9px'}}>
        <span style={{width:'40px', height:'40px', borderRadius:'10px', background:'var(--success-50)', color:'var(--success-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="badge-check" /></span></span>
        <div style={{flex:'1'}}><div style={{fontSize:'13.5px', fontWeight:'700', color:'var(--text-strong)'}}>{t.name}</div><div style={{fontSize:'11.5px', color:'var(--success-600)', fontWeight:'600'}}>已完成</div></div>
      </div>
    ) : (
      <button key={t.id} onClick={() => goTask(t)} style={{width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:'12px', padding:'12px', borderRadius:'12px', border:'1.5px solid var(--brand)', background:'var(--primary-50)', marginBottom:'9px', cursor:'pointer'}}>
        <span style={{width:'40px', height:'40px', borderRadius:'10px', background:'var(--brand)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name={METHOD_ICON[t.verification_type] || 'qr-code'} /></span></span>
        <div style={{flex:'1'}}><div style={{fontSize:'13.5px', fontWeight:'700', color:'var(--primary-900)'}}>{t.name}</div><div style={{fontSize:'11.5px', color:'var(--primary-700)'}}>{METHOD_LABEL[t.verification_type] || t.verification_type}{t.radius_m ? ` · 範圍 ${t.radius_m}m` : ''}</div></div>
        <span style={{fontSize:'11px', fontWeight:'800', color:'#fff', background:'var(--brand)', padding:'5px 10px', borderRadius:'9999px'}}>前往</span>
      </button>
    ))}

    {progress?.reward_unlocked && (
      <div style={{display:'flex', alignItems:'center', gap:'10px', padding:'12px', borderRadius:'12px', background:'linear-gradient(145deg,#FEF3C7,#FDE68A)', border:'1.5px solid #FBBF24', color:'#B45309', fontSize:'13px', fontWeight:'700', marginTop:'4px'}}>
        <span style={{fontSize:'18px', display:'inline-flex', lineHeight:'0'}}><Icon name="award" /></span>已解鎖獎勵！前往集章冊查看
      </div>
    )}
  </div>
</div>
  );
}
