'use client';

/** Applies the tenant's white-label theme color (spec §VIII) to the player
 *  pages by overriding the --brand CSS var. Tenant resolved from the URL
 *  (?tenant=) → stored session → platform default. Renders nothing. */

import { useEffect } from 'react';

export default function TenantBrand() {
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tenant =
          params.get('tenant') ||
          localStorage.getItem('zx_tenant') ||
          process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';
        const res = await fetch(`/api/public/tenants/${tenant}/branding`);
        if (!res.ok) return;
        const b = await res.json();
        if (b.theme_color) {
          const { applyBrand } = await import('../lib/brand');
          applyBrand(b.theme_color);
        }
      } catch { /* platform default stays */ }
    })();
  }, []);
  return null;
}
