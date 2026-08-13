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
import { chromeDoc, siteConfig, themeStyles } from '../../lib/site-blocks';
import { chromeMeta, CustomCss, SiteFooter, SiteHeader, siteJoinHref, siteNav, siteNavLinks, siteRoot, siteTheme } from './EventSite';
import { SiteDefaultFooter, WRAP } from './SiteBody';

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
  // An admin-designed 頁首／頁尾 replaces the built-in chrome site-wide.
  const meta = chromeMeta(site, { nav, eventHref, joinHref, currentSlug: page.slug });
  const customHeader = chromeDoc(event, 'header');
  const customFooter = chromeDoc(event, 'footer');
  // A page can exist before any block is dropped in — say so instead of
  // rendering a blank strip between the header and the footer.
  const empty = !data?.content?.length;

  return (
<div className="page-full" style={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, background: 'var(--surface-app)', display: 'flex', flexDirection: 'column', ...theme.vars, ...theme.page }}>
  <CustomCss event={event} />

  {/* Admin-designed 頁首 — replaces the compact brand header below. */}
  <SiteHeader site={site} meta={meta} />

  {/* ── Compact brand header + nav (built-in fallback) ───────────────── */}
  {!customHeader && (
  <div style={{background: `linear-gradient(135deg, ${p.heroA}, ${p.heroB})`, color: '#fff'}}>
    <div style={{...WRAP, display:'flex', alignItems:'center', gap:'10px', paddingTop:'14px', paddingBottom:'14px', flexWrap:'wrap'}}>
      <Link href={eventHref} style={{display:'flex', alignItems:'center', gap:'10px', color:'#fff', textDecoration:'none'}}>
        {branding.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'30px', height:'30px', borderRadius:'8px', objectFit:'cover', background:'#fff'}} />
          : <span style={{width:'28px', height:'28px', borderRadius:'7px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'15px'}}><Icon name="scan-line" /></span>}
        <span style={{fontSize:'14px', fontWeight:'700'}}>{event.name}</span>
      </Link>
      {/* 首頁 is not part of `nav` (that lists sub-pages), so it is prepended
          here and the shared pills follow — one nav element, same styling. */}
      {siteNavLinks([{ label: '首頁', href: eventHref }, ...nav], page.slug)}
      <div style={{marginLeft:'auto'}}>
        <JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />
      </div>
    </div>
  </div>
  )}

  {/* ── Page content (Puck document) ─────────────────────────────────── */}
  <div style={{...WRAP, flex:'1', paddingTop:'26px', paddingBottom:'40px'}}>
    {empty
      ? <div style={{padding:'46px 20px', textAlign:'center', color:'var(--text-subtle)', fontSize:'13px'}}>此頁面尚未加入內容。</div>
      : <Render config={siteConfig} data={data} metadata={{ event, tasks }} />}
  </div>

  {/* ── Footer — admin-designed 頁尾 wins over the built-in one ──────── */}
  {customFooter ? <SiteFooter site={site} meta={meta} /> : <SiteDefaultFooter branding={branding} />}
</div>
  );
}
