export function fmt(n) {
  return Number(n ?? 0).toLocaleString('zh-TW');
}

export function fmtCompact(n) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString('zh-TW');
}

export function fmtPct(x) {
  return `${(Number(x ?? 0) * 100).toFixed(1)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
