'use client';

/** Minimal three.js GLB preview: centred, auto-scaled, idle rotation.
 *  Client-only; re-creates the scene when url/tint/scale change. */

import { useEffect, useRef } from 'react';

export default function GlbPreview({ url, tint, scale = 1, height = 300 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!url) return;
    let stop = false, renderer = null, frame = 0;
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      if (stop || !ref.current) return;

      const w = ref.current.clientWidth || 300;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, height);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      ref.current.innerHTML = '';
      ref.current.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / height, 0.1, 100);
      camera.position.set(0, 0.6, 2.6);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x33505f, 1.25));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(1, 2, 2);
      scene.add(dir);

      let model = null;
      try {
        const gltf = await new GLTFLoader().loadAsync(url);
        if (stop) return;
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        model.scale.setScalar((1.6 / size) * (Number(scale) || 1));
        if (tint) {
          const t = new THREE.Color(tint);
          model.traverse((o) => {
            const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            mats.forEach((m) => m.color?.multiply?.(t));
          });
        }
        scene.add(model);
      } catch { /* keep an empty stage on load failure */ }

      const clock = new THREE.Clock();
      const loop = () => {
        if (stop) return;
        frame = requestAnimationFrame(loop);
        if (model) model.rotation.y += clock.getDelta() * 0.8;
        renderer.render(scene, camera);
      };
      loop();
    })();

    return () => {
      stop = true;
      if (frame) cancelAnimationFrame(frame);
      try { renderer?.dispose?.(); } catch { /* ignore */ }
    };
  }, [url, tint, scale, height]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
