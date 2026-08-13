/**
 * Puck block library for the event website (drag-drop builder).
 *
 * One shared config drives BOTH the editor (<Puck> in /admin/builder/design)
 * and the public site (<Render> from @measured/puck/rsc in EventSite). It is
 * deliberately free of 'use client' and hooks so the RSC renderer can import
 * it; the editor wraps it (puck-editor-config) to swap in interactive fields
 * (e.g. image upload).
 *
 * Styling matches the legacy EventSections "light" cards so migrated content
 * looks identical; colors come from brand CSS vars (multi-tenant theming).
 */

import { Icon } from '../components/Icon';

/* ── Theme registry ────────────────────────────────────────────────────
 * A theme is a data object (WordPress-style "theme", no code): design
 * tokens as CSS-var overrides + page styles + hero treatment + typography.
 * Blocks and the structural chrome (hero, stats, buttons, cards) all read
 * these tokens, so switching themes restyles the ENTIRE site while brand
 * colors (tenant palette) stay theirs. Being pure JSON, themes can later
 * move to the DB → per-tenant custom themes / marketplace.
 *
 * Token contract consumed by blocks & chrome:
 *   --site-radius        card corner radius
 *   --site-btn-radius    button corner radius
 *   --site-heading-weight heading font weight
 *   --surface-sunken / --border-subtle / --border-default   card skin
 *   --text-strong / --text-body / --text-subtle             typography
 *   --site-card-bg       solid card background (stats/tasks on home)
 * plus: page {background,color}, font (body+heading stack),
 * hero {overlay: css-gradient over hero image, tint: extra scrim color}
 */
export const THEMES = {
  default: {
    label: '清爽（預設）',
    swatch: ['#FFFFFF', '#EEF2F6', '#0E7490'],
    vars: { '--site-card-bg': '#fff' },
    page: {},
  },
  dark: {
    label: '深色',
    swatch: ['#0B2935', '#12384A', '#6FCDE8'],
    vars: {
      '--surface-sunken': 'rgba(255,255,255,.07)',
      '--border-subtle': 'rgba(255,255,255,.15)',
      '--border-default': 'rgba(255,255,255,.24)',
      '--text-strong': '#F3F6F8',
      '--text-body': '#C9D6DD',
      '--text-subtle': '#8FA6B0',
      '--status-warning-bg': 'rgba(245,158,11,.16)',
      '--site-card-bg': 'rgba(255,255,255,.06)',
    },
    page: { background: '#0B2935', color: '#C9D6DD' },
    hero: { overlay: 'linear-gradient(rgba(4,18,24,.55), rgba(4,18,24,.78))' },
  },
  warm: {
    label: '暖陽',
    swatch: ['#FFFBF4', '#FBF2E3', '#C2410C'],
    vars: {
      '--surface-sunken': '#FBF2E3',
      '--border-subtle': '#F0E0C5',
      '--border-default': '#E2CBA2',
      '--text-strong': '#43301A',
      '--text-body': '#6B5638',
      '--text-subtle': '#9C8767',
      '--site-card-bg': '#FFFDF8',
      '--site-radius': '16px',
    },
    page: { background: '#FFFBF4' },
    hero: { overlay: 'linear-gradient(rgba(67,32,10,.45), rgba(67,32,10,.62))' },
  },
  nature: {
    label: '森林',
    swatch: ['#F7FBF6', '#EEF6EC', '#166534'],
    vars: {
      '--surface-sunken': '#EEF6EC',
      '--border-subtle': '#DCEBD6',
      '--border-default': '#BDD8B2',
      '--text-strong': '#1E3A26',
      '--text-body': '#3F5C48',
      '--text-subtle': '#7C967F',
      '--site-card-bg': '#FDFFFC',
      '--site-radius': '18px',
      '--site-btn-radius': '14px',
    },
    page: { background: '#F7FBF6' },
    hero: { overlay: 'linear-gradient(rgba(13,36,20,.45), rgba(13,36,20,.66))' },
  },
  elegant: {
    label: '典雅（襯線體）',
    swatch: ['#FFFEFB', '#F1EEE7', '#2B2620'],
    vars: {
      '--surface-sunken': '#FAF9F7',
      '--border-subtle': '#E8E4DC',
      '--border-default': '#D4CDC0',
      '--text-strong': '#2B2620',
      '--text-body': '#575044',
      '--text-subtle': '#948B7B',
      '--site-card-bg': '#FFFFFE',
      '--site-radius': '4px',
      '--site-btn-radius': '4px',
      '--site-heading-weight': '600',
    },
    page: { background: '#FFFEFB' },
    font: "Georgia, 'Noto Serif TC', 'Times New Roman', serif",
    hero: { overlay: 'linear-gradient(rgba(24,20,14,.5), rgba(24,20,14,.68))' },
  },
  ocean: {
    label: '海洋',
    swatch: ['#F4FAFD', '#E3F2FA', '#0369A1'],
    vars: {
      '--surface-sunken': '#E9F4FA',
      '--border-subtle': '#D5E9F4',
      '--border-default': '#B1D6E8',
      '--text-strong': '#0C3B54',
      '--text-body': '#33607A',
      '--text-subtle': '#6E97AC',
      '--site-card-bg': '#FCFEFF',
      '--site-radius': '20px',
      '--site-btn-radius': '9999px',
    },
    page: { background: '#F4FAFD' },
    hero: { overlay: 'linear-gradient(rgba(4,36,54,.4), rgba(4,36,54,.62))' },
  },
  bold: {
    label: '活力',
    swatch: ['#FFFFFF', '#F4F4F5', '#18181B'],
    vars: {
      '--surface-sunken': '#F4F4F5',
      '--border-subtle': '#E4E4E7',
      '--border-default': '#111113',
      '--text-strong': '#111113',
      '--text-body': '#3F3F46',
      '--text-subtle': '#7B7B85',
      '--site-card-bg': '#fff',
      '--site-radius': '2px',
      '--site-btn-radius': '2px',
      '--site-heading-weight': '900',
    },
    page: { background: '#fff' },
    hero: { overlay: 'linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.7))' },
  },
};

/** zh-TW-safe system font stacks for the theme customizer. */
export const FONT_STACKS = {
  sans: { label: '黑體（預設）', stack: '' },
  serif: { label: '襯線體', stack: "Georgia, 'Noto Serif TC', 'Times New Roman', serif" },
  rounded: { label: '圓體', stack: "'Yuanti TC', 'Hiragino Maru Gothic ProN', 'PingFang TC', sans-serif" },
};

/** Seeds the customizer from a preset — "以此主題為起點" in the editor. */
export function presetToCustom(key) {
  const t = THEMES[key] || THEMES.default;
  const v = t.vars || {};
  return {
    pageBg: t.page?.background || '#ffffff',
    pageText: t.page?.color || '',
    cardBg: v['--surface-sunken'] || '',
    solidCardBg: v['--site-card-bg'] || '',
    cardBorder: v['--border-subtle'] || '',
    textStrong: v['--text-strong'] || '',
    textBody: v['--text-body'] || '',
    textSubtle: v['--text-subtle'] || '',
    radius: v['--site-radius'] || '14px',
    btnRadius: v['--site-btn-radius'] || '9999px',
    headingWeight: v['--site-heading-weight'] || '800',
    font: t.font ? 'serif' : 'sans',
    heroOverlay: '',
  };
}

/** theme='custom' + a themeCustom object beats the preset registry —
 * the WordPress-Customizer layer on top of ready-made themes. */
export function themeStyles(themeKey, custom) {
  if (themeKey === 'custom' && custom && Object.keys(custom).length) {
    const c = custom;
    const font = FONT_STACKS[c.font]?.stack || '';
    const vars = {};
    if (c.cardBg) vars['--surface-sunken'] = c.cardBg;
    if (c.solidCardBg) vars['--site-card-bg'] = c.solidCardBg;
    if (c.cardBorder) { vars['--border-subtle'] = c.cardBorder; vars['--border-default'] = c.cardBorder; }
    if (c.textStrong) vars['--text-strong'] = c.textStrong;
    if (c.textBody) vars['--text-body'] = c.textBody;
    if (c.textSubtle) vars['--text-subtle'] = c.textSubtle;
    if (c.radius) vars['--site-radius'] = c.radius;
    if (c.btnRadius) vars['--site-btn-radius'] = c.btnRadius;
    if (c.headingWeight) vars['--site-heading-weight'] = c.headingWeight;
    if (font) vars.fontFamily = font;
    const page = {};
    if (c.pageBg) page.background = c.pageBg;
    if (c.pageText) page.color = c.pageText;
    if (font) page.fontFamily = font;
    return { vars, page, hero: c.heroOverlay ? { overlay: `linear-gradient(${c.heroOverlay}, ${c.heroOverlay})` } : null };
  }
  const t = THEMES[themeKey] || THEMES.default;
  return {
    vars: { ...t.vars, ...(t.font ? { fontFamily: t.font } : {}) },
    page: { ...t.page, ...(t.font ? { fontFamily: t.font } : {}) },
    hero: t.hero || null,
  };
}

const card = { background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--site-radius, 14px)', padding: '14px' };
const warnCard = { background: 'var(--status-warning-bg, #FEF3C7)', border: '1px solid #FBBF24', borderRadius: 'var(--site-radius, 14px)', padding: '14px' };
const cardTitle = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '9px' };
const ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

/* ── Universal style controls (Elementor-style 樣式 tab) ───────────────
 * Every block gets a `style` object prop rendered as a wrapper <div>.
 * Field markers: `__color: true` / `__image: true` on a text field tell the
 * editor config to swap in a color picker / image-upload widget (the public
 * renderer never reads fields, so markers cost nothing at runtime). */

export function colorText(label) {
  return { type: 'text', label, __color: true };
}
export function imageText(label) {
  return { type: 'text', label, __image: true };
}

const STYLE_FIELD = {
  type: 'object',
  label: '樣式',
  objectFields: {
    align: { type: 'radio', label: '文字對齊', options: [{ label: '預設', value: '' }, { label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
    padding: { type: 'select', label: '內距', options: [{ label: '無', value: '' }, { label: '小', value: 's' }, { label: '中', value: 'm' }, { label: '大', value: 'l' }] },
    marginY: { type: 'select', label: '上下外距', options: [{ label: '無', value: '' }, { label: '小', value: 's' }, { label: '中', value: 'm' }, { label: '大', value: 'l' }] },
    background: { type: 'select', label: '背景', options: [{ label: '無', value: '' }, { label: '卡片色', value: 'card' }, { label: '品牌淡色', value: 'tint' }, { label: '自訂顏色', value: 'custom' }] },
    bgColor: colorText('自訂背景色'),
    textColor: colorText('文字顏色（留空＝主題預設）'),
    radius: { type: 'select', label: '圓角', options: [{ label: '主題預設', value: '' }, { label: '無', value: 'none' }, { label: '小', value: 's' }, { label: '大', value: 'l' }] },
    shadow: { type: 'select', label: '陰影', options: [{ label: '無', value: '' }, { label: '小', value: 's' }, { label: '中', value: 'm' }] },
    maxWidth: { type: 'select', label: '寬度', options: [{ label: '全寬', value: '' }, { label: '窄（720px）', value: 'narrow' }, { label: '更窄（560px）', value: 'tight' }] },
    className: { type: 'text', label: 'CSS class（搭配全站自訂 CSS）' },
  },
};

const PAD = { s: '12px', m: '20px', l: '32px' };
const MAR = { s: '8px', m: '20px', l: '36px' };
const RAD = { none: '0', s: '8px', l: '22px' };
const SHA = { s: 'var(--shadow-sm)', m: 'var(--shadow-lg)' };
const BGS = { card: 'var(--surface-sunken)', tint: 'var(--primary-50)' };

function boxStyle(s) {
  if (!s) return null;
  const out = {};
  if (s.align) out.textAlign = s.align;
  if (s.padding) out.padding = PAD[s.padding];
  if (s.marginY) { out.marginTop = MAR[s.marginY]; out.marginBottom = MAR[s.marginY]; }
  if (s.background === 'custom' && s.bgColor) out.background = s.bgColor;
  else if (BGS[s.background]) out.background = BGS[s.background];
  if (s.background) out.borderRadius = RAD[s.radius] ?? 'var(--site-radius, 14px)';
  if (s.radius) out.borderRadius = RAD[s.radius] ?? 'var(--site-radius, 14px)';
  if (s.textColor) out.color = s.textColor;
  if (s.shadow) out.boxShadow = SHA[s.shadow];
  if (s.maxWidth) { out.maxWidth = s.maxWidth === 'tight' ? '560px' : '720px'; out.marginLeft = 'auto'; out.marginRight = 'auto'; }
  return Object.keys(out).length ? out : null;
}

/** Adds the 樣式 tab + wrapper to a block config. The wrapper div only
 * appears in the DOM when styles are set, so existing documents render
 * byte-identical. */
function withStyle({ fields, defaultProps, render: R, ...rest }) {
  return {
    ...rest,
    fields: { ...fields, style: STYLE_FIELD },
    defaultProps: { ...defaultProps, style: {} },
    render: (props) => {
      const s = boxStyle(props.style);
      const cls = props.style?.className || undefined;
      if (!s && !cls) return <R {...props} />;
      return <div className={cls} style={s || undefined}><R {...props} /></div>;
    },
  };
}

/* ── Block renderers (plain presentational components) ────────────────── */

function HeadingBlock({ text, level, align }) {
  const Tag = level === 'h3' ? 'h3' : 'h2';
  const size = level === 'h3' ? 'clamp(15px, 1.8vw, 17px)' : 'clamp(18px, 2.2vw, 22px)';
  return <Tag style={{ margin: 0, fontSize: size, fontWeight: 'var(--site-heading-weight, 800)', color: 'var(--text-strong)', textAlign: align || 'left' }}>{text}</Tag>;
}

function ParagraphBlock({ text, align }) {
  const paras = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {paras.map((pg, i) => <p key={i} style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.7, color: 'var(--text-body)', textAlign: align || 'left' }}>{pg}</p>)}
    </div>
  );
}

function TextCardBlock({ title, text }) {
  const paras = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div style={card}>
      {title && <div style={cardTitle}><span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0, color: 'var(--brand)' }}><Icon name="type" /></span>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {paras.map((pg, i) => <p key={i} style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.6, color: 'var(--text-body)' }}>{pg}</p>)}
      </div>
    </div>
  );
}

function NoticeBlock({ title, tone, items }) {
  const warn = tone === 'warning';
  return (
    <div style={warn ? warnCard : card}>
      <div style={{ ...cardTitle, color: warn ? 'var(--status-warning-fg, #92400E)' : 'var(--text-strong)', marginBottom: title ? '9px' : 0 }}>
        <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name={warn ? 'triangle-alert' : 'info'} /></span>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {(items || []).map((it, i) => <li key={i} style={{ fontSize: '12.5px', lineHeight: 1.55, color: warn ? 'var(--status-warning-fg, #92400E)' : 'var(--text-body)' }}>{it.text}</li>)}
      </ul>
    </div>
  );
}

function InfoListBlock({ title, items }) {
  return (
    <div style={card}>
      {title && <div style={cardTitle}><span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0, color: 'var(--brand)' }}><Icon name="list" /></span>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {(items || []).map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px' }}>
            <span style={{ color: 'var(--text-body)', fontWeight: 600 }}>{it.label}</span>
            <span style={{ color: 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlacesBlock({ title, items }) {
  return (
    <div style={card}>
      {title && <div style={cardTitle}><span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0, color: 'var(--brand)' }}><Icon name="map-pin" /></span>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {(items || []).map((it, i) => (
          <div key={i} style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{it.name}</span>
            {it.description && <span style={{ color: 'var(--text-body)' }}> — {it.description}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageBlock({ url, alt, height, rounded }) {
  if (!url) {
    return <div style={{ ...card, textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12.5px', padding: '28px' }}>（尚未選擇圖片 — 右側面板上傳）</div>;
  }
  return <img src={url} alt={alt || ''} style={{ width: '100%', height: height === 'auto' ? 'auto' : height, objectFit: 'cover', borderRadius: rounded === 'none' ? 0 : '14px', display: 'block', border: '1px solid var(--border-subtle)' }} />;
}

function ButtonBlock({ label, href, variant, align, color }) {
  const solid = variant !== 'outline';
  const main = color || 'var(--brand, var(--primary-600))';
  return (
    <div style={{ display: 'flex', justifyContent: ALIGN[align] || 'flex-start' }}>
      <a href={href || '#'} style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: 'var(--site-btn-radius, 9999px)',
        background: solid ? main : 'transparent',
        color: solid ? '#fff' : main,
        border: solid ? 'none' : `1.5px solid ${main}`,
        fontSize: '14px', fontWeight: 700, textDecoration: 'none',
      }}>{label}</a>
    </div>
  );
}

function ColumnsBlock({ ratio, left: Left, right: Right }) {
  const [l, r] = ratio === '1-2' ? [1, 2] : ratio === '2-1' ? [2, 1] : [1, 1];
  // Stacks on narrow screens via auto-fit minmax; slots keep drop targets alive.
  const cell = (flex) => ({ flex: `${flex} 1 220px`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '40px' });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-start' }}>
      <Left style={cell(l)} />
      <Right style={cell(r)} />
    </div>
  );
}

/** Free-form banner/hero — the Elementor-style hero the admin fully owns
 * (usable anywhere, incl. sub-pages; pair with 隱藏預設 Hero to replace the
 * structural one entirely). */
function BannerBlock({ image, height, overlay, overlayColor, title, subtitle, align, ctaLabel, ctaHref }) {
  const H = { s: '200px', m: '320px', l: '460px', xl: '72vh' };
  const OV = {
    dark: 'linear-gradient(rgba(10,14,18,.45), rgba(10,14,18,.62))',
    light: 'linear-gradient(rgba(255,255,255,.55), rgba(255,255,255,.72))',
    brand: 'linear-gradient(150deg, var(--brand-hero-a, #0E7490), var(--brand-hero-b, #155E75))',
  };
  const ov = overlay === 'custom' && overlayColor ? `linear-gradient(${overlayColor}, ${overlayColor})` : OV[overlay];
  const bg = [ov, image ? `url(${image}) center/cover` : null].filter(Boolean).join(', ');
  const center = align === 'center';
  const light = overlay === 'light';
  return (
    <div style={{ position: 'relative', minHeight: H[height] || H.m, borderRadius: 'var(--site-radius, 14px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: center ? 'center' : 'flex-start', textAlign: center ? 'center' : 'left', padding: 'clamp(20px, 4vw, 40px)', background: bg || OV.brand, color: light ? 'var(--text-strong, #16323E)' : '#fff' }}>
      {title && <div style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 'var(--site-heading-weight, 800)', lineHeight: 1.12, letterSpacing: '-.02em', maxWidth: '22ch' }}>{title}</div>}
      {subtitle && <div style={{ marginTop: '10px', fontSize: 'clamp(13px, 1.6vw, 16px)', lineHeight: 1.6, maxWidth: '58ch', opacity: .92 }}>{subtitle}</div>}
      {ctaLabel && (
        <a href={ctaHref || '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '18px', padding: '12px 26px', borderRadius: 'var(--site-btn-radius, 9999px)', background: light ? 'var(--brand, var(--primary-600))' : '#fff', color: light ? '#fff' : 'var(--brand-dark, #134E61)', fontSize: '14px', fontWeight: 800, textDecoration: 'none' }}>{ctaLabel}</a>
      )}
    </div>
  );
}

/* ── Smart blocks — bound to LIVE event data via Puck metadata ─────────
 * The editor and the public renderer both pass metadata={{event, tasks}},
 * so these blocks always show the real numbers/tasks and the admin decides
 * WHERE (or whether) they appear. */

const METHOD_ICON = { qr: 'qr-code', gps: 'map-pin', hybrid: 'scan-line' };
const METHOD_LABEL = { qr: 'QR + AR', gps: 'GPS + AR', hybrid: '混合驗證' };

const solidCard = { background: 'var(--site-card-bg, #fff)', borderRadius: 'var(--site-radius, 14px)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' };

function StatsBandBlock({ puck }) {
  const ev = puck?.metadata?.event || {};
  const tasks = puck?.metadata?.tasks || [];
  // data-zs: live-data markers — the static-site bundle's js/main.js refreshes
  // these from the public API at runtime (inert on the platform-rendered site).
  const cell = (icon, big, small, zs) => (
    <div style={{ ...solidCard, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '13px', flex: '1 1 160px', minWidth: 0 }}>
      <span style={{ width: '40px', height: '40px', borderRadius: 'var(--site-radius, 11px)', background: 'var(--surface-sunken)', color: 'var(--brand, var(--primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flex: '0 0 auto' }}><Icon name={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div data-zs={zs} style={{ fontSize: '21px', fontWeight: 'var(--site-heading-weight, 800)', color: 'var(--text-strong)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{big}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: 600 }}>{small}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: '13px', flexWrap: 'wrap' }}>
      {cell('map-pin', tasks.length, '任務停靠點', 'stat-tasks')}
      {cell('award', ev.reward_threshold ?? '—', '集章門檻', 'stat-threshold')}
      {cell('gift', ev.reward_name || '—', '獎勵', 'stat-reward')}
    </div>
  );
}

function TaskStopsBlock({ title, puck }) {
  const tasks = puck?.metadata?.tasks || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
      {title && <HeadingBlock text={title} level="h2" align="left" />}
      {tasks.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12.5px', padding: '22px' }}>（尚無任務 — 於網站產生器左側新增）</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {tasks.map((t, i) => (
          <div key={i} style={{ ...solidCard, display: 'flex', alignItems: 'center', gap: '13px', padding: '14px' }}>
            <span style={{ width: '42px', height: '42px', borderRadius: 'var(--site-radius, 11px)', background: 'var(--surface-sunken)', color: 'var(--brand, var(--primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flex: '0 0 auto' }}><Icon name={METHOD_ICON[t.verification_type] || 'map-pin'} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div data-zs="task-name" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-strong)' }}>{t.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>{METHOD_LABEL[t.verification_type] || ''}{t.radius_m ? ` · 範圍 ${t.radius_m}m` : ''}</div>
            </div>
            <span style={{ fontSize: '15px', color: 'var(--text-subtle)', display: 'inline-flex', lineHeight: 0 }}><Icon name="chevron-right" /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpacerBlock({ size }) {
  const h = { s: 12, m: 28, l: 56 }[size] ?? 28;
  return <div style={{ height: `${h}px` }} />;
}

function DividerBlock() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />;
}

/* ── Site chrome blocks (頁首／頁尾) ───────────────────────────────────
 * Composed once in their own documents (event.config.header / .footer) and
 * rendered on EVERY page, so a change lands site-wide. They read the nav from
 * metadata (siteNav output) rather than recomputing it, keeping the menu
 * identical to the structural chrome they replace. */

/** Brand mark + menu bar. The menu comes from the site nav, so pages added in
 * the designer appear here with no extra wiring. */
function SiteHeaderBlock({ logo, title, sticky, background, bgColor, textColor, showJoin, joinLabel, puck }) {
  const m = puck?.metadata || {};
  const nav = m.nav || [];
  const home = m.eventHref || '#';
  const brand = title || m.event?.name || '';
  const img = logo || m.branding?.logo_url || '';
  const BG = {
    brand: 'linear-gradient(135deg, var(--brand-hero-a, #0E7490), var(--brand-hero-b, #155E75))',
    dark: '#16323E',
    light: 'var(--site-card-bg, #fff)',
  };
  const bg = background === 'custom' && bgColor ? bgColor : (BG[background] || BG.brand);
  const fg = textColor || (background === 'light' ? 'var(--text-strong, #16323E)' : '#fff');
  const pill = background === 'light' ? 'var(--surface-sunken)' : 'rgba(255,255,255,.12)';
  return (
    <div style={{ background: bg, color: fg, ...(sticky === 'sticky' ? { position: 'sticky', top: 0, zIndex: 30 } : null), borderBottom: background === 'light' ? '1px solid var(--border-subtle)' : 'none' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '12px clamp(16px, 4vw, 26px)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <a href={home} style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'inherit', textDecoration: 'none' }}>
          {img
            ? <img src={img} alt={brand} style={{ width: '30px', height: '30px', borderRadius: '8px', objectFit: 'cover', background: '#fff' }} />
            : <span style={{ width: '28px', height: '28px', borderRadius: '7px', background: pill, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}><Icon name="scan-line" /></span>}
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{brand}</span>
        </a>
        {nav.length > 0 && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
            {nav.map((it) => (
              <a key={it.href} href={it.href} {...(it.external ? { target: '_blank', rel: 'noreferrer' } : null)}
                style={{ padding: '6px 12px', borderRadius: '9999px', color: 'inherit', fontSize: '12.5px', fontWeight: 600, textDecoration: 'none', background: it.slug && it.slug === m.currentSlug ? 'rgba(255,255,255,.22)' : pill }}>{it.label}</a>
            ))}
          </nav>
        )}
        {showJoin !== 'hide' && m.joinHref && (
          <a href={m.joinHref} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: 'var(--site-btn-radius, 9999px)', background: background === 'light' ? 'var(--brand, var(--primary-600))' : '#fff', color: background === 'light' ? '#fff' : 'var(--brand-dark, #134E61)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
            <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="qr-code" /></span>{joinLabel || '開始旅程'}
          </a>
        )}
      </div>
    </div>
  );
}

/** Multi-column footer + copyright line. `links` are free-form so the admin
 * can point at sub-pages (relative) or anything external. */
function SiteFooterBlock({ about, columns, copyright, background, bgColor, textColor, showNav, puck }) {
  const m = puck?.metadata || {};
  const cols = (columns || []).filter((c) => c?.title || (c?.links || []).length);
  const BG = { dark: '#16323E', light: 'var(--site-card-bg, #fff)', tint: 'var(--surface-sunken)' };
  const bg = background === 'custom' && bgColor ? bgColor : (BG[background] || BG.light);
  const dark = background === 'dark' || (background === 'custom' && !textColor);
  const fg = textColor || (dark ? 'rgba(255,255,255,.82)' : 'var(--text-body)');
  const strong = dark ? '#fff' : 'var(--text-strong)';
  const linkStyle = { color: fg, fontSize: '12.5px', textDecoration: 'none', lineHeight: 2 };
  const nav = showNav === 'hide' ? [] : (m.nav || []);
  return (
    <div style={{ background: bg, color: fg, borderTop: dark ? 'none' : '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: 'clamp(24px, 4vw, 40px) clamp(16px, 4vw, 26px) 20px' }}>
        {(about || cols.length > 0 || nav.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '26px', marginBottom: '22px' }}>
            {about && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: strong, marginBottom: '9px' }}>{m.event?.name || ''}</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.7, maxWidth: '38ch' }}>{about}</div>
              </div>
            )}
            {nav.length > 0 && (
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: strong, marginBottom: '6px' }}>網站導覽</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {nav.map((it) => (
                    <a key={it.href} href={it.href} {...(it.external ? { target: '_blank', rel: 'noreferrer' } : null)} style={linkStyle}>{it.label}</a>
                  ))}
                </div>
              </div>
            )}
            {cols.map((c, i) => (
              <div key={i}>
                {c.title && <div style={{ fontSize: '12.5px', fontWeight: 800, color: strong, marginBottom: '6px' }}>{c.title}</div>}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(c.links || []).filter((l) => l?.label).map((l, j) => (
                    l.href
                      ? <a key={j} href={l.href} {...(/^https?:\/\//i.test(l.href) ? { target: '_blank', rel: 'noreferrer' } : null)} style={linkStyle}>{l.label}</a>
                      : <span key={j} style={{ ...linkStyle, opacity: .9 }}>{l.label}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ paddingTop: '14px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,.14)' : 'var(--border-subtle)'}`, fontSize: '11.5px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{copyright || `© ${m.branding?.tenant_name || ''}`}</span>
          {m.branding?.show_powered_by && <span style={{ marginLeft: 'auto' }}>Powered by <span style={{ fontWeight: 700 }}>Zoustec</span></span>}
        </div>
      </div>
    </div>
  );
}

/** The site-wide chrome documents (composed in the designer's 頁首／頁尾
 * tabs). Empty/absent means "keep the built-in chrome", so existing sites
 * are untouched until an admin actually designs one. */
export function chromeDoc(event, which) {
  const doc = event?.config?.[which];
  return doc?.content?.length ? doc : null;
}

/* ── Shared Puck config (editor + RSC render) ─────────────────────────── */

export const siteConfig = {
  categories: {
    live: { title: '活動資料（自動同步）', components: ['StatsBand', 'TaskStops'] },
    content: { title: '內容', components: ['Heading', 'Paragraph', 'TextCard', 'Notice', 'InfoList', 'Places', 'HtmlBlock'] },
    media: { title: '媒體與按鈕', components: ['Banner', 'Image', 'Button'] },
    layout: { title: '版面', components: ['Columns', 'Spacer', 'Divider'] },
    chrome: { title: '頁首／頁尾（全站共用）', components: ['SiteHeader', 'SiteFooter'] },
  },
  components: {
    SiteHeader: {
      label: '頁首 Header（全站共用）',
      fields: {
        logo: imageText('Logo（留空＝用品牌設定的 Logo）'),
        title: { type: 'text', label: '標題文字（留空＝活動名稱）' },
        background: { type: 'select', label: '背景', options: [{ label: '品牌漸層', value: 'brand' }, { label: '深色', value: 'dark' }, { label: '淺色', value: 'light' }, { label: '自訂顏色', value: 'custom' }] },
        bgColor: colorText('自訂背景色'),
        textColor: colorText('文字顏色（留空＝自動）'),
        sticky: { type: 'radio', label: '捲動時固定', options: [{ label: '否', value: '' }, { label: '固定於頂端', value: 'sticky' }] },
        showJoin: { type: 'radio', label: '參加按鈕', options: [{ label: '顯示', value: '' }, { label: '隱藏', value: 'hide' }] },
        joinLabel: { type: 'text', label: '參加按鈕文字' },
      },
      defaultProps: { logo: '', title: '', background: 'brand', bgColor: '', textColor: '', sticky: '', showJoin: '', joinLabel: '開始旅程' },
      render: SiteHeaderBlock,
    },
    SiteFooter: {
      label: '頁尾 Footer（全站共用）',
      fields: {
        about: { type: 'textarea', label: '簡介文字（留空隱藏）' },
        showNav: { type: 'radio', label: '網站導覽欄', options: [{ label: '顯示', value: '' }, { label: '隱藏', value: 'hide' }] },
        columns: {
          type: 'array', label: '欄位（例：聯絡資訊／社群）',
          arrayFields: {
            title: { type: 'text', label: '欄位標題' },
            links: {
              type: 'array', label: '項目',
              arrayFields: { label: { type: 'text', label: '文字' }, href: { type: 'text', label: '連結（留空＝純文字）' } },
              getItemSummary: (it) => it?.label || '項目',
            },
          },
          getItemSummary: (it) => it?.title || '欄位',
        },
        copyright: { type: 'text', label: '版權文字（留空＝© 主辦方名稱）' },
        background: { type: 'select', label: '背景', options: [{ label: '淺色', value: 'light' }, { label: '深色', value: 'dark' }, { label: '卡片色', value: 'tint' }, { label: '自訂顏色', value: 'custom' }] },
        bgColor: colorText('自訂背景色'),
        textColor: colorText('文字顏色（留空＝自動）'),
      },
      defaultProps: { about: '', showNav: '', columns: [], copyright: '', background: 'light', bgColor: '', textColor: '' },
      render: SiteFooterBlock,
    },
    StatsBand: withStyle({
      label: '數據看板（任務／門檻／獎勵）',
      fields: {},
      defaultProps: {},
      render: StatsBandBlock,
    }),
    TaskStops: withStyle({
      label: '任務停靠點（自動同步）',
      fields: { title: { type: 'text', label: '標題（留空隱藏）' } },
      defaultProps: { title: '任務停靠點' },
      render: TaskStopsBlock,
    }),
    Banner: withStyle({
      label: '橫幅 Banner',
      fields: {
        image: imageText('背景圖'),
        height: { type: 'select', label: '高度', options: [{ label: '小（200px）', value: 's' }, { label: '中（320px）', value: 'm' }, { label: '大（460px）', value: 'l' }, { label: '滿版（72vh）', value: 'xl' }] },
        overlay: { type: 'select', label: '遮罩', options: [{ label: '深色', value: 'dark' }, { label: '淺色', value: 'light' }, { label: '品牌漸層', value: 'brand' }, { label: '自訂顏色', value: 'custom' }, { label: '無', value: 'none' }] },
        overlayColor: colorText('自訂遮罩色（含透明度建議 rgba）'),
        title: { type: 'text', label: '主標題' },
        subtitle: { type: 'textarea', label: '副標題' },
        align: { type: 'radio', label: '對齊', options: [{ label: '靠左', value: 'left' }, { label: '置中', value: 'center' }] },
        ctaLabel: { type: 'text', label: '按鈕文字（留空隱藏）' },
        ctaHref: { type: 'text', label: '按鈕連結' },
      },
      defaultProps: { image: '', height: 'm', overlay: 'dark', overlayColor: '', title: '橫幅標題', subtitle: '', align: 'left', ctaLabel: '', ctaHref: '' },
      render: BannerBlock,
    }),
    Heading: withStyle({
      label: '標題',
      fields: {
        text: { type: 'text', label: '文字' },
        level: { type: 'radio', label: '大小', options: [{ label: '大', value: 'h2' }, { label: '中', value: 'h3' }] },
        align: { type: 'radio', label: '對齊', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      },
      defaultProps: { text: '區塊標題', level: 'h2', align: 'left' },
      render: HeadingBlock,
    }),
    Paragraph: withStyle({
      label: '段落文字',
      fields: {
        text: { type: 'textarea', label: '內容（一行一段）' },
        align: { type: 'radio', label: '對齊', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      },
      defaultProps: { text: '在此輸入段落內容。', align: 'left' },
      render: ParagraphBlock,
    }),
    HtmlBlock: withStyle({
      label: '自訂 HTML',
      fields: {
        html: { type: 'textarea', label: 'HTML 內容（僅限安全標籤 — script／事件屬性會在儲存時移除）' },
      },
      defaultProps: { html: '' },
      // Content is sanitized SERVER-SIDE (nh3, services/site_html.py) on every
      // save/upload path before it reaches the DB — what renders here is
      // already clean. This block is how user-authored HTML from the HTML
      // round-trip survives inside a structured design.
      render: ({ html }) => <div className="z-custom-html" dangerouslySetInnerHTML={{ __html: html || '' }} />,
    }),
    TextCard: withStyle({
      label: '文字卡片',
      fields: {
        title: { type: 'text', label: '卡片標題' },
        text: { type: 'textarea', label: '內容（一行一段）' },
      },
      defaultProps: { title: '文化小知識', text: '在此撰寫給旅客的故事與背景。' },
      render: TextCardBlock,
    }),
    Notice: withStyle({
      label: '提醒事項',
      fields: {
        title: { type: 'text', label: '標題' },
        tone: { type: 'radio', label: '樣式', options: [{ label: '一般', value: 'info' }, { label: '警告', value: 'warning' }] },
        items: { type: 'array', label: '項目', arrayFields: { text: { type: 'text', label: '內容' } }, getItemSummary: (it) => it?.text || '項目' },
      },
      defaultProps: { title: '注意事項', tone: 'info', items: [{ text: '第一則提醒' }] },
      render: NoticeBlock,
    }),
    InfoList: withStyle({
      label: '資訊列表',
      fields: {
        title: { type: 'text', label: '標題' },
        items: { type: 'array', label: '項目', arrayFields: { label: { type: 'text', label: '標籤' }, value: { type: 'text', label: '內容' } }, getItemSummary: (it) => it?.label || '項目' },
      },
      defaultProps: { title: '路線資訊', items: [{ label: '距離', value: '1.5 km' }] },
      render: InfoListBlock,
    }),
    Places: withStyle({
      label: '地點清單',
      fields: {
        title: { type: 'text', label: '標題' },
        items: { type: 'array', label: '地點', arrayFields: { name: { type: 'text', label: '名稱' }, description: { type: 'text', label: '說明' } }, getItemSummary: (it) => it?.name || '地點' },
      },
      defaultProps: { title: '景點導覽', items: [{ name: '（範例）古蹟地標', description: '介紹活動收錄的景點。' }] },
      render: PlacesBlock,
    }),
    Image: withStyle({
      label: '圖片',
      fields: {
        url: imageText('圖片'),
        alt: { type: 'text', label: '替代文字' },
        height: { type: 'select', label: '高度', options: [{ label: '自動', value: 'auto' }, { label: '180px', value: '180px' }, { label: '260px', value: '260px' }, { label: '360px', value: '360px' }] },
        rounded: { type: 'radio', label: '圓角', options: [{ label: '有', value: 'rounded' }, { label: '無', value: 'none' }] },
      },
      defaultProps: { url: '', alt: '', height: 'auto', rounded: 'rounded' },
      render: ImageBlock,
    }),
    Button: withStyle({
      label: '按鈕',
      fields: {
        label: { type: 'text', label: '文字' },
        href: { type: 'text', label: '連結網址' },
        variant: { type: 'radio', label: '樣式', options: [{ label: '實心', value: 'solid' }, { label: '外框', value: 'outline' }] },
        align: { type: 'radio', label: '對齊', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
        color: colorText('自訂按鈕色（留空＝品牌色）'),
      },
      defaultProps: { label: '了解更多', href: '', variant: 'solid', align: 'left', color: '' },
      render: ButtonBlock,
    }),
    Columns: withStyle({
      label: '兩欄版面',
      fields: {
        ratio: { type: 'radio', label: '欄寬比例', options: [{ label: '1 : 1', value: '1-1' }, { label: '1 : 2', value: '1-2' }, { label: '2 : 1', value: '2-1' }] },
        left: { type: 'slot' },
        right: { type: 'slot' },
      },
      defaultProps: { ratio: '1-1', left: [], right: [] },
      render: ColumnsBlock,
    }),
    Spacer: {
      label: '間距',
      fields: { size: { type: 'radio', label: '大小', options: [{ label: '小', value: 's' }, { label: '中', value: 'm' }, { label: '大', value: 'l' }] } },
      defaultProps: { size: 'm' },
      render: SpacerBlock,
    },
    Divider: {
      label: '分隔線',
      fields: {},
      defaultProps: {},
      render: DividerBlock,
    },
  },
  root: {
    fields: {
      theme: { type: 'select', label: '佈景主題（套用整站）', options: Object.entries(THEMES).map(([value, t]) => ({ value, label: t.label })) },
    },
    defaultProps: { theme: 'default' },
    render: ({ children, theme, themeCustom }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...themeStyles(theme, themeCustom).vars }}>{children}</div>
    ),
  },
};

/* ── Migration: legacy config.sections → Puck data ────────────────────── */

/** The smart blocks every migrated/upgraded home page starts with — the
 * structural stats + task list the legacy layout always rendered. */
export function defaultLiveBlocks() {
  return [
    { type: 'StatsBand', props: { id: 'live-stats' } },
    { type: 'TaskStops', props: { id: 'live-tasks', title: '任務停靠點' } },
  ];
}

/** v1 Puck docs predate smart blocks (stats/tasks were structural chrome).
 * Prepend them once so upgrading to the v2 layout loses nothing. */
export function upgradePuckDoc(doc) {
  const content = doc?.content || [];
  const has = (t) => content.some((c) => c.type === t);
  const prepend = defaultLiveBlocks().filter((b) => !has(b.type));
  return { ...doc, content: [...prepend, ...content] };
}

/** Converts the old per-type sections (lib/event-sections.js) into a Puck
 * document so existing events open in the drag-drop editor with their
 * content intact. Hidden sections are dropped (the new editor deletes
 * instead of hiding). */
export function sectionsToPuckData(sections) {
  const content = (sections || []).filter((s) => !s.hidden).map((s, i) => {
    const id = `migrated-${s.type}-${i}`;
    if (s.type === 'notice') {
      return { type: 'Notice', props: { id, title: s.title || '', tone: s.style === 'warning' ? 'warning' : 'info', items: (s.items || []).map((t) => ({ text: t })) } };
    }
    if (s.type === 'info-list') {
      return { type: 'InfoList', props: { id, title: s.title || '', items: (s.items || []).map((it) => ({ label: it.label || '', value: it.value || '' })) } };
    }
    if (s.type === 'places') {
      return { type: 'Places', props: { id, title: s.title || '', items: (s.items || []).map((it) => ({ name: it.name || '', description: it.description || '' })) } };
    }
    // text (and any unknown legacy type with paragraphs)
    return { type: 'TextCard', props: { id, title: s.title || '', text: (s.paragraphs || []).join('\n') } };
  });
  return { root: { props: { theme: 'default' } }, content: [...defaultLiveBlocks(), ...content], zones: {} };
}
