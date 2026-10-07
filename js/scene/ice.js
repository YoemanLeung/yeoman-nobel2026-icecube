// Inside the ice sheet: a scientific cutaway, not a cave. Background brightens toward the firn near the
// surface and darkens with depth; strata, the dust layer and bedrock are faint labelled bands.
// The descent gets its sense of speed from three things that are physically motivated or plainly
// schematic: air bubbles streaking past (dense near the surface, gone by ~1,350 m, where pressure has turned
// them all into air-hydrate crystals; ledger F34), depth rings every 100 m, and a burst of snow at the surface.

import * as THREE from 'three';
import { softDot } from './textures.js';
import { OUTPUT, OUTPUT_GLSL } from './colorspace.js';
import { ICE_THICKNESS, DUST_LAYER } from '../science/constants.js';
import { clamp, smoothstep } from '../core/math.js';
import { createStream } from '../core/rng.js';

const SHARED = { uCamY: { value: 0 } };

const DOME_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FRAG = `
  uniform float uDepth;
  uniform float uUpGlow;
  ${OUTPUT_GLSL}
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float shallow = 1.0 - smoothstep(0.0, 1000.0, uDepth);
    vec3 deep = vec3(0.006, 0.022, 0.04);
    vec3 up = mix(vec3(0.02, 0.07, 0.11), vec3(0.46, 0.67, 0.84), shallow);
    vec3 down = mix(vec3(0.004, 0.012, 0.02), vec3(0.13, 0.27, 0.38), shallow);
    vec3 col = mix(down, up, smoothstep(-1.0, 0.75, d.y)); // light from above, the abyss below
    col = mix(col, deep, 0.35 * (1.0 - shallow));
    col += vec3(0.05, 0.13, 0.2) * uUpGlow * pow(max(d.y, 0.0), 2.5);
    gl_FragColor = vec4(outColor(col), 1.0);
  }
`;

const BUBBLE_VERT = `
  attribute float aEnd;
  attribute float aDepthFade;
  uniform float uStreak;
  uniform vec3 uCam;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += aEnd * uStreak;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = length((modelMatrix * vec4(p, 1.0)).xyz - uCam);
    vAlpha = aDepthFade * (1.0 - smoothstep(14.0, 95.0, dist)) * mix(0.9, 0.0, aEnd);
  }
`;
const BUBBLE_FRAG = `
  uniform float uOpacity;
  ${OUTPUT_GLSL}
  varying float vAlpha;
  void main() { gl_FragColor = vec4(outColor(vec3(0.82, 0.93, 1.0)), outAlpha(vAlpha * uOpacity)); }
`;

function makeDome(uniforms) {
  const mat = new THREE.ShaderMaterial({ vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: { ...uniforms, ...OUTPUT }, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 32), mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

function strataPlane(y, size, color, opacity) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFade: { value: 1 }, uPass: { value: 0 }, uCamY: SHARED.uCamY, uY: { value: y }, ...OUTPUT },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uFade; uniform float uPass; uniform float uCamY; uniform float uY;
      ${OUTPUT_GLSL} varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0;
      float near = 1.0 - smoothstep(12.0, 70.0, abs(uY - uCamY));
      float a = (uOpacity * (1.0 - uPass) + 0.16 * uPass * near) * uFade * (1.0 - smoothstep(0.55, 1.0, r));
      gl_FragColor = vec4(outColor(uColor), outAlpha(a)); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Bubbles as vertical streak segments; the streak length follows the descent speed (a uniform). */
function makeBubbles(count) {
  const rng = createStream(77, 'bubbles');
  const pos = new Float32Array(count * 2 * 3);
  const end = new Float32Array(count * 2);
  const fade = new Float32Array(count * 2);
  const scale = 420;
  const maxDepth = 1360;
  const norm = 1 - Math.exp(-maxDepth / scale);
  for (let i = 0; i < count; i++) {
    const r = 7 + Math.sqrt(rng.uniform()) * 66;
    const a = rng.uniform() * Math.PI * 2;
    const depth = -scale * Math.log(1 - rng.uniform() * norm);
    const y = -depth;
    const f = (1 - smoothstep(1000, 1350, depth)) * (0.55 + 0.45 * rng.uniform()); // gone by ~1,350 m (ledger F34)
    for (let k = 0; k < 2; k++) {
      pos.set([Math.cos(a) * r, y, Math.sin(a) * r], (i * 2 + k) * 3);
      end[i * 2 + k] = k;
      fade[i * 2 + k] = f;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geo.setAttribute('aDepthFade', new THREE.BufferAttribute(fade, 1));
  const uniforms = { uStreak: { value: 0.4 }, uCam: { value: new THREE.Vector3() }, uOpacity: { value: 0 }, ...OUTPUT };
  const lines = new THREE.LineSegments(
    geo,
    new THREE.ShaderMaterial({ vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  lines.frustumCulled = false;
  return { lines, uniforms };
}

/** Thin bright rings every 100 m around the descent axis: the camera falls through them. */
function makeRings(radius) {
  const g = new THREE.Group();
  const anchors = [];
  const mat = new THREE.LineBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  for (let d = 100; d <= 1400; d += 100) {
    const ring = new THREE.Line(geo, mat);
    ring.position.y = -d;
    g.add(ring);
    if (d % 200 === 0) anchors.push({ depth: d, y: -d });
  }
  return { group: g, material: mat, anchors };
}

/** Snow crystals thrown up where the camera breaks through the surface (pure function of time). */
function makeBurst(count) {
  const rng = createStream(91, 'burst');
  const dirs = Array.from({ length: count }, () => {
    const v = rng.unitVector();
    return { v: [v[0] * 9, Math.abs(v[1]) * 14 + 2, v[2] * 9], life: 0.6 + rng.uniform() * 0.7 };
  });
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, map: softDot(), color: 0xeef6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  return {
    points: pts,
    update(origin, tau) {
      const on = tau >= 0 && tau < 1.4;
      pts.visible = on;
      if (!on) return;
      const arr = geo.attributes.position.array;
      dirs.forEach((d, i) => {
        const k = Math.min(tau, d.life);
        arr[i * 3] = origin[0] + d.v[0] * k;
        arr[i * 3 + 1] = origin[1] + d.v[1] * k - 4.9 * k * k;
        arr[i * 3 + 2] = origin[2] + d.v[2] * k;
      });
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = 0.9 * (1 - smoothstep(0.3, 1.4, tau));
    },
  };
}

export function createIce(scene, array, { tier }) {
  const group = new THREE.Group();
  const uniforms = { uDepth: { value: 0 }, uUpGlow: { value: 0 } };
  const dome = makeDome(uniforms);
  group.add(dome);

  const span = array.radius * 2 + 1400;
  const ceiling = strataPlane(-0.5, span * 1.6, 0x9fd4ff, 0.22);
  const bedrock = strataPlane(-ICE_THICKNESS, span * 1.4, 0x1c140f, 0.6);
  group.add(ceiling, bedrock);
  const strata = [];
  for (let i = 0; i < 26; i++) {
    const y = -60 - i * 107 - ((i * 37) % 41);
    if (y < -ICE_THICKNESS + 30) break;
    const p = strataPlane(y, span, 0x9fc9e8, 0.035);
    strata.push(p);
    group.add(p);
  }
  const dustH = DUST_LAYER[1] - DUST_LAYER[0];
  const dust = new THREE.Mesh(
    new THREE.BoxGeometry(span * 0.78, dustH, span * 0.78),
    new THREE.MeshBasicMaterial({ color: 0x8a6a45, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
  );
  dust.position.y = -(DUST_LAYER[0] + DUST_LAYER[1]) / 2;
  group.add(dust);

  const rulerX = -array.radius - 140;
  const rulerZ = array.radius * 0.55;
  const rpts = [rulerX, 0, rulerZ, rulerX, -ICE_THICKNESS, rulerZ];
  for (let d = 0; d <= ICE_THICKNESS; d += 100) {
    const len = d % 500 === 0 ? 40 : 16;
    rpts.push(rulerX, -d, rulerZ, rulerX + len, -d, rulerZ);
  }
  const ruler = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rpts, 3)),
    new THREE.LineBasicMaterial({ color: 0x9cc8e6, transparent: true, opacity: 0.5 }),
  );
  group.add(ruler);

  // descent effects, centred on the descent axis
  const descent = new THREE.Group();
  const bubbles = makeBubbles(Math.round(5200 * (tier.particles || 1)));
  const rings = makeRings(34);
  const burst = makeBurst(Math.round(700 * (tier.particles || 1)));
  descent.add(bubbles.lines, rings.group);
  group.add(descent);
  scene.add(group);
  scene.add(burst.points);

  // close-up lights for the DOM model: only below the surface (they would flood the lab otherwise)
  const lights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xdcefff, 2.2);
  key.position.set(-1, 1.4, 1.2);
  lights.add(key, new THREE.AmbientLight(0x4a6a88, 1.1));
  scene.add(lights);

  return {
    group,
    ruler,
    rulerAnchor: [rulerX, 0, rulerZ],
    dust,
    ringAnchors: rings.anchors,
    setAxis(x, z) {
      descent.position.set(x, 0, z);
    },
    axis: () => [descent.position.x, descent.position.z],
    /**
     * opts: strataBoost, cutaway (0..1), interior (0..1: camera inside the volume, where the stacked
     * strata planes would read as fog, so only the ones next to the camera show), bubbles (0..1),
     * streak (m), rings (0..1), upGlow (0..1), burst: {origin, tau} (tau = s since the plunge, < 0 = none)
     */
    update(camera, { strataBoost = 0, cutaway = 1, interior = 0, bubbles: bub = 0, streak = 0.4, rings: ringA = 0, upGlow = 0, burst: b = null } = {}) {
      const depth = Math.max(0, -camera.position.y);
      const below = camera.position.y <= 0;
      dome.visible = below;
      lights.visible = below;
      uniforms.uDepth.value = depth;
      uniforms.uUpGlow.value = upGlow;
      dome.position.copy(camera.position);
      ceiling.visible = below;
      const near = smoothstep(500, 0, depth);
      SHARED.uCamY.value = camera.position.y;
      strata.forEach((p) => {
        p.material.uniforms.uOpacity.value = 0.03;
        p.material.uniforms.uPass.value = Math.max(strataBoost, interior);
      });
      ruler.material.opacity = 0.5 * cutaway;
      bedrock.material.uniforms.uFade.value = cutaway;
      dust.material.opacity = 0.07 * cutaway + 0.02;
      ceiling.material.uniforms.uOpacity.value = 0.12 * (1 - interior) + 0.3 * near;
      bubbles.uniforms.uOpacity.value = clamp(bub, 0, 1);
      bubbles.uniforms.uStreak.value = streak;
      bubbles.uniforms.uCam.value.copy(camera.position);
      bubbles.lines.visible = bub > 0.01;
      rings.material.opacity = 0.55 * clamp(ringA, 0, 1);
      rings.group.visible = ringA > 0.01;
      burst.update(b ? b.origin : [0, 0, 0], b ? b.tau : -1);
    },
  };
}
