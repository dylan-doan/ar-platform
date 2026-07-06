/**
 * Renders event.config.sections — the per-type website architecture
 * (spec §III.2). Two variants: 'dark' (experience hero pages) and
 * 'light' (builder canvas preview).
 */

import { Icon } from '../Icon';

const V = {
  dark: {
    card: { background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' },
    warnCard: { background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)' },
    title: '#fff', body: '#B6D4DE', accent: '#6FCDE8', warn: '#FCD34D',
  },
  light: {
    card: { background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' },
    warnCard: { background: 'var(--status-warning-bg)', border: '1px solid #FBBF24' },
    title: 'var(--text-strong)', body: 'var(--text-body)', accent: 'var(--brand)', warn: 'var(--status-warning-fg)',
  },
};

function Section({ s, v }) {
  const warn = s.type === 'notice' && s.style === 'warning';
  const box = { ...(warn ? v.warnCard : v.card), borderRadius: '14px', padding: '14px' };
  const titleColor = warn ? v.warn : v.title;

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, color: titleColor, marginBottom: s.title ? '9px' : 0 }}>
        {s.type === 'notice' && <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name={warn ? 'triangle-alert' : 'info'} /></span>}
        {s.type === 'places' && <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0, color: v.accent }}><Icon name="map-pin" /></span>}
        {s.type === 'info-list' && <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0, color: v.accent }}><Icon name="list" /></span>}
        {s.title}
      </div>

      {s.type === 'notice' && (
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {(s.items || []).map((it, i) => <li key={i} style={{ fontSize: '12.5px', lineHeight: 1.55, color: v.body }}>{it}</li>)}
        </ul>
      )}

      {s.type === 'info-list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {(s.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px' }}>
              <span style={{ color: v.body, fontWeight: 600 }}>{it.label}</span>
              <span style={{ color: titleColor, fontWeight: 700, textAlign: 'right' }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}

      {s.type === 'places' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {(s.items || []).map((it, i) => (
            <div key={i} style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
              <span style={{ color: titleColor, fontWeight: 700 }}>{it.name}</span>
              {it.description && <span style={{ color: v.body }}> — {it.description}</span>}
            </div>
          ))}
        </div>
      )}

      {s.type === 'text' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {(s.paragraphs || []).map((pg, i) => <p key={i} style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.6, color: v.body }}>{pg}</p>)}
        </div>
      )}
    </div>
  );
}

export default function EventSections({ sections, variant = 'dark' }) {
  const v = V[variant] || V.dark;
  const visible = (sections || []).filter((s) => !s.hidden);
  if (!visible.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {visible.map((s, i) => <Section key={s.key || i} s={s} v={v} />)}
    </div>
  );
}
