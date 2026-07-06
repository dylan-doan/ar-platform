import { icons } from 'lucide-react';

export function Icon({ name, size = '1em', stroke = 1.75, style }) {
  const key = String(name).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const Cmp = icons[key] || icons.Circle;
  return (
    <Cmp
      width={size}
      height={size}
      strokeWidth={stroke}
      style={{ display: 'inline-flex', flex: '0 0 auto', ...style }}
    />
  );
}
