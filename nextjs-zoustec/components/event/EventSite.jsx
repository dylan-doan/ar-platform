/**
 * The EVENT WEBSITE (spec §VII "auto-generate the event website" + §III.3
 * "official website / customer's own domain").
 *
 * Server-rendered public landing page for ONE event — full-bleed hero,
 * overlapping stat cards, task stops, content sections, and the 開始旅程 CTA
 * into the LIFF experience (QR modal on desktop — see JoinCta). White-label:
 * colors/logo come from tenant branding; "Powered by Zoustec" obeys the
 * platform flag.
 *
 * SHARED FILE — the Next.js project export copies this verbatim, so a customer
 * self-hosting their site renders exactly what the platform renders. Keep it
 * host-agnostic: the only host-specific inputs are the `linkBase` prop and the
 * LIFF id, which arrives in the payload (branding.line_liff_id) with an env
 * fallback that resolves on either host. Do not import platform-only modules
 * here — anything added must also exist in export-template/.
 */

import Link from 'next/link';
import { Render } from '@measured/puck/rsc';
import { Icon } from '../Icon';
import EventSections from './EventSections';
import JoinCta from './JoinCta';
import { brandPalette } from '../../lib/brand';
import { chromeDoc, siteConfig, themeStyles } from '../../lib/site-blocks';

/** LIFF app that the CTA/QR opens.
 *
 * The tenant's own LIFF app (white-label plan) wins over the shared platform
 * one. NEXT_PUBLIC_LIFF_ID is the platform fallback; ZOUSTEC_LIFF_ID is the
 * exported project's — reading both keeps this file identical on either host.
 */
export function siteLiffId(branding) {
  return (
    branding.line_liff_id ||
    process.env.NEXT_PUBLIC_LIFF_ID ||
    process.env.ZOUSTEC_LIFF_ID ||
    ''
  );
}

/** CTA target: LIFF permalink when a LIFF app is bound.
 *
 * The permalink works from ANY host — including the customer's own domain,
 * where a relative link would put LINE's OAuth redirectUri outside the LIFF
 * endpoint scope (400 invalid url). Falls back to the in-app route, which only
 * resolves on the platform host.
 */
export function siteJoinHref(site) {
  const { branding, event } = site;
  const query = `tenant=${branding.tenant_slug}&event=${event.id}`;
  const liffId = siteLiffId(branding);
  return liffId
    ? `https://liff.line.me/${liffId}/experience/login?${query}`
    : `/experience/login?${query}`;
}

/** Sub-pages shown in the site nav (multipage: event.config.pages).
 *
 * A page with no blocks yet still counts — it was created on purpose and the
 * admin ticked 顯示於網站選單, so hiding it reads as "the builder lost my page".
 * It renders as an empty page inside the site chrome until blocks are added. */
export function navPages(event) {
  return (event.config?.pages || []).filter((p) => p?.slug && p.nav !== false);
}

/** Site-wide settings live on the HOME document's root props (set in the
 * designer's 活動設定 panel) so every page stays consistent. */
export function siteRoot(event) {
  return event.config?.puck?.root?.props || {};
}

export function siteTheme(event) {
  return siteRoot(event).theme || 'default';
}

/** Nav items: the hand-made menu first, then any sub-page it does not already
 * cover. Menu links accept a sub-page slug or a full URL.
 *
 * The manual menu used to REPLACE the auto list, so on a site whose template
 * ships a menu every page added later silently never appeared. Appending the
 * uncovered pages keeps hand-ordering while making a new page show up. */
export function siteNav(event, eventHref) {
  const menu = (siteRoot(event).menu || []).filter((m) => m?.label).map((m) => {
    const link = String(m.link || '').trim();
    if (/^https?:\/\//i.test(link)) return { label: m.label, href: link, external: true };
    const slug = link.replace(/^\//, '');
    return { label: m.label, href: slug ? `${eventHref}/${slug}` : eventHref, slug };
  });
  const covered = new Set(menu.map((m) => m.slug).filter(Boolean));
  const auto = navPages(event)
    .filter((p) => !covered.has(p.slug))
    .map((p) => ({ label: p.title || p.slug, href: `${eventHref}/${p.slug}`, slug: p.slug }));
  return [...menu, ...auto];
}

/** Metadata handed to the chrome documents so the header/footer blocks can
 * render the live menu, brand and CTA without recomputing any of it. */
export function chromeMeta(site, { nav, eventHref, joinHref, currentSlug }) {
  return {
    event: site.event,
    tasks: site.tasks,
    branding: site.branding,
    nav,
    eventHref,
    joinHref,
    currentSlug: currentSlug || null,
  };
}

/** Admin-designed 頁首 — null when none exists, so the caller falls back to
 * the built-in chrome and existing sites look unchanged. */
export function SiteHeader({ site, meta }) {
  const doc = chromeDoc(site.event, 'header');
  if (!doc) return null;
  return <Render config={siteConfig} data={doc} metadata={meta} />;
}

/** Admin-designed 頁尾 — same fallback contract as SiteHeader. */
export function SiteFooter({ site, meta }) {
  const doc = chromeDoc(site.event, 'footer');
  if (!doc) return null;
  return <Render config={siteConfig} data={doc} metadata={meta} />;
}

/** Site-wide custom CSS (WordPress "Additional CSS" equivalent). CSS cannot
 * execute script; escaping `</` keeps it from closing the style tag. */
export function CustomCss({ event }) {
  const css = siteRoot(event).customCss;
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: String(css).replace(/<\//g, '<\\/') }} />;
}

const TYPE_LABEL = { city: '城市探索', hiking: '登山步道', shopping: '購物中心' };
const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };

const WRAP = { maxWidth: '1140px', width: '100%', margin: '0 auto', padding: '0 clamp(16px, 4vw, 26px)' };

export default function EventSite({ site, linkBase }) {
  const { branding, event, tasks, other_events: others } = site;
  const p = brandPalette(branding.theme_color || '#0E7490') || {};
  // '' on a customer domain (white-label /{slug}), /e/{tenant} on the platform.
  const base = linkBase ?? `/e/${branding.tenant_slug}`;
  // Mobile opens straight into LINE; desktop shows a QR modal (JoinCta).
  const joinHref = siteJoinHref(site);
  const hero = event.config?.heroImage;
  const theme = themeStyles(siteTheme(event), siteRoot(event).themeCustom);
  // v2 (unified designer): stats/tasks are smart BLOCKS inside the document,
  // the admin decides where they appear. v1/legacy keeps the structural
  // sections so old sites don't change until re-published.
  const v2 = (event.config?.puckVersion || 0) >= 2;
  const heroOverlay = theme.hero?.overlay || 'linear-gradient(rgba(11,41,53,.55), rgba(11,41,53,.66))';
  const eventHref = `${base}/${event.slug}`;
  const nav = siteNav(event, eventHref);
  const hideHero = v2 && siteRoot(event).hideHero === 'hide';
  // An admin-designed 頁首／頁尾 replaces the built-in chrome site-wide.
  const meta = chromeMeta(site, { nav, eventHref, joinHref });
  const customHeader = chromeDoc(event, 'header');
  const customFooter = chromeDoc(event, 'footer');

  const navLinks = nav.map((it) => it.external
    ? <a key={it.href} href={it.href} target="_blank" rel="noreferrer" style={{padding:'6px 12px', borderRadius:'9999px', color:'rgba(255,255,255,.92)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none', background:'rgba(255,255,255,.1)'}}>{it.label}</a>
    : <Link key={it.href} href={it.href} style={{padding:'6px 12px', borderRadius:'9999px', color:'rgba(255,255,255,.92)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none', background:'rgba(255,255,255,.1)'}}>{it.label}</Link>);

  return (
<div className="page-full" style={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, '--brand-hero-a': p.heroA, '--brand-hero-b': p.heroB, background: 'var(--surface-app)', display:'flex', flexDirection:'column', ...theme.vars, ...theme.page }}>
  <CustomCss event={event} />

  {/* Admin-designed 頁首 — sits above the hero, or replaces the slim header. */}
  <SiteHeader site={site} meta={meta} />

  {/* Slim header is pure chrome, so a custom 頁首 replaces it outright; the
      hero also carries content (title/CTA) and stays either way. */}
  {hideHero && customHeader ? null : hideHero ? (
  /* ── Slim header (預設 Hero hidden — admin builds their own Banner) ── */
  <div style={{background: `linear-gradient(135deg, ${p.heroA}, ${p.heroB})`, color:'#fff'}}>
    <div style={{...WRAP, display:'flex', alignItems:'center', gap:'10px', paddingTop:'14px', paddingBottom:'14px', flexWrap:'wrap'}}>
      {branding.logo_url
        ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'30px', height:'30px', borderRadius:'8px', objectFit:'cover', background:'#fff'}} />
        : <span style={{width:'28px', height:'28px', borderRadius:'7px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'15px'}}><Icon name="scan-line" /></span>}
      <span style={{fontSize:'14px', fontWeight:'700'}}>{event.name}</span>
      {nav.length > 0 && <nav style={{display:'flex', alignItems:'center', gap:'4px', marginLeft:'10px', flexWrap:'wrap'}}>{navLinks}</nav>}
      <div style={{marginLeft:'auto'}}>
        <JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />
      </div>
    </div>
  </div>
  ) : (
  /* ── Hero (full-bleed) ────────────────────────────────────────────── */
  <div style={{position:'relative', minHeight:'clamp(400px, 56vh, 580px)', background: hero ? `${heroOverlay}, url(${hero}) center/cover` : `linear-gradient(150deg, ${p.heroA}, ${p.heroB})`, color:'#fff', display:'flex', flexDirection:'column'}}>
    <div style={{position:'absolute', inset:'0', background:'radial-gradient(circle at 80% 15%, rgba(255,255,255,.12), transparent 50%)'}}></div>

    {/* Header row */}
    <div style={{...WRAP, position:'relative', display:'flex', alignItems:'center', gap:'10px', paddingTop:'18px', paddingBottom:'18px'}}>
      {branding.logo_url
        ? <img src={branding.logo_url} alt={branding.tenant_name} style={{width:'32px', height:'32px', borderRadius:'9px', objectFit:'cover', background:'#fff'}} />
        : <span style={{width:'30px', height:'30px', borderRadius:'8px', background:'rgba(255,255,255,.16)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'16px'}}><Icon name="scan-line" /></span>}
      <span style={{fontSize:'14px', fontWeight:'700'}}>{branding.tenant_name}</span>
      {/* Site nav — skipped when the admin's own 頁首 already shows it */}
      {nav.length > 0 && !customHeader && (
        <nav style={{display:'flex', alignItems:'center', gap:'4px', marginLeft:'14px', flexWrap:'wrap'}}>{navLinks}</nav>
      )}
      <span style={{marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'11px', fontWeight:'600', background:'rgba(255,255,255,.14)', padding:'6px 11px', borderRadius:'9999px', backdropFilter:'blur(4px)'}}><span style={{width:'7px', height:'7px', borderRadius:'50%', background:'#28C840'}}></span>進行中</span>
    </div>

    {/* Hero copy */}
    <div style={{...WRAP, position:'relative', marginTop:'auto', paddingBottom:'clamp(30px, 6vh, 54px)'}}>
      <div style={{fontSize:'12.5px', fontWeight:'700', letterSpacing:'.12em', textTransform:'uppercase', color:p.light, marginBottom:'10px'}}>{TYPE_LABEL[event.event_type] || '互動體驗'} · WebAR 集章</div>
      <h1 style={{margin:0, fontSize:'clamp(30px, 5.5vw, 52px)', fontWeight:'var(--site-heading-weight, 800)', lineHeight:1.08, letterSpacing:'-.02em', color:'#fff', maxWidth:'20ch'}}>{event.name}</h1>
      {event.description && <p style={{margin:'14px 0 0', fontSize:'clamp(14px, 1.6vw, 16.5px)', color:'rgba(255,255,255,.85)', lineHeight:1.65, maxWidth:'62ch'}}>{event.description}</p>}
      <div style={{display:'flex', gap:'10px', marginTop:'24px', flexWrap:'wrap'}}>
        <JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />
        <JoinCta href={joinHref} label="查看地圖" variant="ghost" />
      </div>
    </div>
  </div>
  )}

  {/* ── Stats band (v1 structural only — v2 has the StatsBand block) ──── */}
  {!v2 && (
  <div style={{...WRAP, position:'relative', zIndex:2, marginTop:'-30px'}}>
    <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'14px'}}>
      <div style={{background:'#fff', borderRadius:'14px', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px'}}>
        <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="map-pin" /></span>
        <div><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.1}}>{tasks.length}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>任務停靠點</div></div>
      </div>
      <div style={{background:'#fff', borderRadius:'14px', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px'}}>
        <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="award" /></span>
        <div><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.1}}>{event.reward_threshold}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>集章門檻</div></div>
      </div>
      <div style={{background:'#fff', borderRadius:'14px', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px', minWidth:0}}>
        <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="gift" /></span>
        <div style={{minWidth:0}}><div style={{fontSize:'17px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.25, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{event.reward_name || '—'}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>獎勵</div></div>
      </div>
    </div>
  </div>
  )}

  {/* ── Body ─────────────────────────────────────────────────────────── */}
  <div style={{...WRAP, flex:'1', paddingTop:'30px', paddingBottom:'40px'}}>

    {/* v1 structural task stops — v2 has the TaskStops block */}
    {!v2 && tasks.length > 0 && (<>
      <h2 style={{margin:'0 0 14px', fontSize:'clamp(18px, 2.2vw, 22px)', fontWeight:'800', color:'var(--text-strong)'}}>任務停靠點</h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'12px', marginBottom:'30px'}}>
        {tasks.map((t, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:'13px', padding:'15px', borderRadius:'13px', border:'1px solid var(--border-subtle)', background:'#fff', boxShadow:'var(--shadow-sm)'}}>
            <span style={{width:'44px', height:'44px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name={METHOD_ICON[t.verification_type] || 'map-pin'} /></span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:'700', fontSize:'14.5px', color:'var(--text-strong)'}}>{t.name}</div>
              <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{METHOD_LABEL[t.verification_type]}{t.radius_m ? ` · 範圍 ${t.radius_m}m` : ''}</div>
            </div>
            <span style={{fontSize:'16px', color:'var(--text-subtle)', display:'inline-flex', lineHeight:'0'}}><Icon name="chevron-right" /></span>
          </div>
        ))}
      </div>
    </>)}

    {/* Content: Puck document (drag-drop designer) wins over legacy sections.
        v2 passes live event data so the smart blocks render real numbers. */}
    {event.config?.puck?.content?.length > 0 ? (
      <div style={{marginBottom:'30px'}}>
        <Render config={siteConfig} data={event.config.puck} metadata={{ event, tasks }} />
      </div>
    ) : event.config?.sections?.filter((x) => !x.hidden).length > 0 && (<>
      <h2 style={{margin:'0 0 14px', fontSize:'clamp(18px, 2.2vw, 22px)', fontWeight:'800', color:'var(--text-strong)'}}>活動資訊</h2>
      <div style={{marginBottom:'30px'}}>
        <EventSections sections={event.config.sections} variant="light" />
      </div>
    </>)}

    {/* Bottom-of-page CTA */}
    <div style={{maxWidth:'560px', margin:'0 auto 20px'}}>
      <JoinCta href={joinHref} label="立即參加 — 免下載，LINE 直接玩" icon="play" variant="bar" />
    </div>

    {others?.length > 0 && (
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'12px', fontWeight:'700', color:'var(--text-subtle)', marginBottom:'9px'}}>此主辦方的其他活動</div>
        <div style={{display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center'}}>
          {others.map((o) => (
            <Link key={o.slug} href={`${base}/${o.slug}`} style={{padding:'8px 15px', borderRadius:'9999px', background:'#fff', border:'1px solid var(--border-subtle)', color:'var(--text-body)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none'}}>{o.name}</Link>
          ))}
        </div>
      </div>
    )}
  </div>

  {/* ── Footer — admin-designed 頁尾 wins over the built-in one ──────── */}
  {customFooter ? <SiteFooter site={site} meta={meta} /> : (
  <div style={{padding:'16px', textAlign:'center', borderTop:'1px solid var(--border-subtle)', fontSize:'11.5px', color:'var(--text-subtle)', background:'#fff'}}>
    © {branding.tenant_name}{branding.show_powered_by && <> · Powered by <span style={{fontWeight:'700'}}>Zoustec</span></>}
  </div>
  )}
</div>
  );
}
