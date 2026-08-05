/**
 * THE event website body — the single renderer shared by all three surfaces
 * that draw the site:
 *
 *   1. the public page      (EventSite → /e/{tenant}/{event})
 *   2. the builder preview  (/admin/builder canvas)
 *   3. the designer canvas  (/admin/builder/design, via puck-editor-config)
 *
 * They used to be three hand-written trees, so a change to one silently drifted
 * from the others (the default hero rendering on top of a Banner block when
 * hideHero was set, different body widths, custom CSS missing in the previews).
 * Anything visual about the site belongs HERE, not in a caller.
 *
 * `Render` is imported from '@measured/puck' — its package exports a
 * `react-server` condition, so the server build (public page) and the client
 * build (admin previews) both resolve automatically from this one import. Do
 * NOT change it to '@measured/puck/rsc': that pins the RSC build and breaks the
 * client-side admin previews.
 *
 * SHARED FILE — copied verbatim into the Next.js project export (see the note
 * in EventSite.jsx). Keep it host-agnostic and do not import platform-only
 * modules; anything added must also exist in export-template/.
 */

import { Render } from '@measured/puck';
import { Icon } from '../Icon';
import EventSections from './EventSections';
import { chromeDoc, siteConfig, themeStyles } from '../../lib/site-blocks';

/** Page gutter — one value, so the preview never disagrees with the site. */
export const WRAP = { maxWidth: '1140px', width: '100%', margin: '0 auto', padding: '0 clamp(16px, 4vw, 26px)' };

const TYPE_LABEL = { city: '城市探索', hiking: '登山步道', shopping: '購物中心' };
const DEFAULT_OVERLAY = 'linear-gradient(rgba(11,41,53,.55), rgba(11,41,53,.66))';

/** Everything the three surfaces need to agree on, derived from the event
 * record alone. Callers read this instead of re-deriving it (which is how the
 * hideHero bug appeared in the builder preview). */
export function siteView(event) {
  const cfg = event?.config || {};
  const root = cfg.puck?.root?.props || {};
  // v2 (unified designer): stats/tasks are smart BLOCKS inside the document.
  // v1/legacy keeps the structural sections so old sites don't change until
  // they are re-published.
  const v2 = (cfg.puckVersion || 0) >= 2;
  const theme = themeStyles(root.theme || 'default', root.themeCustom);
  return {
    cfg,
    root,
    v2,
    theme,
    // Only v2 documents can hide the hero — a v1 site has no Banner block to
    // replace it with, so honouring the flag would leave it headerless.
    hideHero: v2 && root.hideHero === 'hide',
    heroOverlay: theme.hero?.overlay || DEFAULT_OVERLAY,
    header: chromeDoc(event, 'header'),
    footer: chromeDoc(event, 'footer'),
    hasBlocks: (cfg.puck?.content?.length || 0) > 0,
    legacySections: (cfg.sections || []).filter((x) => !x.hidden),
    customCss: root.customCss || '',
  };
}

/** Site-wide custom CSS (WordPress "Additional CSS" equivalent). CSS cannot
 * execute script; escaping `</` keeps it from closing the style tag. */
export function SiteCustomCss({ css }) {
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: String(css).replace(/<\//g, '<\\/') }} />;
}

/** The default hero — full-bleed on the site, shorter in a preview pane.
 * `cta` is supplied by the caller because only the public site has a real
 * JoinCta (the previews render inert look-alikes). */
export function SiteHero({ view, event, branding, nav, compact, cta, statusLabel }) {
  const { heroOverlay, cfg } = view;
  const hero = cfg.heroImage;
  const scale = compact
    ? { minHeight: '250px', pad: '24px', title: '30px', label: '11.5px', desc: '13px', gap: '9px' }
    : { minHeight: 'clamp(400px, 56vh, 580px)', pad: null, title: 'clamp(30px, 5.5vw, 52px)', label: '12.5px', desc: 'clamp(14px, 1.6vw, 16.5px)', gap: '14px' };
  const inner = compact
    ? { position: 'relative', padding: scale.pad, marginTop: 'auto' }
    : { ...WRAP, position: 'relative', marginTop: 'auto', paddingBottom: 'clamp(30px, 6vh, 54px)' };

  return (
    <div style={{ position: 'relative', minHeight: scale.minHeight, background: hero ? `${heroOverlay}, url(${hero}) center/cover` : 'linear-gradient(150deg, var(--brand-hero-a, #0E7490), var(--brand-hero-b, #155E75))', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 15%, rgba(255,255,255,.12), transparent 50%)' }} />

      {/* Header row — skipped when the admin's own 頁首 already shows it */}
      <div style={{ ...(compact ? { padding: `16px ${scale.pad}` } : { ...WRAP, paddingTop: '18px', paddingBottom: '18px' }), position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name || ''} style={{ width: compact ? '26px' : '32px', height: compact ? '26px' : '32px', borderRadius: '9px', objectFit: 'cover', background: '#fff' }} />
          : <span style={{ width: compact ? '24px' : '30px', height: compact ? '24px' : '30px', borderRadius: '8px', background: 'rgba(255,255,255,.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? '13px' : '16px' }}><Icon name="scan-line" /></span>}
        <span style={{ fontSize: compact ? '12px' : '14px', fontWeight: 700 }}>{branding?.tenant_name || event?.slug || ''}</span>
        {nav}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,.14)', padding: '5px 11px', borderRadius: '9999px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#28C840' }} />{statusLabel}
        </span>
      </div>

      {/* Hero copy */}
      <div style={inner}>
        <div style={{ fontSize: scale.label, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.85)', marginBottom: '10px' }}>{TYPE_LABEL[event?.event_type] || '互動體驗'} · WebAR 集章</div>
        <h1 style={{ margin: 0, fontSize: scale.title, fontWeight: 'var(--site-heading-weight, 800)', lineHeight: 1.08, letterSpacing: '-.02em', color: '#fff', maxWidth: '20ch' }}>{event?.name || '（活動標題）'}</h1>
        {event?.description && <p style={{ margin: `${scale.gap} 0 0`, fontSize: scale.desc, color: 'rgba(255,255,255,.85)', lineHeight: 1.65, maxWidth: '62ch' }}>{event.description}</p>}
        {cta && <div style={{ display: 'flex', gap: '10px', marginTop: compact ? '16px' : '24px', flexWrap: 'wrap' }}>{cta}</div>}
      </div>
    </div>
  );
}

/** Slim header shown when the default hero is hidden and the admin has NOT
 * designed their own 頁首 — the site still needs a brand bar. */
export function SiteSlimHeader({ event, branding, nav, cta, compact }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, var(--brand-hero-a, #0E7490), var(--brand-hero-b, #155E75))', color: '#fff' }}>
      <div style={{ ...(compact ? { padding: '12px 20px' } : { ...WRAP, paddingTop: '14px', paddingBottom: '14px' }), display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.tenant_name || ''} style={{ width: '30px', height: '30px', borderRadius: '8px', objectFit: 'cover', background: '#fff' }} />
          : <span style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(255,255,255,.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}><Icon name="scan-line" /></span>}
        <span style={{ fontSize: compact ? '13px' : '14px', fontWeight: 700 }}>{event?.name || '（活動標題）'}</span>
        {nav}
        {cta && <div style={{ marginLeft: 'auto' }}>{cta}</div>}
      </div>
    </div>
  );
}

/** The page body: the Puck document, or the legacy sections, or a hint that
 * there is nothing to show yet. */
export function SiteContent({ view, metadata, emptyHint }) {
  const { hasBlocks, cfg, legacySections } = view;
  if (hasBlocks) return <Render config={siteConfig} data={cfg.puck} metadata={metadata} />;
  if (legacySections.length > 0) return <EventSections sections={cfg.sections} variant="light" />;
  return emptyHint || null;
}

/** Built-in footer — used when the admin has not designed their own 頁尾. */
export function SiteDefaultFooter({ branding }) {
  return (
    <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border-subtle)', fontSize: '11.5px', color: 'var(--text-subtle)', background: 'var(--site-card-bg, #fff)' }}>
      © {branding?.tenant_name || ''}{branding?.show_powered_by && <> · Powered by <span style={{ fontWeight: 700 }}>Zoustec</span></>}
    </div>
  );
}

/**
 * The whole site page, assembled. This is what every surface renders.
 *
 * Props the callers vary:
 *   compact     preview pane sizing (builder) vs full-bleed (public site)
 *   nav / cta   real links+JoinCta on the site, inert look-alikes in previews
 *   header/footer  rendered from the chrome documents via `view`
 *   children    extra structural content (v1 stats/task stops on the site)
 */
export default function SiteBody({
  event, tasks, branding, view, metadata, compact,
  nav, heroCta, slimCta, statusLabel = '進行中',
  beforeContent, afterContent, emptyHint, wrapperStyle, className,
}) {
  const v = view || siteView(event);
  const { theme, hideHero, header, footer, customCss } = v;
  const bodyWrap = compact
    ? { padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }
    : { ...WRAP, flex: '1', paddingTop: '30px', paddingBottom: '40px' };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', ...theme.vars, ...theme.page, ...wrapperStyle }}>
      <SiteCustomCss css={customCss} />

      {/* Admin-designed 頁首 — sits above the hero, or replaces the slim bar. */}
      {header && <Render config={siteConfig} data={header} metadata={metadata} />}

      {/* The slim bar is pure chrome, so a custom 頁首 replaces it outright; the
          hero also carries content (title/CTA) and stays either way. */}
      {hideHero
        ? (header ? null : <SiteSlimHeader event={event} branding={branding} nav={nav} cta={slimCta} compact={compact} />)
        : <SiteHero view={v} event={event} branding={branding} nav={header ? null : nav} compact={compact} cta={heroCta} statusLabel={statusLabel} />}

      <div style={bodyWrap}>
        {beforeContent}
        <SiteContent view={v} metadata={metadata} emptyHint={emptyHint} />
        {afterContent}
      </div>

      {footer
        ? <Render config={siteConfig} data={footer} metadata={metadata} />
        : <SiteDefaultFooter branding={branding} />}
    </div>
  );
}
