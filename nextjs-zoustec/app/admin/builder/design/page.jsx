'use client';

/**
 * Drag-drop website designer (Puck) — full-screen, MULTIPAGE.
 *
 * The event website is a set of Puck documents: the home page lives in
 * event.config.puck (back-compat with the single-page rollout) and extra
 * pages in event.config.pages = [{slug, title, nav, data}]. The left rail
 * manages pages (add/rename/delete/nav toggle) and switches which document
 * the Puck canvas edits; 儲存並發佈 publishes the whole set in one PATCH.
 * The public site renders them at /e/{tenant}/{event}[/{page}] with an
 * auto-generated nav. The site-wide theme is the HOME document's root
 * 佈景主題 field.
 *
 * iframe preview is disabled so the canvas shares the admin document and
 * inherits brand CSS vars (applyBrand) without style-sync edge cases.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Puck, Render, createUsePuck } from '@measured/puck';
import '@measured/puck/puck.css';
import { Icon } from '../../../../components/Icon';
import { adminApi, adminSession, AuthRequired, loginUrl } from '../../../../lib/admin-client';
import { editorChromeConfig, editorConfig, editorSubPageConfig } from '../../../../lib/puck-editor-config';
import { sectionsToPuckData, siteConfig, THEMES, themeStyles, upgradePuckDoc } from '../../../../lib/site-blocks';
import { SITE_TEMPLATES, TEMPLATE_CATS, applyTemplate } from '../../../../lib/site-templates';
import { DEFAULT_SECTIONS } from '../../../../lib/event-sections';

const TENANT = process.env.NEXT_PUBLIC_TENANT_SLUG || 'taipei';
const usePuck = createUsePuck();
const HOME = '__home__';
// Site-wide chrome documents — edited like a page, rendered on every page.
const HEADER = '__header__';
const FOOTER = '__footer__';
const CHROME = { [HEADER]: 'header', [FOOTER]: 'footer' };

const EMPTY_DOC = { root: { props: { theme: 'default' } }, content: [], zones: {} };

/** A chrome document pre-filled with its block, so 頁首／頁尾 starts usable
 * instead of as an empty canvas the admin has to discover how to fill. */
function starterChrome(which) {
  const type = which === 'header' ? 'SiteHeader' : 'SiteFooter';
  const props = which === 'header'
    ? { id: 'site-header', logo: '', title: '', background: 'brand', bgColor: '', textColor: '', sticky: '', showJoin: '', joinLabel: '開始旅程' }
    : { id: 'site-footer', about: '', showNav: '', columns: [], copyright: '', background: 'light', bgColor: '', textColor: '' };
  return { root: { props: {} }, content: [{ type, props }], zones: {} };
}

// Sample data so template previews show believable smart blocks.
const PREVIEW_META = {
  event: { reward_threshold: 3, reward_name: '限定紀念禮' },
  tasks: [
    { name: '打卡點 A', verification_type: 'qr' },
    { name: '打卡點 B', verification_type: 'gps', radius_m: 100 },
  ],
};

/** Scaled-down live render of a template in any color scheme — the
 * theme+layout ARE the thumbnail, no hand-made images to maintain. */
function TplPreview({ tpl, theme, height = 160, scale = 0.31, width = 940 }) {
  const key = theme || tpl.theme;
  const t = themeStyles(key);
  const data = {
    root: { props: { theme: key } },
    content: JSON.parse(JSON.stringify(tpl.home)).map((b) => {
      if (b.type === 'Banner' && b.props.image === '__HERO__') b.props.image = '';
      return b;
    }),
    zones: {},
  };
  return (
    <div style={{ height: `${height}px`, overflow: 'hidden', borderRadius: '9px', border: '1px solid var(--border-subtle)', pointerEvents: 'none', background: '#fff', ...t.page }}>
      <div style={{ width: `${width}px`, transform: `scale(${scale})`, transformOrigin: 'top left', padding: '14px' }}>
        <Render config={siteConfig} data={data} metadata={PREVIEW_META} />
      </div>
    </div>
  );
}

/** ASCII slug from a page title; zh-TW titles fall back to page-N. */
function slugify(title, taken) {
  let s = String(title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!s) s = 'page';
  let out = s, n = 2;
  while (taken.has(out)) out = `${s}-${n++}`;
  return out;
}

function HeaderActions({ onSave, busy, flash, publicUrl, backUrl }) {
  const data = usePuck((s) => s.appState.data);
  const btn = { display: 'inline-flex', alignItems: 'center', gap: '7px', height: '36px', padding: '0 13px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' };
  return (
    <>
      {flash && <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--success-600, #16A34A)', alignSelf: 'center' }}>{flash}</span>}
      <a href={backUrl} style={{ ...btn, border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)' }}>
        <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="arrow-left" /></span>返回產生器
      </a>
      <a href={publicUrl} target="_blank" rel="noreferrer" style={{ ...btn, border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)' }}>
        <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="external-link" /></span>檢視網站
      </a>
      <button onClick={() => onSave(data)} disabled={busy} style={{ ...btn, background: 'var(--primary-600, #0E7490)', color: '#fff', border: 'none', opacity: busy ? 0.6 : 1 }}>
        <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="save" /></span>{busy ? '儲存中…' : '儲存並發佈'}
      </button>
    </>
  );
}

export default function Page() {
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]); // metadata for the live smart blocks
  const [homeDoc, setHomeDoc] = useState(null); // initial home document
  const [pages, setPages] = useState([]); // [{slug, title, nav, data}]
  const [chrome, setChrome] = useState({ header: null, footer: null }); // site-wide
  const [cur, setCur] = useState(HOME); // HOME, HEADER, FOOTER or a page slug
  const [newTitle, setNewTitle] = useState('');
  const [tplModal, setTplModal] = useState(false);
  const [tplCat, setTplCat] = useState('all'); // store category filter
  const [tplTheme, setTplTheme] = useState({}); // per-layout chosen color scheme
  const [tplBig, setTplBig] = useState(null); // template key open in large preview
  const [rev, setRev] = useState(0); // bumps to remount Puck after applying a template
  const [tenant, setTenant] = useState(TENANT);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  // Latest edits per document (Puck onChange) — survives tab switches
  // without forcing a save on every switch.
  const draftsRef = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const events = await adminApi('/api/admin/events');
        if (!events.length) return router.replace('/admin/builder');
        const params = new URLSearchParams(window.location.search);
        const ev = events.find((e) => e.id === params.get('event')) || events[0];
        setEvent(ev);
        setTasks(await adminApi(`/api/admin/events/${ev.id}/tasks`));
        // Existing Puck document wins (even if emptied on purpose); otherwise
        // migrate the legacy sections. v1 docs (pre smart blocks) get the
        // live stats/tasks blocks prepended so the v2 layout loses nothing.
        let home = ev.config?.puck
          ? (ev.config?.puckVersion >= 2 ? ev.config.puck : upgradePuckDoc(ev.config.puck))
          : sectionsToPuckData(ev.config?.sections?.length ? ev.config.sections : (DEFAULT_SECTIONS[ev.event_type] || []));
        // Event basics live on the root panel (活動設定) — the event record
        // stays the source of truth, so re-seed them on every open.
        home = { ...home, root: { ...(home.root || {}), props: {
          ...(home.root?.props || {}),
          title: ev.name,
          slug: ev.slug,
          description: ev.description || '',
          heroImage: ev.config?.heroImage || '',
          rewardName: ev.reward_name || '',
          rewardThreshold: ev.reward_threshold || 1,
          theme: home.root?.props?.theme || 'default',
        } } };
        setHomeDoc(home);
        setPages(ev.config?.pages || []);
        setChrome({ header: ev.config?.header || null, footer: ev.config?.footer || null });
        try {
          const b = await adminApi('/api/admin/branding');
          if (b.tenant_slug) setTenant(b.tenant_slug);
          if (b.theme_color) {
            const { applyBrand } = await import('../../../../lib/brand');
            applyBrand(b.theme_color);
          }
        } catch { /* platform default */ }
      } catch (e) {
        if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/builder/design'));
        setError(e.message);
      }
    })();
  }, [router]);

  function docFor(key) {
    if (draftsRef.current[key]) return draftsRef.current[key];
    if (key === HOME) return homeDoc;
    if (CHROME[key]) return chrome[CHROME[key]] || starterChrome(CHROME[key]);
    return pages.find((p) => p.slug === key)?.data || EMPTY_DOC;
  }

  /** Chrome as it would be saved right now — an emptied document is stored as
   * null so the site falls back to the built-in header/footer. */
  function currentChrome() {
    const pick = (key) => {
      const d = draftsRef.current[key] ?? chrome[CHROME[key]];
      return d?.content?.length ? d : null;
    };
    return { header: pick(HEADER), footer: pick(FOOTER) };
  }

  function addPage() {
    const title = newTitle.trim();
    if (!title) return;
    const slug = slugify(title, new Set(pages.map((p) => p.slug)));
    setPages([...pages, { slug, title, nav: true, data: EMPTY_DOC }]);
    setNewTitle('');
    setCur(slug);
  }

  function applyTpl(tpl, themeKey) {
    // Keep the event's own settings (title/hero/reward/menu/CSS) — the
    // template only replaces layout + theme + sub-pages.
    const rp = (draftsRef.current[HOME] || homeDoc)?.root?.props || {};
    const { home, pages: tplPages } = applyTemplate(tpl, rp, themeKey);
    // A template swaps layout + sub-pages only; the site-wide 頁首／頁尾 is the
    // admin's own, so keep its unsaved edits instead of dropping them.
    draftsRef.current = Object.fromEntries(
      [HEADER, FOOTER].filter((k) => draftsRef.current[k]).map((k) => [k, draftsRef.current[k]]),
    );
    setHomeDoc(home);
    setPages(tplPages);
    setCur(HOME);
    setRev((r) => r + 1);
    setTplModal(false); setTplBig(null);
    setFlash('已套用範本 — 按「儲存並發佈」生效'); setTimeout(() => setFlash(''), 3500);
  }

  function removePage(slug) {
    if (!window.confirm('刪除此頁面？儲存後將無法復原。')) return;
    setPages(pages.filter((p) => p.slug !== slug));
    delete draftsRef.current[slug];
    if (cur === slug) setCur(HOME);
  }

  function currentDesign() {
    return {
      puck: draftsRef.current[HOME] || homeDoc,
      pages: pages.map((p) => ({ ...p, data: draftsRef.current[p.slug] || p.data })),
      ...currentChrome(),
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  /** Full Next.js project zip — dev-customizable, self-hostable, live-syncs
   * content from the platform via a freshly minted scoped key. */
  async function exportNextjs() {
    if (!event || busy) return;
    setBusy(true); setError('');
    try {
      const s = adminSession.get('tenant');
      const res = await fetch('/api/export-nextjs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s?.token || ''}` },
        body: JSON.stringify({ eventId: event.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message || `HTTP ${res.status}`);
      }
      const name = (res.headers.get('content-disposition')?.match(/filename="(.+)"/) || [])[1] || 'site.zip';
      downloadBlob(await res.blob(), name);
      setFlash('已匯出 Next.js 專案 ✓'); setTimeout(() => setFlash(''), 2500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function exportDesignJson() {
    const design = currentDesign();
    downloadBlob(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${event?.slug || 'site'}-design.json`);
  }

  /** Design (data) round-trip — accepts a design JSON export or the
   * data/site.json snapshot from an exported project. */
  function importDesignJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const cfg = json?.event?.config || json?.config || json;
        const puck = cfg?.puck;
        const inPages = Array.isArray(cfg?.pages) ? cfg.pages : [];
        if (!puck || !Array.isArray(puck.content)) throw new Error('檔案格式不符 — 需要含 puck.content 的設計 JSON。');
        const valid = new Set(Object.keys(siteConfig.components));
        const walk = (items) => (items || []).forEach((b) => {
          if (!valid.has(b.type)) throw new Error(`未知區塊類型：${b.type}`);
          Object.values(b.props || {}).forEach((v) => {
            if (Array.isArray(v) && v[0]?.type && v[0]?.props) walk(v);
          });
        });
        walk(puck.content);
        inPages.forEach((p) => walk(p?.data?.content));
        walk(cfg?.header?.content);
        walk(cfg?.footer?.content);
        // Event-owned basics stay this event's own — only design travels.
        const home = { ...puck, root: { ...(puck.root || {}), props: {
          ...(puck.root?.props || {}),
          title: event.name,
          slug: event.slug,
          description: event.description || '',
          heroImage: event.config?.heroImage || '',
          rewardName: event.reward_name || '',
          rewardThreshold: event.reward_threshold || 1,
        } } };
        draftsRef.current = {};
        setHomeDoc(home);
        setPages(inPages.map((p) => ({ slug: p.slug, title: p.title, nav: p.nav !== false, data: p.data })));
        setChrome({ header: cfg?.header || null, footer: cfg?.footer || null });
        setCur(HOME);
        setRev((r) => r + 1);
        setFlash('已匯入設計 — 按「儲存並發佈」生效'); setTimeout(() => setFlash(''), 3500);
        setError('');
      } catch (e) { setError(e.message); }
    };
    reader.readAsText(file);
  }

  async function save(currentDoc) {
    if (!event || busy) return;
    setBusy(true); setError('');
    try {
      draftsRef.current[cur] = currentDoc;
      const home = draftsRef.current[HOME] || homeDoc;
      const outPages = pages.map((p) => ({ ...p, data: draftsRef.current[p.slug] || p.data }));
      const outChrome = currentChrome();
      // Event basics come off the root panel; clamp the reward threshold to
      // the task count (a higher one can never be reached).
      const rp = home.root?.props || {};
      let threshold = Number(rp.rewardThreshold) || 1;
      if (tasks.length > 0 && threshold > tasks.length) threshold = tasks.length;
      // Editable public-URL slug — sanitized client-side; 409 from the
      // backend (taken by a sibling event) surfaces as a normal error.
      const slug = String(rp.slug || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
        .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
      const updated = await adminApi(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        body: {
          ...(slug && slug.length >= 2 && slug !== event.slug ? { slug } : {}),
          name: (rp.title || '').trim() || event.name,
          description: rp.description || '',
          reward_name: rp.rewardName || '',
          reward_threshold: threshold,
          config: { ...(event.config || {}), heroImage: rp.heroImage || undefined, puck: home, pages: outPages, header: outChrome.header, footer: outChrome.footer, puckVersion: 2 },
        },
      });
      setEvent(updated);
      setHomeDoc(home);
      setPages(outPages);
      setChrome(outChrome);
      setFlash('已儲存 ✓'); setTimeout(() => setFlash(''), 2500);
    } catch (e) {
      if (e instanceof AuthRequired) return router.replace(loginUrl('/admin/builder/design'));
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (error && !event) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', color: 'var(--status-danger-fg, #B91C1C)', fontSize: '14px', fontWeight: 600 }}>{error}</div>;
  }
  if (!event || !homeDoc) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>載入中…</div>;
  }

  const curPage = CHROME[cur] ? null : (cur === HOME ? null : pages.find((p) => p.slug === cur));
  const CHROME_LABEL = { [HEADER]: '頁首 Header', [FOOTER]: '頁尾 Footer' };
  // What the live nav will look like — so the 頁首／頁尾 canvas shows the real
  // menu instead of an empty bar while it is being designed.
  const navPreview = pages.filter((p) => p.nav !== false).map((p) => ({ label: p.title || p.slug, href: '#', slug: p.slug }));
  const docLabel = CHROME_LABEL[cur] || (curPage ? curPage.title : '首頁');
  // Chrome documents have no URL of their own — preview them on the home page.
  const publicUrl = cur === HOME || CHROME[cur] ? `/e/${tenant}/${event.slug}` : `/e/${tenant}/${event.slug}/${cur}`;

  const railItem = (active) => ({ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 10px', borderRadius: '9px', cursor: 'pointer', border: active ? '1.5px solid var(--primary-600)' : '1px solid var(--border-subtle)', background: active ? 'var(--primary-50)' : '#fff', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-strong)' });

  return (
    <div style={{ height: '100dvh', display: 'flex' }}>

      {/* ── Page rail (multipage manager) ─────────────────────────────── */}
      <aside style={{ width: '218px', flex: '0 0 auto', background: '#fff', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '14px 12px', gap: '7px', overflow: 'auto' }}>
        <button onClick={() => setTplModal(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', borderRadius: '9px', border: '1px solid var(--primary-200)', background: 'var(--primary-50)', color: 'var(--primary-700)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', marginBottom: '4px' }}>
          <span style={{ fontSize: '15px', display: 'inline-flex', lineHeight: 0 }}><Icon name="layout-template" /></span>更換整站範本
        </button>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', margin: '0 4px 4px' }}>頁面</div>

        <div onClick={() => setCur(HOME)} style={railItem(cur === HOME)}>
          <span style={{ fontSize: '14px', color: 'var(--primary-600)', display: 'inline-flex', lineHeight: 0 }}><Icon name="home" /></span>
          <span style={{ flex: 1 }}>首頁</span>
        </div>

        {pages.map((p) => (
          <div key={p.slug} onClick={() => setCur(p.slug)} style={railItem(cur === p.slug)}>
            <span style={{ fontSize: '14px', color: 'var(--primary-600)', display: 'inline-flex', lineHeight: 0 }}><Icon name="file" /></span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
            <button onClick={(e) => { e.stopPropagation(); removePage(p.slug); }} title="刪除頁面" style={{ border: 'none', background: 'none', color: 'var(--text-subtle)', fontSize: '13px', cursor: 'pointer', display: 'inline-flex', lineHeight: 0, padding: 0 }}><Icon name="trash-2" /></button>
          </div>
        ))}

        <div style={{ padding: '9px', borderRadius: '9px', border: '1.5px dashed var(--border-default)', display: 'flex', gap: '6px' }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPage()} placeholder="新頁面名稱…" style={{ flex: 1, minWidth: 0, height: '30px', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '0 8px', fontSize: '12px', outline: 'none' }} />
          <button onClick={addPage} disabled={!newTitle.trim()} title="新增頁面" style={{ width: '30px', height: '30px', borderRadius: '7px', background: 'var(--primary-600)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}><Icon name="plus" /></button>
        </div>

        {/* Site-wide chrome — one header/footer shared by every page */}
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', margin: '10px 4px 4px' }}>全站共用</div>
        {[HEADER, FOOTER].map((k) => (
          <div key={k} onClick={() => setCur(k)} style={railItem(cur === k)}>
            <span style={{ fontSize: '14px', color: 'var(--primary-600)', display: 'inline-flex', lineHeight: 0 }}><Icon name={k === HEADER ? 'panel-top' : 'panel-bottom'} /></span>
            <span style={{ flex: 1 }}>{CHROME_LABEL[k]}</span>
            {(draftsRef.current[k]?.content?.length ?? chrome[CHROME[k]]?.content?.length) > 0 && (
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 6px', borderRadius: '9999px' }}>已啟用</span>
            )}
          </div>
        ))}
        {CHROME[cur] && (
          <div style={{ padding: '9px 10px', borderRadius: '9px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', fontSize: '10.5px', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
            此設計會套用到<strong>所有頁面</strong>。選單會自動列出頁面，無需手動加入。清空區塊即恢復系統預設樣式。
          </div>
        )}

        {/* Per-page settings (title / nav) for the selected sub-page */}
        {curPage && (
          <div style={{ marginTop: '6px', padding: '10px', borderRadius: '9px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-subtle)' }}>頁面標題（選單顯示）</label>
            <input value={curPage.title} onChange={(e) => setPages(pages.map((p) => (p.slug === cur ? { ...p, title: e.target.value } : p)))} style={{ height: '30px', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '0 8px', fontSize: '12px', outline: 'none' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-body)', cursor: 'pointer' }}>
              <input type="checkbox" checked={curPage.nav !== false} onChange={(e) => setPages(pages.map((p) => (p.slug === cur ? { ...p, nav: e.target.checked } : p)))} />
              顯示於網站選單
            </label>
            <div style={{ fontSize: '10.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>/{event.slug}/{curPage.slug}</div>
          </div>
        )}

        {/* Developer round-trip: full project out, design data back in */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '10px', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', margin: '0 4px 2px' }}>開發者</div>
          <button onClick={exportNextjs} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: '14px', display: 'inline-flex', lineHeight: 0, color: 'var(--primary-600)' }}><Icon name={busy ? 'loader' : 'download'} /></span>匯出 Next.js 專案
          </button>
          <button onClick={exportDesignJson} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: '14px', display: 'inline-flex', lineHeight: 0, color: 'var(--primary-600)' }}><Icon name="file-json" /></span>匯出設計 JSON
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 10px', borderRadius: '9px', border: '1.5px dashed var(--border-default)', color: 'var(--text-body)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            <span style={{ fontSize: '14px', display: 'inline-flex', lineHeight: 0, color: 'var(--primary-600)' }}><Icon name="upload" /></span>匯入設計 JSON
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { importDesignJson(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>

        <div style={{ marginTop: 'auto', fontSize: '10.5px', color: 'var(--text-subtle)', lineHeight: 1.6, padding: '4px' }}>
          活動設定（標題／封面圖／獎勵／佈景主題）：在「首頁」點畫布空白處 → 右側面板。主題套用整個網站。
        </div>
      </aside>

      {/* ── Canvas — remount per document so Puck loads the right data ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Puck
          key={`${cur}:${rev}`}
          config={CHROME[cur] ? editorChromeConfig : (cur === HOME ? editorConfig : editorSubPageConfig)}
          data={docFor(cur)}
          onChange={(d) => { draftsRef.current[cur] = d; }}
          metadata={{ event, tasks, branding: { tenant_name: tenant }, nav: navPreview, eventHref: '#', joinHref: '#' }}
          iframe={{ enabled: false }}
          headerTitle={`${event.name} — ${docLabel}`}
          overrides={{
            headerActions: () => (
              <HeaderActions
                onSave={save}
                busy={busy}
                flash={flash}
                publicUrl={publicUrl}
                backUrl={`/admin/builder?event=${event.id}`}
              />
            ),
          }}
        />
        {error && event && (
          <div style={{ position: 'fixed', bottom: '14px', right: '14px', zIndex: 50, padding: '10px 14px', borderRadius: '9px', background: 'var(--status-danger-bg, #FEE2E2)', color: 'var(--status-danger-fg, #B91C1C)', fontSize: '12.5px', fontWeight: 600, boxShadow: 'var(--shadow-lg)' }}>{error}</div>
        )}
      </div>

      {/* ── Theme store (佈景主題商店) — layout × color-scheme matrix ── */}
      {tplModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--surface-app, #F3F6F8)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 22px', background: '#fff', borderBottom: '1px solid var(--border-subtle)', flex: '0 0 auto' }}>
            <span style={{ fontSize: '19px', color: 'var(--primary-600)', display: 'inline-flex', lineHeight: 0 }}><Icon name="layout-template" /></span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-strong)' }}>佈景主題商店</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{SITE_TEMPLATES.length} 種版型 × {Object.keys(THEMES).length} 種配色 — 套用後活動資料（標題／封面／獎勵／選單）全部保留</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.entries(TEMPLATE_CATS).map(([k, label]) => (
                <button key={k} onClick={() => setTplCat(k)} style={{ height: '32px', padding: '0 13px', borderRadius: '9999px', border: tplCat === k ? 'none' : '1px solid var(--border-default)', background: tplCat === k ? 'var(--primary-600)' : '#fff', color: tplCat === k ? '#fff' : 'var(--text-body)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
            <button onClick={() => setTplModal(false)} style={{ width: '34px', height: '34px', borderRadius: '9999px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><span style={{ display: 'inline-flex', lineHeight: 0 }}><Icon name="x" /></span></button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {SITE_TEMPLATES.filter((t) => tplCat === 'all' || t.cat === tplCat).map((tpl) => {
                const chosen = tplTheme[tpl.key] || tpl.theme;
                return (
                  <div key={tpl.key} style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '13px', padding: '11px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'var(--shadow-sm)' }}>
                    <div onClick={() => setTplBig(tpl.key)} style={{ cursor: 'zoom-in' }}><TplPreview tpl={tpl} theme={chosen} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-strong)' }}>{tpl.label}</div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-subtle)', background: 'var(--surface-sunken)', padding: '3px 8px', borderRadius: '9999px' }}>{TEMPLATE_CATS[tpl.cat] || ''}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: 'var(--text-subtle)', fontWeight: 600 }}>{THEMES[chosen]?.label}</span>
                    </div>
                    {/* Color-scheme dots — the "adaptatif" variants of this layout */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {Object.entries(THEMES).map(([k, t]) => (
                        <button key={k} title={t.label} onClick={() => setTplTheme({ ...tplTheme, [tpl.key]: k })} style={{ width: '22px', height: '22px', borderRadius: '9999px', padding: 0, cursor: 'pointer', border: chosen === k ? '2.5px solid var(--primary-600)' : '1.5px solid var(--border-default)', background: `linear-gradient(135deg, ${t.swatch?.[0] || '#fff'} 50%, ${t.swatch?.[2] || '#888'} 50%)` }} />
                      ))}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>{tpl.desc}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setTplBig(tpl.key)} style={{ flex: 1, height: '36px', borderRadius: '9999px', background: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-body)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>預覽</button>
                      <button onClick={() => applyTpl(tpl, chosen)} style={{ flex: 1, height: '36px', borderRadius: '9999px', background: 'var(--primary-600)', color: '#fff', border: 'none', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>套用</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Large full-page preview */}
          {tplBig && (() => {
            const tpl = SITE_TEMPLATES.find((t) => t.key === tplBig);
            if (!tpl) return null;
            const chosen = tplTheme[tpl.key] || tpl.theme;
            return (
              <div onClick={() => setTplBig(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(11,41,53,.66)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '26px' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: '820px', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 18px', borderBottom: '1px solid var(--border-subtle)', flex: '0 0 auto' }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-strong)' }}>{tpl.label}</div>
                    <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 600 }}>{THEMES[chosen]?.label}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                      {Object.entries(THEMES).map(([k, t]) => (
                        <button key={k} title={t.label} onClick={() => setTplTheme({ ...tplTheme, [tpl.key]: k })} style={{ width: '22px', height: '22px', borderRadius: '9999px', padding: 0, cursor: 'pointer', border: chosen === k ? '2.5px solid var(--primary-600)' : '1.5px solid var(--border-default)', background: `linear-gradient(135deg, ${t.swatch?.[0] || '#fff'} 50%, ${t.swatch?.[2] || '#888'} 50%)` }} />
                      ))}
                    </div>
                    <button onClick={() => applyTpl(tpl, chosen)} style={{ height: '34px', padding: '0 18px', borderRadius: '9999px', background: 'var(--primary-600)', color: '#fff', border: 'none', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>套用此設計</button>
                    <button onClick={() => setTplBig(null)} style={{ width: '32px', height: '32px', borderRadius: '9999px', border: '1px solid var(--border-default)', background: '#fff', color: 'var(--text-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ display: 'inline-flex', lineHeight: 0 }}><Icon name="x" /></span></button>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-sunken)' }}>
                    <TplPreview tpl={tpl} theme={chosen} height={1400} scale={0.62} width={1260} />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
