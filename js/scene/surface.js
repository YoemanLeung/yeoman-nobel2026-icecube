// The South Pole in the polar night: sky (gradient, Milky Way, aurora), a twinkling star field, the
// snow plain, the IceCube Lab (lab.js) and, far off, the station. Mood lives here: cold blue light on
// snow, warm windows, a little aurora. Lit with moonlight + sky light; shadows on the high tier.

import * as THREE from 'three';
import { snowNormal, flagTexture } from './textures.js';
import { makeLab } from './lab.js';
import { OUTPUT, OUTPUT_GLSL } from './colorspace.js';
import { createStream } from '../core/rng.js';

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform float uTime;
  uniform float uAurora;
  ${OUTPUT_GLSL}
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zenith = vec3(0.010, 0.020, 0.052);
    vec3 mid = vec3(0.028, 0.062, 0.135);
    vec3 horizon = vec3(0.105, 0.19, 0.30);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zenith, smoothstep(0.22, 0.95, h));
    // warm haze low over the station
    col += vec3(0.20, 0.11, 0.05) * pow(max(0.0, dot(normalize(vec3(-0.62, 0.0, -0.78)), d)), 14.0) * (1.0 - smoothstep(-0.02, 0.18, h));
    // Milky Way: a soft band with dust lanes
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.55, -0.76))) * 3.0, 2.0));
    vec2 bp = vec2(atan(d.z, d.x) * 3.0, d.y * 6.0);
    col += vec3(0.075, 0.085, 0.12) * band * (0.55 + 0.6 * fbm(bp * 2.0) - 0.35 * fbm(bp * 5.0 + 3.0)) * smoothstep(0.03, 0.3, h);
    // aurora: two curtain layers with fine vertical rays, drifting slowly
    float az = atan(d.z, d.x);
    float base = smoothstep(0.06, 0.2, h) * (1.0 - smoothstep(0.42, 0.85, h));
    float c1 = fbm(vec2(az * 2.2 + uTime * 0.02, 1.3));
    float c2 = fbm(vec2(az * 3.7 - uTime * 0.035, 7.1));
    float fold = smoothstep(0.42, 0.75, c1) + 0.7 * smoothstep(0.5, 0.8, c2);
    float rays = 0.55 + 0.45 * noise(vec2(az * 140.0, uTime * 0.25)) * noise(vec2(az * 37.0, 2.0));
    float lift = smoothstep(0.08, 0.5, h);
    vec3 green = vec3(0.16, 0.95, 0.6);
    vec3 violet = vec3(0.62, 0.33, 0.96);
    vec3 aur = mix(green, violet, lift);
    col += aur * fold * rays * base * 0.62 * uAurora;
    gl_FragColor = vec4(outColor(col), 1.0);
  }
`;

const STAR_VERT = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uDpr;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.72 + 0.28 * sin(uTime * (1.3 + aPhase * 2.4) + aPhase * 40.0);
    float alt = normalize(position).y;
    vAlpha = tw * smoothstep(0.0, 0.07, alt);
    vColor = aColor;
    gl_PointSize = aSize * uDpr * (0.85 + 0.25 * tw);
  }
`;
const STAR_FRAG = `
  ${OUTPUT_GLSL}
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    float core = exp(-r * 7.0);
    float a = core * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(outColor(min(vColor * (0.45 + 0.4 * core), vec3(0.78))), outAlpha(a)); // stays under the bloom threshold
  }
`;

function makeSky(uniforms) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { ...uniforms, ...OUTPUT },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 32), mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

function makeStars(count, uniforms) {
  const rng = createStream(31, 'stars');
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = rng.unitVector();
    v[1] = Math.abs(v[1]) * 0.98 + 0.02;
    const l = Math.hypot(...v);
    pos.set(v.map((x) => (x / l) * 18000), i * 3);
    const m = Math.pow(rng.uniform(), 3.2);
    size[i] = 1.4 + m * 4.6;
    phase[i] = rng.uniform();
    const warm = rng.uniform();
    col.set(warm < 0.2 ? [1, 0.86, 0.7] : warm > 0.85 ? [0.75, 0.85, 1] : [0.95, 0.96, 1], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { ...uniforms, ...OUTPUT },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pts.renderOrder = -99;
  pts.frustumCulled = false;
  return pts;
}

function makeSnow(normal) {
  const near = new THREE.PlaneGeometry(1800, 1800, 150, 150);
  near.rotateX(-Math.PI / 2);
  const p = near.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const drift = Math.sin(x * 0.011 + z * 0.004) * 0.45 + Math.sin(x * 0.031 - z * 0.023) * 0.22 + Math.sin(z * 0.052) * 0.12;
    const edge = 1 - Math.min(1, Math.max(0, (r - 650) / 250));
    p.setY(i, drift * edge);
  }
  near.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9e4f0, roughness: 0.93, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55) });
  mat.normalMap.repeat.set(60, 60);
  const nearMesh = new THREE.Mesh(near, mat);
  nearMesh.receiveShadow = true;
  const farMat = mat.clone();
  farMat.normalMap = normal.clone();
  farMat.normalMap.repeat.set(900, 900);
  farMat.normalMap.needsUpdate = true;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), farMat);
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.6;
  return [nearMesh, far];
}

/** Amundsen-Scott station on the horizon: a long elevated building with a few lit windows. */
function makeStation() {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x3a4558, metalness: 0.3, roughness: 0.6 });
  const win = new THREE.MeshBasicMaterial({ color: 0xffc77c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(150, 14, 22), wall);
  body.position.y = 11;
  g.add(body);
  for (let i = 0; i < 9; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4, 8), wall);
    leg.position.set(-64 + i * 16, 2, 0);
    g.add(leg);
  }
  for (let i = 0; i < 22; i++) {
    if ((i * 11) % 7 < 3) continue;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), win);
    w.position.set(-66 + i * 6.3, 12 + ((i * 3) % 2) * 3.4, 11.1);
    g.add(w);
  }
  g.position.set(-760, 0, -940);
  g.rotation.y = 0.65;
  return g;
}

/** A line of route flags leading to the lab (they help the eye judge distance on a flat plain). */
function makeFlags() {
  const g = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  const flagMats = [new THREE.MeshStandardMaterial({ map: flagTexture('#c8342b'), side: THREE.DoubleSide, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: flagTexture('#1f4fae'), side: THREE.DoubleSide, roughness: 0.9 })];
  for (let i = 0; i < 16; i++) {
    const x = 70 + i * 34;
    const z = 46 + i * 9;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), pole);
    p.position.set(x, 1.3, z);
    p.castShadow = true;
    g.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), flagMats[i % 2]);
    f.position.set(x + 0.36, 2.35, z);
    f.rotation.y = 0.3;
    g.add(f);
  }
  return g;
}

export function createSurface(scene, { iceTop, tier }) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uAurora: { value: 1 }, uDpr: { value: 1 } };
  const sky = makeSky(uniforms);
  const stars = makeStars(Math.round(2600 * (tier.particles || 1)), uniforms);
  group.add(sky, stars);

  const [snowNear, snowFar] = makeSnow(snowNormal());
  group.add(snowNear, snowFar);
  const lab = makeLab({ lamps: tier.name === 'high' });
  group.add(lab, makeStation(), makeFlags());

  // IceTop tanks: low snow-covered drums at every station
  const tankGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.45, 18);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x5a6b80, roughness: 0.7 });
  const tanks = new THREE.InstancedMesh(tankGeo, tankMat, iceTop.length * 2);
  const m = new THREE.Matrix4();
  let k = 0;
  iceTop.forEach((pair) =>
    pair.forEach((p) => {
      m.makeTranslation(p[0], 0.15, p[2]);
      tanks.setMatrixAt(k++, m);
    }),
  );
  tanks.receiveShadow = true;
  group.add(tanks);

  // light: aurora-tinted sky light, a low moon (casts shadows on the high tier), faint ambient
  const hemi = new THREE.HemisphereLight(0x3d6a86, 0xc6d4e4, 0.75);
  const moon = new THREE.DirectionalLight(0xd7e4ff, 1.15);
  moon.position.set(-160, 120, 210);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = Boolean(tier.shadows);
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -60;
  moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 40;
  moon.shadow.camera.bottom = -30;
  moon.shadow.camera.near = 50;
  moon.shadow.camera.far = 600;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.04;
  group.add(hemi, moon, moon.target, new THREE.AmbientLight(0x1a2a40, 0.35));
  scene.add(group);

  const fog = new THREE.FogExp2(0x1b2e45, 0.00036);
  return {
    group,
    lab,
    setTier(next) {
      moon.castShadow = Boolean(next.shadows);
    },
    update(camera, time, { aurora = 1, dpr = 1 } = {}) {
      uniforms.uTime.value = time;
      uniforms.uAurora.value = aurora;
      uniforms.uDpr.value = dpr;
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      const above = camera.position.y > 0;
      group.visible = above;
      scene.fog = above ? fog : null;
    },
  };
}
