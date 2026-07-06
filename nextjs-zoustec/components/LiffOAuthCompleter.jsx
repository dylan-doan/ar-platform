'use client';

/**
 * Completes the LIFF web-login round-trip at the endpoint URL (site root).
 *
 * External-browser flow: liff.login(redirectUri) → LINE auth → LINE redirects
 * to the ENDPOINT URL with ?code=…&liffRedirectUri=… — NOT to redirectUri.
 * liff.init() must run HERE to exchange the code; the SDK then navigates to
 * the original redirectUri itself. Without this, the code dies on the portal
 * and no session is ever established.
 */

import { useEffect, useState } from 'react';

export default function LiffOAuthCompleter() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // LINE's web-login return carries `code` + `state` (newer SDKs omit
    // liffRedirectUri/liffClientId — do NOT require them).
    const returning = params.get('code') && params.get('state');
    if (!returning) return;
    setActive(true);
    (async () => {
      try {
        const { getLiff } = await import('../lib/liff-client');
        const liff = await getLiff(); // init exchanges the code
        const ok = Boolean(liff?.isLoggedIn?.());
        if (ok) {
          // Destination: our own record (stored before liff.login), else the
          // liff.state path LINE echoed, else liffRedirectUri. Same-origin only.
          const dest = sessionStorage.getItem('zx_post_login')
            || params.get('liff.state')
            || params.get('liffRedirectUri');
          sessionStorage.removeItem('zx_post_login');
          if (dest) {
            try {
              const u = new URL(dest, window.location.origin);
              if (u.origin === window.location.origin) {
                window.location.replace(u.pathname + u.search);
                return;
              }
            } catch { /* ignore bad dest */ }
          }
        }
        setActive(false);
      } catch (e) {
        setActive(false); // stay on the portal; user can retry from the login page
      }
    })();
  }, []);

  if (!active) return null;
  return (
    <div style={{position:'fixed', inset:0, zIndex:200, background:'rgba(11,41,53,.72)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{background:'#fff', borderRadius:'14px', padding:'18px 26px', fontSize:'14px', fontWeight:'700', color:'var(--text-strong)', boxShadow:'var(--shadow-xl)'}}>
        LINE 登入處理中…
      </div>
    </div>
  );
}
