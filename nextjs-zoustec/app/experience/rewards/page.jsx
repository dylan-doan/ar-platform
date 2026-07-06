'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../../../components/Icon';
import { api, session } from '../../../lib/liff-client';

const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };

export default function Page() {
  const router = useRouter();
  const [tasks, setTasks] = useState(null);
  const [progress, setProgress] = useState(null);
  const [event, setEvent] = useState(null);
  const [last, setLast] = useState(null); // {task_name, reward_unlocked, ...} from the AR screen

  useEffect(() => {
    (async () => {
      if (!session.token || !session.eventId) return router.replace('/experience/login');
      try {
        const raw = sessionStorage.getItem('zx_last_result');
        if (raw) setLast(JSON.parse(raw));
        const [t, p, e] = await Promise.all([
          api(`/api/me/events/${session.eventId}/tasks`),
          api(`/api/me/events/${session.eventId}/progress`),
          api(`/api/me/events/${session.eventId}`),
        ]);
        setTasks(t); setProgress(p); setEvent(e);
      } catch (e) {
        if (e.status === 401) return router.replace('/experience/login');
      }
    })();
  }, [router]);

  const done = progress?.stamps_collected ?? 0;
  const total = progress?.total_tasks ?? 0;
  const unlocked = progress?.reward_unlocked;
  const headline = last?.task_name || (done ? '繼續收集' : '開始收集');

  return (
<div style={{flex:'1', display:'flex', flexDirection:'column', minHeight:'100dvh'}}>

  {/* New stamp header — live */}
  <div style={{background:'linear-gradient(150deg, var(--brand-hero-a), var(--brand-hero-b))', padding:'28px 20px 26px', color:'#fff', position:'relative', textAlign:'center', flex:'0 0 auto'}}>
    <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 50% 30%,rgba(56,176,214,.35),transparent 60%)'}}></div>
    <div style={{position:'relative', width:'80px', height:'80px', borderRadius:'9999px', background: last ? 'linear-gradient(145deg,#FEBC2E,#D97706)' : 'linear-gradient(145deg,#38B0D6,#0E7490)', margin:'6px auto 0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px', boxShadow:'0 14px 30px rgba(0,0,0,.4),inset 0 2px 10px rgba(255,255,255,.4)', color:'#fff'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="award" /></span></div>
    <div style={{position:'relative', fontSize:'12px', fontWeight:'700', letterSpacing:'.12em', textTransform:'uppercase', color:'var(--brand-light)', marginTop:'16px'}}>{last ? (last.already_completed ? '已收集過此印章' : '獲得新印章！') : '我的集章冊'}</div>
    <div style={{position:'relative', fontSize:'22px', fontWeight:'800', marginTop:'5px'}}>{headline}</div>
    <div style={{position:'relative', fontSize:'13px', color:'#B6D4DE', marginTop:'5px'}}>你已收集 {done} / {total} 枚印章</div>
    {unlocked && (
      <div style={{position:'relative', display:'inline-flex', alignItems:'center', gap:'8px', marginTop:'12px', padding:'8px 16px', borderRadius:'9999px', background:'linear-gradient(145deg,#FEF3C7,#FDE68A)', color:'#B45309', fontSize:'13px', fontWeight:'800'}}>
        <span style={{fontSize:'16px', display:'inline-flex', lineHeight:'0'}}><Icon name="trophy" /></span>{event?.reward_name || '獎勵'}已解鎖！
      </div>
    )}
  </div>

  {/* Stamp book — live */}
  <div style={{flex:'1', padding:'18px 16px 88px', background:'var(--surface-app)'}}>
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px'}}><div style={{fontSize:'14px', fontWeight:'800', color:'var(--text-strong)'}}>集章冊</div><div style={{fontSize:'12px', fontWeight:'700', color:'var(--brand)'}}>{done}/{total}</div></div>
    {!tasks && <div style={{padding:'30px', textAlign:'center', color:'var(--text-subtle)', fontSize:'13px'}}>載入中…</div>}
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'11px'}}>
      {(tasks || []).map((t) => {
        const isNew = last && !last.already_completed && last.task_name === t.name;
        if (t.completed && isNew) {
          return <div key={t.id} style={{aspectRatio:'1', borderRadius:'14px', background:'linear-gradient(145deg,#FEF3C7,#FDE68A)', border:'1.5px solid #FBBF24', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', color:'#B45309', boxShadow:'0 0 0 3px rgba(251,191,36,.25)', padding:'4px'}}><span style={{fontSize:'26px', display:'inline-flex', lineHeight:'0'}}><Icon name="award" /></span><span style={{fontSize:'9.5px', fontWeight:'800', textAlign:'center'}}>{t.name}</span></div>;
        }
        if (t.completed) {
          return <div key={t.id} style={{aspectRatio:'1', borderRadius:'14px', background:'var(--primary-50)', border:'1.5px solid var(--primary-200)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', color:'var(--brand)', padding:'4px'}}><span style={{fontSize:'26px', display:'inline-flex', lineHeight:'0'}}><Icon name={METHOD_ICON[t.verification_type] || 'building-2'} /></span><span style={{fontSize:'9.5px', fontWeight:'700', color:'var(--primary-800)', textAlign:'center'}}>{t.name}</span></div>;
        }
        return <div key={t.id} style={{aspectRatio:'1', borderRadius:'14px', background:'var(--surface-sunken)', border:'1.5px dashed var(--border-default)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', color:'var(--text-subtle)', padding:'4px'}}><span style={{fontSize:'24px', display:'inline-flex', lineHeight:'0'}}><Icon name="lock" /></span><span style={{fontSize:'9.5px', fontWeight:'600', textAlign:'center'}}>{t.name}</span></div>;
      })}
    </div>
    <div style={{display:'flex', gap:'9px', marginTop:'16px'}}>
      <Link href="/experience/map" style={{flex:'1', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', height:'46px', borderRadius:'9999px', background:'var(--brand)', color:'#fff', fontSize:'13.5px', fontWeight:'700', textDecoration:'none'}}><span style={{fontSize:'16px', display:'inline-flex', lineHeight:'0'}}><Icon name="navigation" /></span>下一個地點</Link>
      <div style={{width:'46px', height:'46px', borderRadius:'9999px', background:'#fff', border:'1px solid var(--border-default)', color:'var(--text-body)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px'}}><span style={{display:'inline-flex', lineHeight:'0'}}><Icon name="share-2" /></span></div>
    </div>
  </div>
</div>
  );
}
