'use client';

/**
 * Join CTA for the public event website. On phones the LIFF permalink opens
 * LINE directly; on desktop a QR modal appears instead — scanning your own
 * screen is impossible, so the QR (same permalink) hands the journey to the
 * visitor's phone. One component, three visual variants (hero/ghost/bar).
 */

import { useState } from 'react';
import { Icon } from '../Icon';

const MOBILE_UA = /iphone|ipad|ipod|android|mobile/i;

const VARIANTS = {
  primary: { display:'inline-flex', alignItems:'center', gap:'8px', padding:'13px 24px', borderRadius:'var(--site-btn-radius, 9999px)', background:'#fff', color:'var(--brand-dark)', fontSize:'15px', fontWeight:'800', border:'none', cursor:'pointer' },
  ghost: { display:'inline-flex', alignItems:'center', gap:'8px', padding:'13px 20px', borderRadius:'var(--site-btn-radius, 9999px)', background:'rgba(255,255,255,.12)', color:'#fff', fontSize:'14px', fontWeight:'600', border:'1px solid rgba(255,255,255,.25)', cursor:'pointer' },
  bar: { display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', width:'100%', height:'54px', borderRadius:'var(--site-btn-radius, 9999px)', background:'var(--brand)', color:'#fff', fontSize:'16px', fontWeight:'800', border:'none', cursor:'pointer' },
};

export default function JoinCta({ href, label, icon, variant = 'primary' }) {
  const [modal, setModal] = useState(null); // {dataUrl}
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    // Phone: the permalink opens LINE directly. Desktop: show a QR to scan.
    if (MOBILE_UA.test(navigator.userAgent)) { window.location.href = href; return; }
    setBusy(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(href, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
      setModal({ dataUrl });
    } catch { window.location.href = href; }
    finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={go} style={{...VARIANTS[variant] || VARIANTS.primary, opacity: busy ? .7 : 1}}>
        {icon && <span style={{fontSize:'17px', display:'inline-flex', lineHeight:'0'}}><Icon name={icon} /></span>}{label}
      </button>

      {modal && (
        <div onClick={() => setModal(null)} style={{position:'fixed', inset:0, zIndex:100, background:'rgba(11,41,53,.62)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div onClick={(e) => e.stopPropagation()} style={{background:'#fff', borderRadius:'18px', boxShadow:'var(--shadow-xl)', padding:'26px 24px', width:'100%', maxWidth:'380px', textAlign:'center'}}>
            <div style={{fontSize:'17px', fontWeight:'800', color:'var(--text-strong)'}}>用手機掃描加入</div>
            <div style={{fontSize:'12.5px', color:'var(--text-muted)', marginTop:'5px', lineHeight:1.6}}>以手機相機或 LINE 掃描 QR Code — 免下載，直接在 LINE 開始旅程。</div>
            <img src={modal.dataUrl} alt="QR Code" style={{width:'100%', maxWidth:'260px', margin:'16px auto 10px', display:'block', border:'1px solid var(--border-subtle)', borderRadius:'14px'}} />
            <a href={href} style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12.5px', fontWeight:'700', color:'var(--brand, var(--primary-600))', textDecoration:'none'}}>或在此裝置直接開啟<span style={{fontSize:'13px', display:'inline-flex', lineHeight:'0'}}><Icon name="arrow-right" /></span></a>
            <div style={{marginTop:'16px'}}>
              <button onClick={() => setModal(null)} style={{height:'40px', padding:'0 22px', borderRadius:'9999px', background:'#fff', border:'1px solid var(--border-default)', color:'var(--text-body)', fontSize:'13px', fontWeight:'600', cursor:'pointer'}}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
