// Renderer, camera rig and the post-processing chain.
// The tour drives the camera through poses {target, dist, az, el, fov}; the moment the viewer drags,
// scrolls or pinches, OrbitControls takes over (and the director pauses). resumeTour() blends back.
// Quality tiers decide resolution, bloom (full / half / off) and shadows; see quality.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerp, ease } from '../core/math.js';
import { TIERS } from './quality.js';
import { OUTPUT } from './colorspace.js';

const DEFAULT_POSE = { target: [0, -1950, 0], dist: 2600, az: 0.6, el: 0.25, fov: 50 };

export function poseToPosition(pose) {
  const ce = Math.cos(pose.el);
  return [
    pose.target[0] + pose.dist * ce * Math.cos(pose.az),
    pose.target[1] + pose.dist * Math.sin(pose.el),
    pose.target[2] - pose.dist * ce * Math.sin(pose.az),
  ];
}

/** Interpolate two poses: distance in log space (constant perceived zoom speed), angles linearly. */
export function mixPose(a, b, t) {
  let daz = b.az - a.az;
  if (daz > Math.PI) daz -= 2 * Math.PI;
  if (daz < -Math.PI) daz += 2 * Math.PI;
  return {
    target: [lerp(a.target[0], b.target[0], t), lerp(a.target[1], b.target[1], t), lerp(a.target[2], b.target[2], t)],
    dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)),
    az: a.az + daz * t,
    el: lerp(a.el, b.el, t),
    fov: lerp(a.fov ?? 50, b.fov ?? 50, t),
  };
}

/** Pose at local time t from keyframes [{t, ...pose, ease?}]. */
export function poseAt(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const f = (ease[b.ease || 'inOutCubic'] || ease.inOutCubic)((t - a.t) / (b.t - a.t));
      return mixPose(a, b, f);
    }
  }
  return keys[keys.length - 1];
}

export function createStage(container, { tier: tierName = 'medium' } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error(`WebGL unavailable: ${err.message}`);
  }
  renderer.setClearColor(0x02070d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  controls.minDistance = 0.4;
  controls.maxDistance = 30000;

  const scenes = {};
  let active = null;
  let mode = 'tour';
  let tourPose = { ...DEFAULT_POSE };
  let blend = null;
  let tier = TIERS[tierName] || TIERS.medium;
  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let bloomStrength = 0.75;
  const listeners = { userStart: [] };

  controls.addEventListener('start', () => {
    if (mode !== 'user') {
      mode = 'user';
      blend = null;
      listeners.userStart.forEach((fn) => fn());
    }
  });

  function size() {
    return { w: container.clientWidth || window.innerWidth, h: container.clientHeight || window.innerHeight };
  }

  function buildComposer() {
    const { w, h } = size();
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    renderPass = new RenderPass(scenes[active] || new THREE.Scene(), camera);
    const scale = tier.bloom === 'half' ? 0.5 : 1;
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w * scale, h * scale), bloomStrength, 0.55, 0.62);
    // last line of defence: one non-finite pixel would otherwise be blurred over the whole frame
    const hp = bloomPass.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = clamp( texture2D( tDiffuse, vUv ), 0.0, 64.0 );',
    );
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }

  function disposeComposer() {
    if (!composer) return;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    bloomPass.dispose();
    composer = null;
    renderPass = null;
    bloomPass = null;
  }

  function applyTier(next) {
    tier = TIERS[next] || tier;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelCap));
    renderer.shadowMap.enabled = tier.shadows;
    disposeComposer();
    if (tier.bloom !== 'off') buildComposer();
    resize();
  }

  function applyPose(pose) {
    const [x, y, z] = poseToPosition(pose);
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(controls.target);
    if (Math.abs(camera.fov - (pose.fov ?? 50)) > 1e-3) {
      camera.fov = pose.fov ?? 50;
      camera.updateProjectionMatrix();
    }
  }

  function currentPose() {
    const off = camera.position.clone().sub(controls.target);
    const dist = off.length();
    return {
      target: controls.target.toArray(),
      dist,
      az: Math.atan2(-off.z, off.x),
      el: Math.asin(clamp(off.y / Math.max(dist, 1e-6), -1, 1)),
      fov: camera.fov,
    };
  }

  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const scale = tier.bloom === 'half' ? 0.5 : 1;
      bloomPass.setSize(w * scale, h * scale);
    }
  }
  window.addEventListener('resize', resize);
  applyTier(tier.name);

  const tmp = new THREE.Vector3();

  return {
    renderer,
    camera,
    controls,
    get mode() {
      return mode;
    },
    get tier() {
      return tier;
    },
    setTier(name) {
      applyTier(name);
      return tier;
    },
    setBloom(strength) {
      bloomStrength = strength;
      if (bloomPass) bloomPass.strength = strength;
    },
    addScene(name, scene) {
      scenes[name] = scene;
      if (!active) active = name;
    },
    setScene(name) {
      if (scenes[name]) active = name;
    },
    get sceneName() {
      return active;
    },
    setTourPose(pose) {
      tourPose = pose;
    },
    onUserStart(fn) {
      listeners.userStart.push(fn);
    },
    resumeTour(duration = 1.1) {
      if (mode === 'tour') return;
      blend = { from: currentPose(), t: 0, dur: duration };
      mode = 'blend';
    },
    snapToTour() {
      if (mode === 'tour') applyPose(tourPose);
    },
    /** Shift the rendered image left by a fraction of the width (keeps the subject clear of a side panel). */
    setViewShift(f) {
      const { w, h } = size();
      if (Math.abs(f) < 1e-3) {
        if (camera.view && camera.view.enabled) camera.clearViewOffset();
        return;
      }
      camera.setViewOffset(w, h, w * f, 0, w, h);
    },
    /** Device pixels per world unit at distance 1 (for size-attenuated points). */
    pixelScale() {
      return renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
    project(vec) {
      tmp.set(vec[0], vec[1], vec[2]).project(camera);
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h, visible: tmp.z > -1 && tmp.z < 1 };
    },
    poseAt: (keys, t) => poseAt(keys, t),
    frame(dt) {
      if (mode === 'tour') {
        applyPose(tourPose);
      } else if (mode === 'blend') {
        blend.t += dt;
        const f = ease.inOutCubic(clamp(blend.t / blend.dur, 0, 1));
        applyPose(mixPose(blend.from, tourPose, f));
        if (blend.t >= blend.dur) {
          mode = 'tour';
          blend = null;
        }
      } else {
        controls.update();
      }
      const dist = camera.position.distanceTo(controls.target);
      const near = clamp(dist * 0.003, 0.02, 40);
      const far = Math.max(dist * 40, 42000);
      if (Math.abs(camera.near - near) / near > 0.05 || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      if (!active) return;
      if (composer) {
        OUTPUT.uLinearOut.value = 1;
        renderPass.scene = scenes[active];
        composer.render(dt);
      } else {
        OUTPUT.uLinearOut.value = 0;
        renderer.render(scenes[active], camera);
      }
    },
  };
}
