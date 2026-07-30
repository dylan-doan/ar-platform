/**
 * A SUB-PAGE of the event website (multipage: event.config.pages, composed
 * in the drag-drop designer). Compact brand header + nav instead of the
 * full-bleed hero, then the page's Puck document, then the shared footer.
 * The site-wide theme comes from the HOME document (siteTheme).
 *
 * SHARED FILE — copied verbatim into the Next.js project export (see the note
 * in EventSite.jsx).
 */

import Link from 'next/link';
import { Render } from '@measured/puck/rsc';
import { Icon } from '../Icon';
import JoinCta from './JoinCta';
import { brandPalette } from '../../lib/brand';
import { siteConfig, themeStyles } from '../../lib/site-blocks';
import { CustomCss, siteJoinHref, siteNav, siteRoot, siteTheme } from './EventSite';

const WRAP = { maxWidth: '1140px', width: '100%', margin: '0 auto', padding: '0 clamp(16px, 4vw, 26px)' };

export default function EventSubPage({ site, page, linkBase }) {
  const { branding, event, tasks } = site;
  const p = brandPalette(branding.theme_color || '#0E7490') || {};
  const base = linkBase ?? `/e/${branding.tenant_slug}`;
  const eventHref = `${base}/${event.slug}`;
  const nav = siteNav(event, eventHref);
  const theme = themeStyles(siteTheme(event), siteRoot(event).themeCustom);
  const joinHref = siteJoinHref(site);
  // The home theme (incl. customizer values) forced onto this page's root —
  // one theme for the whole site.
  const data = { ...page.data, root: { ...(page.data?.root || {}), props: { ...(page.data?.root?.props || {}), theme: siteTheme(event), themeCustom: siteRoot(event).themeCustom } } };

  return (
<div className="page-full" style={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, background: 'var(--surface-app)', display: 'flex', flexDirection: 'column', ...theme.vars, ...theme.page }}>
  <CustomCss event={event} />

  {/* ── Compact brand header + nav ───────────────────────────────────── */}
  <div style={{background: `linear-gradient(135deg, ${p.heroA}, ${p.heroB})`, color: '#fff'}}>
    <div style={{...WRAP, display:'flex', alignItems:'center', gap:'10px', paddingTop:'14px', paddingBottom:'14px', flexWrap:'wrap'}}>
      <Link href={eventHref} style={{display:'flex', alignItems:'center', gap:'10px', color:'#fff', textDecoration:'none'}}>
        {branding.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'30px', height:'30px', borderRadius:'8px', objectFit:'cover', background:'#fff'}} />
          : <span style={{width:'28px', height:'28px', borderRadius:'7px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'15px'}}><Icon name="scan-line" /></span>}
        <span style={{fontSize:'14px', fontWeight:'700'}}>{event.name}</span>
      </Link>
      <nav style={{display:'flex', alignItems:'center', gap:'4px', marginLeft:'10px', flexWrap:'wrap'}}>
        <Link href={eventHref} style={{padding:'6px 12px', borderRadius:'9999px', color:'rgba(255,255,255,.92)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none'}}>首頁</Link>
        {nav.map((it) => it.external
          ? <a key={it.href} href={it.href} target="_blank" rel="noreferrer" style={{padding:'6px 12px', borderRadius:'9999px', color:'#fff', fontSize:'12.5px', fontWeight:'600', textDecoration:'none', background:'rgba(255,255,255,.08)'}}>{it.label}</a>
          : <Link key={it.href} href={it.href} style={{padding:'6px 12px', borderRadius:'9999px', color:'#fff', fontSize:'12.5px', fontWeight:'600', textDecoration:'none', background: it.slug === page.slug ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)'}}>{it.label}</Link>)}
      </nav>
      <div style={{marginLeft:'auto'}}>
        <JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />
      </div>
    </div>
  </div>

  {/* ── Page content (Puck document) ─────────────────────────────────── */}
  <div style={{...WRAP, flex:'1', paddingTop:'26px', paddingBottom:'40px'}}>
    <Render config={siteConfig} data={data} metadata={{ event, tasks }} />
  </div>

  {/* ── Footer ───────────────────────────────────────────────────────── */}
  <div style={{padding:'16px', textAlign:'center', borderTop:'1px solid var(--border-subtle)', fontSize:'11.5px', color:'var(--text-subtle)', background:'#fff'}}>
    © {branding.tenant_name}{branding.show_powered_by && <> · Powered by <span style={{fontWeight:'700'}}>Zoustec</span></>}
  </div>
</div>
  );
}
