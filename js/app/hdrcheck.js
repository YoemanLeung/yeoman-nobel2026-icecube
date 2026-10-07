// Debug check for the post-processing path: renders the tour every `step` seconds into a small float
// target and reports NaN and values beyond the HalfFloat range (65504). One such pixel becomes Inf in the
// composer's HalfFloat buffer and the bloom blur spreads it over the whole frame (a white screen), so run
// this after any shader change:  open the page with #debug, then  await __ice.hdrSweep()  in the console.
// Means in the cosmos scene read high here (glow points are sized for the full canvas, not this target).

import * as THREE from 'three';
import { OUTPUT } from '../scene/colorspace.js';

const HALF_MAX = 65504;

export async function hdrSweep({ director, world, renderFrame }, { step = 0.5, width = 200, height = 120 } = {}) {
  const renderer = world.stage.renderer;
  const camera = world.stage.camera;
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType });
  const buf = new Float32Array(width * height * 4);
  const wasPlaying = director.playing;
  const T0 = director.T;
  const bad = [];
  const maxByChapter = {};
  director.pause();
  try {
    for (let T = 0; T <= director.total; T += step) {
      director.seek(T);
      renderFrame(1 / 30);
      const scene = world.stage.sceneName === 'cosmos' ? world.cosmos.scene : world.world;
      OUTPUT.uLinearOut.value = 1;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, buf);
      let nan = 0;
      let over = 0;
      let max = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        if (v !== v) nan += 1;
        else {
          if (v > HALF_MAX) over += 1;
          if (v > max) max = v;
        }
      }
      const ch = director.locate().index + 1;
      maxByChapter[ch] = Math.max(maxByChapter[ch] || 0, Math.round(max * 10) / 10);
      if (nan || over) bad.push({ T: Math.round(T * 100) / 100, chapter: ch, nan, over });
    }
  } finally {
    target.dispose();
    director.seek(T0);
    if (wasPlaying) director.play();
  }
  return { ok: bad.length === 0, maxByChapter, bad };
}
