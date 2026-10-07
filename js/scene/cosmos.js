// The origin chapter's scene (arbitrary units; scale jumps are labelled in the UI).
// Earth (r = 1) with its Antarctic cap, a Milky-Way-like spiral, a field of distant galaxies and an
// active galaxy whose jet points almost at us (a blazar). A warp streak field carries the camera across
// the scale jumps so they read as one flight. The AGN is the starting point, not the star of the show.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { softDot } from './textures.js';
import { OUTPUT, OUTPUT_GLSL } from './colorspace.js';
import { createStream } from '../core/rng.js';
import { DEG } from '../core/math.js';

const EARTH_FRAG = `
  uniform vec3 uSun;
  ${OUTPUT_GLSL}
  varying vec3 vN; varying vec3 vP; varying vec3 vV;
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
  void main(){
    vec3 n = normalize(vN);
    float lat = asin(clamp(vP.y, -1.0, 1.0));
    float land = smoothstep(0.52, 0.56, noise(vP * 2.3) * 0.65 + noise(vP * 5.1) * 0.35);
    vec3 col = mix(vec3(0.035, 0.15, 0.33), vec3(0.20, 0.27, 0.18), land);
    float ice = 1.0 - smoothstep(-1.16, -1.08, lat);
    col = mix(col, vec3(0.93, 0.96, 1.0), ice);
    float clouds = smoothstep(0.55, 0.75, noise(vP * 4.0 + 3.0) * 0.6 + noise(vP * 11.0) * 0.4);
    col = mix(col, vec3(0.92), clouds * 0.45);
    float light = max(dot(n, normalize(uSun)), 0.0);
    col *= 0.1 + 0.95 * light;
    float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
    col += vec3(0.25, 0.5, 1.0) * rim * (0.25 + 0.75 * light);
    gl_FragColor = vec4(outColor(col), 1.0);
  }
`;

// accretion disk: hot inner edge, Doppler-brightened approaching side, slow swirl
const DISK_FRAG = `
  uniform float uTime;
  ${OUTPUT_GLSL}
  varying vec2 vUv;
  varying vec3 vPos;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
  void main() {
    float r = length(vPos.xy);
    float phi = atan(vPos.y, vPos.x);
    float k = clamp((r - 0.85) / 3.6, 0.0, 1.0);
    vec3 hot = vec3(1.0, 0.97, 0.9);
    vec3 warm = vec3(1.0, 0.55, 0.2);
    vec3 col = mix(hot, warm, pow(k, 0.6));
    float swirl = noise(vec2(phi * 6.0 - uTime * 0.8 / (0.4 + k), r * 3.0));
    float doppler = 1.0 + 0.55 * sin(phi);
    float bright = pow(1.0 - k, 1.2) * (0.65 + 0.7 * swirl) * doppler;
    float a = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.82, 1.0, k));
    gl_FragColor = vec4(outColor(col * bright * 0.9), outAlpha(a)); // bright, but the swirl survives the bloom
  }
`;

const WARP_VERT = `
  attribute vec3 aSeed;
  attribute float aEnd;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLen;
  varying float vA;
  void main() {
    float L = 2400.0;
    float z = mod(aSeed.z + uTime * uSpeed, L);
    float zz = -L + z;
    float tail = aEnd * uLen;
    vec3 p = vec3(aSeed.xy * (1.0 + aEnd * 0.0), zz - tail);
    vA = smoothstep(-L, -L * 0.6, zz) * (1.0 - smoothstep(-80.0, 0.0, zz)) * mix(1.0, 0.0, aEnd);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const WARP_FRAG = `
  uniform float uOpacity;
  ${OUTPUT_GLSL}
  varying float vA;
  void main() { gl_FragColor = vec4(outColor(vec3(0.75, 0.86, 1.0)), outAlpha(vA * uOpacity)); }
`;

// Size-capped glow points. PointsMaterial's size attenuation has no upper limit: once the camera flies
// into a star cloud, nearby points grow to hundreds of pixels and the additive pile-up whites out the
// frame. Here the size is perspective-correct but capped at uMaxPx device pixels, and points right next
// to the camera fade out.
const GLOW_VERT = `
  uniform float uSize;
  uniform float uScale;
  uniform float uMaxPx;
  uniform float uNear;
  uniform float uOpacity;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(-mv.z, 1e-3);
    float px = uSize * uScale / d;
    gl_PointSize = clamp(px, 1.0, uMaxPx);
    #ifdef USE_COLOR
      vCol = color;
    #else
      vCol = vec3(1.0);
    #endif
    vA = uOpacity * smoothstep(uNear * 0.35, uNear, d) * clamp(px, 0.2, 1.0);
  }
`;
const GLOW_FRAG = `
  uniform vec3 uColor;
  ${OUTPUT_GLSL}
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(outColor(uColor * vCol), outAlpha(vA * exp(-3.0 * r2)));
  }
`;

/** Points with the glow shader; colours are authored in display space like the other custom shaders. */
function glowPoints(geo, { size, color = 0xffffff, opacity = 1, maxPx = 6, near = 4, vertexColors = false }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uScale: { value: 800 },
      uMaxPx: { value: maxPx },
      uNear: { value: near },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) },
      ...OUTPUT,
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    vertexColors,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.opacity = opacity;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Push the per-frame values (fade from material.opacity, device px per unit at distance 1). */
function syncGlow(points, pixelScale) {
  const u = points.material.uniforms;
  u.uOpacity.value = points.material.opacity;
  u.uScale.value = pixelScale;
}

function makeEarth() {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0.35, 0.6) }, ...OUTPUT },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vP = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);
      vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: EARTH_FRAG,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(0.45, 1), color: 0x4c8dff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.9);
  const pole = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffd666, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pole.scale.setScalar(0.08);
  pole.position.set(0, -1.002, 0);
  g.add(halo, earth, pole);
  return { group: g, pole };
}

function makeSpiral(rng, count, radius, colorA, colorB) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  for (let i = 0; i < count; i++) {
    const arm = rng.int(2);
    const r = Math.pow(rng.uniform(), 0.7) * radius;
    const theta = arm * Math.PI + r * 0.011 + rng.normal() * 0.28;
    const y = rng.normal() * radius * 0.02 * (1 - r / radius + 0.2);
    pos.set([r * Math.cos(theta), y, r * Math.sin(theta)], i * 3);
    const c = a.clone().lerp(b, Math.min(1, r / radius));
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: radius * 0.012, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}

function makeAgn(rng) {
  const g = new THREE.Group();
  const n = 9000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 2.5 + Math.pow(rng.uniform(), 1.7) * 38; // keep the engine itself clear of host stars
    const v = rng.unitVector();
    pos.set([v[0] * r * 1.3, v[1] * r * 0.75, v[2] * r], i * 3);
  }
  const host = glowPoints(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), {
    size: 0.3,
    color: 0xffd9a8,
    opacity: 0.6,
    maxPx: 4.5,
    near: 7,
  });
  // a compact core plus a wide, faint nucleus glow: bright from afar, but the disk stays visible close up
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xfff1d6, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.scale.setScalar(3.2);
  const nucleus = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffe2b8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  nucleus.scale.setScalar(14);
  const engine = new THREE.Group();
  const diskUniforms = { uTime: { value: 0 }, ...OUTPUT };
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 4.45, 128, 6),
    new THREE.ShaderMaterial({
      uniforms: diskUniforms,
      vertexShader: `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: DISK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.rotation.x = -Math.PI / 2;
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  // jet particles stream outward; position along the jet, angle and radius come from independent draws
  // (tying the angle to the same seed as the position would draw a helix, a coil spring)
  const jn = 3200;
  const jpos = new Float32Array(jn * 3);
  const jcol = new Float32Array(jn * 3);
  const seeds = new Float32Array(jn);
  const angs = new Float32Array(jn);
  const rads = new Float32Array(jn);
  for (let i = 0; i < jn; i++) {
    seeds[i] = rng.uniform();
    angs[i] = rng.uniform() * Math.PI * 2;
    rads[i] = Math.sqrt(rng.uniform());
  }
  const jetGeo = new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(jpos, 3))
    .setAttribute('color', new THREE.BufferAttribute(jcol, 3));
  const jets = glowPoints(jetGeo, { size: 0.3, opacity: 0.95, maxPx: 7, near: 3, vertexColors: true });
  // jet glow: a beam that is brightest along its axis near the base and fades toward its far end
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x7fc4ff) }, uOpacity: { value: 0.22 }, ...OUTPUT },
    vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; ${OUTPUT_GLSL} varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ float facing = abs(dot(normalize(vN), normalize(vV)));
      gl_FragColor = vec4(outColor(uColor), outAlpha(uOpacity * pow(facing, 2.0) * pow(vH, 1.3))); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  [1, -1].forEach((side) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 34, 32, 1, true), coneMat);
    cone.position.y = side * 17.5;
    cone.rotation.z = side > 0 ? Math.PI : 0;
    engine.add(cone);
  });
  engine.add(disk, hole, jets);
  engine.rotation.set(1.25, 0.2, 0.35);
  g.add(host, nucleus, core, engine);
  return {
    group: g,
    engine,
    glows: [host, jets],
    animate(time) {
      diskUniforms.uTime.value = time;
      const arr = jetGeo.attributes.position.array;
      const col = jetGeo.attributes.color.array;
      for (let i = 0; i < jn; i++) {
        const s = (seeds[i] + time * 0.12) % 1;
        const side = i % 2 === 0 ? 1 : -1;
        const len = s * 34;
        const spread = (0.08 + len * 0.05) * rads[i];
        arr[i * 3] = Math.cos(angs[i]) * spread;
        arr[i * 3 + 1] = side * (0.7 + len);
        arr[i * 3 + 2] = Math.sin(angs[i]) * spread;
        const b = Math.pow(1 - s, 1.6); // brightest at the base, fading outward
        col[i * 3] = 0.66 * b;
        col[i * 3 + 1] = 0.85 * b;
        col[i * 3 + 2] = b;
      }
      jetGeo.attributes.position.needsUpdate = true;
      jetGeo.attributes.color.needsUpdate = true;
    },
  };
}

function makeGalaxyField(rng) {
  const n = 520;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = rng.unitVector();
    const r = 600 + rng.uniform() * 2400;
    pos.set([v[0] * r, v[1] * r * 0.6, v[2] * r], i * 3);
    const warm = rng.uniform();
    col.set([0.8 + 0.2 * warm, 0.75 + 0.15 * warm, 1 - 0.3 * warm], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 26, map: softDot(), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
}

function makeStars(rng) {
  const n = 6000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set(rng.unitVector().map((x) => x * 30000), i * 3);
  const pts = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0xcfe0ff, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  pts.frustumCulled = false;
  return pts;
}

/** Streaks rushing past the camera (attached to it each frame): the feel of a fast flight. */
function makeWarp(rng, count) {
  const pos = new Float32Array(count * 2 * 3);
  const seed = new Float32Array(count * 2 * 3);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = rng.uniform() * Math.PI * 2;
    const r = 20 + Math.pow(rng.uniform(), 0.5) * 380;
    const s = [Math.cos(a) * r, Math.sin(a) * r, rng.uniform() * 2400];
    for (let k = 0; k < 2; k++) {
      seed.set(s, (i * 2 + k) * 3);
      end[i * 2 + k] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const uniforms = { uTime: { value: 0 }, uSpeed: { value: 2400 }, uLen: { value: 120 }, uOpacity: { value: 0 }, ...OUTPUT };
  const lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ vertexShader: WARP_VERT, fragmentShader: WARP_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lines.frustumCulled = false;
  return { lines, uniforms };
}

/** Positions of the cosmos set pieces (the chapter's camera keys refer to these). */
export const COSMOS_LAYOUT = Object.freeze({
  earth: [0, 0, 0],
  galaxy: [0, 0, -6000],
  agn: [9000, 1200, -26000],
});

export function createCosmos() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01030a);
  const rng = createStream(5, 'cosmos');
  const stars = makeStars(rng);
  const earth = makeEarth();
  const spiral = makeSpiral(rng, 16000, 900, 0xfff1d0, 0x8fb4ff);
  spiral.position.set(...COSMOS_LAYOUT.galaxy);
  spiral.rotation.set(0.55, 0, 0.18);
  const field = makeGalaxyField(rng);
  field.position.set(...COSMOS_LAYOUT.agn);
  const agn = makeAgn(rng);
  agn.group.position.set(...COSMOS_LAYOUT.agn);
  const warp = makeWarp(rng, 900);

  // the neutrino's path into the Earth: dashed in space, bright through the crust
  const dep = 5.69 * DEG;
  const entry = new THREE.Vector3(Math.sin(2 * dep), -Math.cos(2 * dep), 0);
  const pole = new THREE.Vector3(0, -1, 0);
  const travel = pole.clone().sub(entry).normalize();
  const far = entry.clone().addScaledVector(travel, -6);
  const nuGeo = new LineSegmentsGeometry();
  nuGeo.setPositions([...far.toArray(), ...entry.toArray()]);
  const nuMat = new LineMaterial({ color: 0xc9b6ff, linewidth: 2.4, dashed: true, dashSize: 0.05, gapSize: 0.035, transparent: true, depthWrite: false, worldUnits: false });
  const nuPath = new LineSegments2(nuGeo, nuMat);
  nuPath.frustumCulled = false;
  const chordGeo = new LineSegmentsGeometry();
  chordGeo.setPositions([...entry.toArray(), ...pole.toArray()]);
  const chordMat = new LineMaterial({ color: 0xffe08a, linewidth: 3, transparent: true, depthTest: false, depthWrite: false, worldUnits: false });
  const chord = new LineSegments2(chordGeo, chordMat);
  chord.frustumCulled = false;
  chord.renderOrder = 10;

  // the long journey line from the blazar to Earth (for the flight back)
  const agnV = new THREE.Vector3(...COSMOS_LAYOUT.agn);
  const jGeo = new LineSegmentsGeometry();
  jGeo.setPositions([...agnV.toArray(), ...far.toArray()]);
  const jMat = new LineMaterial({ color: 0xc9b6ff, linewidth: 2, dashed: true, dashSize: 200, gapSize: 140, transparent: true, depthWrite: false, worldUnits: false });
  const journey = new LineSegments2(jGeo, jMat);
  journey.computeLineDistances();
  journey.frustumCulled = false;
  scene.add(stars, earth.group, spiral, field, agn.group, nuPath, chord, journey, warp.lines);

  const groups = { earth: earth.group, spiral, field, agn: agn.group, nu: nuPath, chord, journey };
  const fat = [nuMat, chordMat, jMat];
  return {
    scene,
    groups,
    anchors: { pole: [0, -1.06, 0], entry: entry.toArray(), chordMid: entry.clone().lerp(pole, 0.5).multiplyScalar(1.02).toArray(), agnCore: COSMOS_LAYOUT.agn, galaxy: COSMOS_LAYOUT.galaxy },
    /**
     * vis: {earth, spiral, field, agn, nu, chord, journey} in [0, 1]; nuProgress in [0, 1];
     * warp: {opacity, speed}; camera: the active camera (warp field rides with it); resolution [w, h]
     */
    update(time, vis, nuProgress, { warp: w = null, camera = null, resolution = [1280, 720], pixelScale = 800 } = {}) {
      agn.animate(time);
      Object.entries(groups).forEach(([k, obj]) => {
        const a = vis[k] ?? 0;
        obj.visible = a > 0.01;
        obj.traverse((o) => {
          if (o.material && o.material.transparent) {
            o.material.userData.base ??= o.material.opacity;
            o.material.opacity = o.material.userData.base * a;
          }
        });
      });
      fat.forEach((m) => m.resolution.set(resolution[0], resolution[1]));
      agn.glows.forEach((pts) => syncGlow(pts, pixelScale));
      const p = Math.max(0, Math.min(1, nuProgress));
      const head = far.clone().lerp(pole, p);
      const ratio = far.distanceTo(entry) / far.distanceTo(pole);
      const pastEntry = p > ratio;
      nuGeo.setPositions([...far.toArray(), ...(pastEntry ? entry : head).toArray()]);
      nuPath.computeLineDistances();
      chord.visible = chord.visible && pastEntry;
      chordGeo.setPositions([...entry.toArray(), ...head.toArray()]);
      // warp streaks ride with the camera
      const on = w && w.opacity > 0.01 && camera;
      warp.lines.visible = Boolean(on);
      if (on) {
        warp.lines.position.copy(camera.position);
        warp.lines.quaternion.copy(camera.quaternion);
        warp.uniforms.uTime.value = time;
        warp.uniforms.uSpeed.value = w.speed;
        warp.uniforms.uLen.value = Math.min(600, w.speed * 0.08);
        warp.uniforms.uOpacity.value = w.opacity;
      }
    },
  };
}
