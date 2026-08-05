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
import JoinCta from './JoinCta';
import { brandPalette } from '../../lib/brand';
import { chromeDoc, siteConfig } from '../../lib/site-blocks';
import SiteBody, { SiteCustomCss, siteView } from './SiteBody';

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

/** Site-wide custom CSS (WordPress "Additional CSS" equivalent). The escaping
 * lives in SiteBody so every surface applies it identically. */
export function CustomCss({ event }) {
  return <SiteCustomCss css={siteRoot(event).customCss} />;
}

const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };

/** Nav pills — shared shape with the previews, which pass inert copies. */
export function siteNavLinks(nav, currentSlug) {
  if (!nav?.length) return null;
  const pill = (active) => ({ padding: '6px 12px', borderRadius: '9999px', color: 'rgba(255,255,255,.92)', fontSize: '12.5px', fontWeight: '600', textDecoration: 'none', background: active ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.1)' });
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px', flexWrap: 'wrap' }}>
      {nav.map((it) => (it.external
        ? <a key={it.href} href={it.href} target="_blank" rel="noreferrer" style={pill(false)}>{it.label}</a>
        : <Link key={it.href} href={it.href} style={pill(it.slug && it.slug === currentSlug)}>{it.label}</Link>))}
    </nav>
  );
}

export default function EventSite({ site, linkBase }) {
  const { branding, event, tasks, other_events: others } = site;
  const p = brandPalette(branding.theme_color || '#0E7490') || {};
  // '' on a customer domain (white-label /{slug}), /e/{tenant} on the platform.
  const base = linkBase ?? `/e/${branding.tenant_slug}`;
  // Mobile opens straight into LINE; desktop shows a QR modal (JoinCta).
  const joinHref = siteJoinHref(site);
  const eventHref = `${base}/${event.slug}`;
  const nav = siteNav(event, eventHref);
  // Every visual decision (theme, hideHero, chrome, which content wins) comes
  // from here so the builder preview and designer canvas cannot disagree.
  const view = siteView(event);
  const { v2 } = view;
  // An admin-designed 頁首／頁尾 replaces the built-in chrome site-wide.
  const meta = chromeMeta(site, { nav, eventHref, joinHref });

  return (
<SiteBody
  className="page-full"
  event={event}
  tasks={tasks}
  branding={branding}
  view={view}
  metadata={meta}
  nav={siteNavLinks(nav)}
  heroCta={<>
    <JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />
    <JoinCta href={joinHref} label="查看地圖" variant="ghost" />
  </>}
  slimCta={<JoinCta href={joinHref} label="開始旅程" icon="qr-code" variant="primary" />}
  wrapperStyle={{ '--brand': p.brand, '--brand-dark': p.dark, '--brand-light': p.light, '--brand-hero-a': p.heroA, '--brand-hero-b': p.heroB, background: 'var(--surface-app)' }}
  beforeContent={!v2 && (<>
    {/* ── Stats band (v1 structural only — v2 has the StatsBand block) ── */}
    <div style={{position:'relative', zIndex:2, marginTop:'-60px', marginBottom:'30px'}}>
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'14px'}}>
        <div style={{background:'var(--site-card-bg, #fff)', borderRadius:'var(--site-radius, 14px)', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px'}}>
          <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="map-pin" /></span>
          <div><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.1}}>{tasks.length}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>任務停靠點</div></div>
        </div>
        <div style={{background:'var(--site-card-bg, #fff)', borderRadius:'var(--site-radius, 14px)', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px'}}>
          <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="award" /></span>
          <div><div style={{fontSize:'24px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.1}}>{event.reward_threshold}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>集章門檻</div></div>
        </div>
        <div style={{background:'var(--site-card-bg, #fff)', borderRadius:'var(--site-radius, 14px)', border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-md)', padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px', minWidth:0}}>
          <span style={{width:'42px', height:'42px', borderRadius:'11px', background:'var(--primary-50)', color:p.brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flex:'0 0 auto'}}><Icon name="gift" /></span>
          <div style={{minWidth:0}}><div style={{fontSize:'17px', fontWeight:'800', color:'var(--text-strong)', lineHeight:1.25, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{event.reward_name || '—'}</div><div style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'600'}}>獎勵</div></div>
        </div>
      </div>
    </div>

    {/* v1 structural task stops — v2 has the TaskStops block */}
    {tasks.length > 0 && (<>
      <h2 style={{margin:'0 0 14px', fontSize:'clamp(18px, 2.2vw, 22px)', fontWeight:'800', color:'var(--text-strong)'}}>任務停靠點</h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'12px', marginBottom:'30px'}}>
        {tasks.map((t, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:'13px', padding:'15px', borderRadius:'var(--site-radius, 13px)', border:'1px solid var(--border-subtle)', background:'var(--site-card-bg, #fff)', boxShadow:'var(--shadow-sm)'}}>
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

    {/* Legacy sections keep their heading — the Puck path has none. */}
    {!view.hasBlocks && view.legacySections.length > 0 && (
      <h2 style={{margin:'0 0 14px', fontSize:'clamp(18px, 2.2vw, 22px)', fontWeight:'800', color:'var(--text-strong)'}}>活動資訊</h2>
    )}
  </>)}
  afterContent={<>
    {/* Bottom-of-page CTA */}
    <div style={{maxWidth:'560px', margin:'30px auto 20px'}}>
      <JoinCta href={joinHref} label="立即參加 — 免下載，LINE 直接玩" icon="play" variant="bar" />
    </div>

    {others?.length > 0 && (
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'12px', fontWeight:'700', color:'var(--text-subtle)', marginBottom:'9px'}}>此主辦方的其他活動</div>
        <div style={{display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center'}}>
          {others.map((o) => (
            <Link key={o.slug} href={`${base}/${o.slug}`} style={{padding:'8px 15px', borderRadius:'9999px', background:'var(--site-card-bg, #fff)', border:'1px solid var(--border-subtle)', color:'var(--text-body)', fontSize:'12.5px', fontWeight:'600', textDecoration:'none'}}>{o.name}</Link>
          ))}
        </div>
      </div>
    )}
  </>}
/>
  );
}
