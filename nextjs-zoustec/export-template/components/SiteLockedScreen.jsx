/**
 * Shown instead of the site when its API key is missing, wrong, or revoked.
 *
 * Deliberately blocks ALL content: a credential fault must be obvious, not
 * papered over with the offline snapshot. (A platform outage is different —
 * that still serves the snapshot; see lib/site-data.js.)
 *
 * Says what to fix without leaking the key or the platform's internals; the
 * technical reason goes to the server log and /api/zoustec-status.
 */

export default function SiteLockedScreen({ reason }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#0B2935',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "Noto Sans TC", sans-serif',
      }}
    >
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '46px', lineHeight: 1, marginBottom: '18px' }}>🔒</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800 }}>
          網站尚未啟用
        </h1>
        <p
          style={{
            margin: '14px 0 0',
            fontSize: '14.5px',
            lineHeight: 1.75,
            color: 'rgba(255,255,255,.8)',
          }}
        >
          此網站需要有效的 Zoustec API 金鑰才能顯示內容。
          請確認 <code style={{ background: 'rgba(255,255,255,.12)', padding: '2px 6px', borderRadius: '5px' }}>.env.local</code> 中的{' '}
          <code style={{ background: 'rgba(255,255,255,.12)', padding: '2px 6px', borderRadius: '5px' }}>ZOUSTEC_EXPORT_KEY</code>{' '}
          已正確填寫且未被撤銷，然後<strong>重新啟動</strong>伺服器
          （環境變數只在啟動時讀取一次）。
        </p>
        {reason && (
          <p
            style={{
              margin: '18px 0 0',
              fontSize: '12.5px',
              color: 'rgba(255,255,255,.55)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak: 'break-word',
            }}
          >
            {reason}
          </p>
        )}
        <p style={{ margin: '22px 0 0', fontSize: '12.5px', color: 'rgba(255,255,255,.55)' }}>
          診斷： <code>/api/zoustec-status</code> · 如需重新產生金鑰請聯絡 Zoustec。
        </p>
      </div>
    </div>
  );
}
