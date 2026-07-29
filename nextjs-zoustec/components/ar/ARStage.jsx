'use client';

/**
 * ARStage — WebAR surface for the experience flow.
 *
 * Engine: three.js over a raw getUserMedia camera feed — NO WebXR (unavailable
 * in the iOS LINE WebView). The on-site QR doubles as the presence gate: jsQR
 * keeps decoding the live frames and the model is only visible while the
 * task's own QR is in view (walk away from the standee → the mascot vanishes).
 * This is the swappable engine seam: when Zoustec ships their official engine,
 * replace the mount internals here; the page contract (props/onComplete) stays.
 *
 * Props:
 *   glbUrl, scale  — from task.ar_config (targetUrl no longer needed)
 *   qrMatches(text) — return true when a decoded QR belongs to this task;
 *                     omit to skip the presence gate (model always visible)
 *   onComplete()   — the right QR held in view ~1.5s (successful AR reveal)
 *   onStatus(state) — 'initializing'|'camera-started'|'target-found'|'target-lost'|'completed'|'error'
 */

import { useEffect, useRef, useState } from 'react';
import { getLiff, resolveLiffId } from '../../lib/liff-client';

const DWELL_MS = 1500;
const GRACE_MS = 2000;   // QR reads are flaky frame-to-frame — hide only after this long unseen
const DECODE_MS = 300;   // jsQR cadence (same ballpark as the scan step)
const DECODE_W = 640;    // decode on a downscaled frame — full-res is CPU noise

function arCapable() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function externalBrowserUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('openExternalBrowser', '1'); // honored by LINE's in-app browser, but NOT inside LIFF apps
  return url.toString();
}

/** Escape to the device's default browser. LINE ignores openExternalBrowser=1
 * on LIFF URLs, so inside the LIFF browser the only working path is
 * liff.openWindow({external: true}); the query param stays as fallback for
 * the plain LINE in-app browser and external browsers. */
async function openExternal() {
  const target = externalBrowserUrl();
  try {
    const liff = await getLiff(await resolveLiffId());
    if (liff?.isInClient?.()) {
      liff.openWindow({ url: target, external: true });
      return;
    }
  } catch { /* LIFF unavailable → plain navigation */ }
  window.location.href = target;
}

export default function ARStage({ glbUrl, scale = 0.4, qrMatches, onComplete, onStatus }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  // Callback identities change per render — keep them in refs so the camera
  // and scene mount exactly once.
  const qrMatchesRef = useRef(qrMatches);
  qrMatchesRef.current = qrMatches;
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!glbUrl) return;
    if (!arCapable()) { setUnsupported(true); onStatus?.('error'); return; }

    let disposed = false;
    let renderer = null;
    let stream = null;
    let decodeTimer = null;
    let resizeObs = null;
    const emit = (s) => { if (!disposed) onStatus?.(s); };

    (async () => {
      emit('initializing');
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (disposed) return;

        const container = containerRef.current;
        const video = videoRef.current;

        // Camera permission prompt happens here.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (disposed) return;
        video.srcObject = stream;
        await video.play();

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(0, 0.2, 2.4);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0' });
        container.appendChild(renderer.domElement);

        const fit = () => {
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        fit();
        resizeObs = new ResizeObserver(fit);
        resizeObs.observe(container);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0.5, 1, 1);
        scene.add(dir);

        const gltf = await new GLTFLoader().loadAsync(glbUrl);
        if (disposed) return;
        const model = gltf.scene;
        // Normalize so any GLB lands mid-frame at a sensible size, then apply
        // the task's scale on top (0.4 = legacy default → ~1 world unit tall).
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const norm = (scale / 0.4) / maxDim;
        model.scale.setScalar(norm);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(norm);
        model.position.sub(center);
        scene.add(model);

        let mixer = null;
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        }

        emit('camera-started');

        // ── QR presence gate ─────────────────────────────────────────────
        // The mascot only exists while the task's own QR is in the frame.
        const gated = typeof qrMatchesRef.current === 'function';
        let lastSeen = gated ? -Infinity : Infinity;
        if (gated) {
          const jsQR = (await import('jsqr')).default;
          if (disposed) return;
          const dc = document.createElement('canvas');
          const dctx = dc.getContext('2d', { willReadFrequently: true });
          decodeTimer = setInterval(() => {
            if (disposed || !video.videoWidth) return;
            const k = Math.min(1, DECODE_W / video.videoWidth);
            dc.width = Math.round(video.videoWidth * k);
            dc.height = Math.round(video.videoHeight * k);
            dctx.drawImage(video, 0, 0, dc.width, dc.height);
            const img = dctx.getImageData(0, 0, dc.width, dc.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (hit?.data && qrMatchesRef.current?.(hit.data)) lastSeen = performance.now();
          }, DECODE_MS);
        }

        model.visible = !gated;
        let found = !gated;
        let completed = false;
        let foundAt = performance.now();

        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          const now = performance.now();
          const seen = now - lastSeen < GRACE_MS;
          if (seen !== found) {
            found = seen;
            model.visible = seen;
            emit(seen ? 'target-found' : 'target-lost');
            if (seen) foundAt = now;
          }
          if (found && !completed && now - foundAt >= DWELL_MS) {
            completed = true;
            emit('completed');
            onComplete?.();
          }
          const dt = clock.getDelta();
          if (mixer) mixer.update(dt);       // animated GLB: play its clips
          else model.rotation.y += dt * 0.6; // static mesh: gentle idle spin
          renderer.render(scene, camera);
        });
      } catch (e) {
        if (disposed) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(/denied|permission|NotAllowed/i.test(msg)
          ? '相機權限被拒絕 — 請允許相機後重試'
          : `AR 啟動失敗：${msg.slice(0, 120)}`);
        emit('error');
      }
    })();

    return () => {
      disposed = true;
      if (decodeTimer) clearInterval(decodeTimer);
      if (resizeObs) resizeObs.disconnect();
      if (renderer) {
        try { renderer.setAnimationLoop(null); } catch {}
        try { renderer.domElement?.remove(); } catch {}
        try { renderer.dispose(); } catch {}
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [glbUrl, scale, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (unsupported || error) {
    return (
      <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px', padding:'30px', textAlign:'center', zIndex:5}}>
        <div style={{color:'#fff', fontSize:'14px', fontWeight:'700'}}>{unsupported ? '此環境無法啟動 AR 相機' : error}</div>
        <div style={{display:'flex', gap:'10px'}}>
          {!unsupported && (
            <button onClick={() => { setError(''); setRetryKey((k) => k + 1); }} style={{padding:'10px 18px', borderRadius:'9999px', background:'#fff', color:'var(--primary-800)', fontSize:'13px', fontWeight:'700', border:'none', cursor:'pointer'}}>重試</button>
          )}
          <button onClick={openExternal} style={{padding:'10px 18px', borderRadius:'9999px', background:'rgba(255,255,255,.14)', color:'#fff', fontSize:'13px', fontWeight:'700', border:'1px solid rgba(255,255,255,.3)', cursor:'pointer'}}>在外部瀏覽器開啟</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{position:'absolute', inset:0, overflow:'hidden'}}>
      <video ref={videoRef} playsInline muted style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover'}} />
    </div>
  );
}
