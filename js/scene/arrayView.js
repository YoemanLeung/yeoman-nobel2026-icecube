// Strings and DOMs.
// Strings are drawn as screen-space fat lines (a schematic choice: a real cable is 3 cm thick and
// would vanish), brighter along the instrumented section. 5,160 DOMs are one Points draw call with a
// bead shader. "True size" draws each DOM at 33 cm; "enlarged markers" keeps positions and sets a
// minimum on-screen size. A DOM that recorded light becomes a flat coloured data marker (colour = time,
// size = charge) and gets a brief expanding ring: annotations of a record, not light from the DOM.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { DOM_DIAMETER } from '../science/constants.js';
import { OUTPUT, OUTPUT_GLSL } from './colorspace.js';

const VERT = `
  attribute float aHitT;
  attribute float aQ;
  attribute vec3 aColT;
  attribute vec3 aColR;
  attribute float aSel;
  attribute float aKind;
  attribute float aHide;
  uniform float uTime;
  uniform float uRecord;
  uniform float uReco;
  uniform float uMode;
  uniform float uPixelScale;
  uniform float uIdleAlpha;
  uniform float uPop;
  uniform float uFogDensity;
  uniform float uIdleMin;
  uniform float uDpr;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHit;
  varying float vSel;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.01);
    float realPx = ${DOM_DIAMETER.toFixed(3)} * uPixelScale / depth;
    float hit = step(aHitT, uTime) * step(0.001, uRecord);
    float age = uTime - aHitT;
    float pop = hit * (1.0 - smoothstep(0.0, uPop, age));
    float idlePx = mix(realPx, max(realPx, uIdleMin * uDpr), uMode);
    float hitPx = mix(max(realPx, 2.0 * uDpr), max(realPx, (3.8 + 2.5 * log2(1.0 + aQ)) * uDpr), uMode) * (1.0 + 0.8 * pop);
    float size = mix(idlePx, hitPx, hit);
    size *= 1.0 + 0.6 * step(0.5, aSel);
    gl_PointSize = clamp(size, 0.0, 220.0);
    float fog = exp(-uFogDensity * uFogDensity * depth * depth);
    float coverage = clamp(size, 0.0, 1.0);
    vColor = mix(aColT, aColR, uReco);
    vHit = hit;
    vSel = aSel;
    vKind = aKind;
    float idleA = uIdleAlpha * coverage * (0.35 + 0.65 * fog);
    float hitA = uRecord * (0.3 + 0.7 * fog);
    vAlpha = mix(idleA, hitA, hit) * (1.0 - aHide);
  }
`;

const FRAG = `
  ${OUTPUT_GLSL}
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHit;
  varying float vSel;
  varying float vKind;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float edge = 1.0 - smoothstep(0.82, 1.0, r2);
    vec3 col;
    float a = vAlpha * edge;
    if (vHit > 0.5) {
      // flat data marker: bright face, thin dark ring; noise hits are drawn hollow
      float ring = smoothstep(0.62, 0.8, r2);
      col = mix(vColor * 1.08, vColor * 0.4, ring * 0.75);
      if (vKind > 0.5 && vKind < 1.5) { a *= smoothstep(0.35, 0.55, r2); }
    } else {
      // glass bead: soft body, bright rim, a highlight toward the light
      float rim = smoothstep(0.3, 1.0, r2);
      float glint = 1.0 - smoothstep(0.0, 0.14, length(p - vec2(-0.32, -0.34)));
      col = vec3(0.62, 0.78, 0.92) * (0.58 + 0.5 * rim) + glint * 0.55;
    }
    if (vSel > 0.5) {
      float ring = smoothstep(0.72, 0.8, r2) * (1.0 - smoothstep(0.9, 1.0, r2));
      col = mix(col, vec3(1.0), ring);
      a = max(a, ring);
    }
    gl_FragColor = vec4(outColor(col), outAlpha(a));
  }
`;

// expanding ring around a DOM for a short physical-time window after it records
const RIPPLE_VERT = `
  attribute float aHitT;
  attribute vec3 aColT;
  uniform float uTime;
  uniform float uWindow;
  uniform float uRecord;
  uniform float uDpr;
  varying vec3 vColor;
  varying float vK;
  void main() {
    float k = (uTime - aHitT) / uWindow;
    bool on = k >= 0.0 && k <= 1.0 && uRecord > 0.5;
    vK = clamp(k, 0.0, 1.0);
    vColor = aColT;
    // an idle point goes outside the clip volume: a size-0 point is still drawn as one pixel on
    // some GPUs, so a zero size alone does not hide it
    gl_Position = on ? projectionMatrix * (modelViewMatrix * vec4(position, 1.0)) : vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = on ? (10.0 + 46.0 * k) * uDpr : 1.0;
  }
`;
const RIPPLE_FRAG = `
  ${OUTPUT_GLSL}
  varying vec3 vColor;
  varying float vK;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float ring = 1.0 - smoothstep(0.0, 0.08, abs(r - 0.82));
    float a = ring * (1.0 - vK) * 0.75;
    if (a < 0.01) discard;
    gl_FragColor = vec4(outColor(vColor), outAlpha(a));
  }
`;

const GLASS_VERT = `
  varying vec3 vN; varying vec3 vV;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv; }
`;
const GLASS_FRAG = `
  ${OUTPUT_GLSL}
  varying vec3 vN; varying vec3 vV;
  void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
    vec3 L = normalize(vec3(-0.4, 0.6, 0.7)); vec3 H = normalize(L + vV); float spec = pow(max(dot(normalize(vN), H), 0.0), 160.0);
    gl_FragColor = vec4(outColor(vec3(0.75, 0.9, 1.0) * (0.25 + f) + spec * 0.35), outAlpha(0.07 + 0.5 * f + spec * 0.25)); }
`;

/** A detailed DOM for the close-up: glass sphere, down-facing 10-inch PMT, mainboard, harness, cable. */
function makeDomModel() {
  const g = new THREE.Group();
  const R = DOM_DIAMETER / 2;
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(R, 56, 40),
    new THREE.ShaderMaterial({ vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, uniforms: { ...OUTPUT }, transparent: true, depthWrite: false }),
  );
  glass.renderOrder = 5;
  const pmt = new THREE.Mesh(
    new THREE.SphereGeometry(0.127, 40, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.25, metalness: 0.55, emissive: 0x120a06 }),
  );
  pmt.position.y = -0.005;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.06, 0.07, 24), new THREE.MeshStandardMaterial({ color: 0x242a30, roughness: 0.6 }));
  neck.position.y = 0.03;
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.006, 40), new THREE.MeshStandardMaterial({ color: 0x1f6b3f, roughness: 0.55 }));
  board.position.y = 0.075;
  const chips = new THREE.Group();
  [[0.04, 0.02], [-0.05, 0.03], [0.0, -0.06], [0.06, -0.04]].forEach(([x, z], i) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.03 + 0.01 * i, 0.008, 0.022), new THREE.MeshStandardMaterial({ color: 0x15171a }));
    c.position.set(x, 0.082, z);
    chips.add(c);
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8c949c, roughness: 0.35, metalness: 0.8 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.009, 10, 64), metal);
  band.rotation.x = Math.PI / 2;
  const strapA = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, 0.005, 8, 64, Math.PI), metal);
  strapA.rotation.y = Math.PI / 2;
  const strapB = strapA.clone();
  strapB.rotation.z = Math.PI;
  const penetrator = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16), metal);
  penetrator.position.set(-0.09, 0.13, -0.01);
  penetrator.rotation.z = 0.6;
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.7 });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 36, 16), cableMat);
  cable.position.set(-0.3, 0, -0.08);
  const lead = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(-0.11, 0.15, -0.02), new THREE.Vector3(-0.2, 0.26, -0.05), new THREE.Vector3(-0.29, 0.34, -0.08)]),
      20,
      0.008,
      8,
    ),
    cableMat,
  );
  g.add(pmt, neck, board, chips, band, strapA, strapB, penetrator, cable, lead, glass);
  return g;
}

function fatLines(positions, colors, width, opacity) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);
  geo.setColors(colors);
  const mat = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, opacity, depthWrite: false, worldUnits: false });
  mat.fog = true; // in the ice, distant strings fade into the dark like everything else
  const lines = new LineSegments2(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

export function createArrayView(scene, array) {
  const n = array.doms.length;
  const group = new THREE.Group();

  // strings: instrumented sections bright, cables above them dimmer; colours fade toward the top
  const upperPos = [];
  const upperCol = [];
  const instrPos = [];
  const instrCol = [];
  array.strings.forEach((s) => {
    const top = array.doms[s.firstDom].pos[1];
    const bottom = array.doms[s.firstDom + 59].pos[1];
    upperPos.push(s.x, 0, s.z, s.x, top, s.z);
    upperCol.push(0.22, 0.34, 0.45, 0.42, 0.62, 0.8);
    instrPos.push(s.x, top, s.z, s.x, bottom, s.z);
    instrCol.push(0.62, 0.86, 1.0, 0.5, 0.74, 0.95);
  });
  const upperLines = fatLines(new Float32Array(upperPos), new Float32Array(upperCol), 1.2, 0.5);
  const instrLines = fatLines(new Float32Array(instrPos), new Float32Array(instrCol), 1.9, 0.75);
  group.add(upperLines, instrLines);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(array.positions, 3));
  const attr = (size, fill = 0) => new THREE.BufferAttribute(new Float32Array(n * size).fill(fill), size);
  geo.setAttribute('aHitT', attr(1, 1e9));
  geo.setAttribute('aQ', attr(1, 0));
  geo.setAttribute('aColT', attr(3, 1));
  geo.setAttribute('aColR', attr(3, 1));
  geo.setAttribute('aSel', attr(1, 0));
  geo.setAttribute('aKind', attr(1, 0));
  geo.setAttribute('aHide', attr(1, 0));
  const uniforms = {
    uTime: { value: -1e9 },
    uRecord: { value: 1 },
    uReco: { value: 0 },
    uMode: { value: 1 },
    uPixelScale: { value: 800 },
    uIdleAlpha: { value: 0.7 },
    uPop: { value: 110 },
    uFogDensity: { value: 0.0002 },
    uIdleMin: { value: 2.6 },
    uDpr: { value: 1 },
    ...OUTPUT,
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  group.add(points);

  // ripples share the record attributes
  const rippleGeo = new THREE.BufferGeometry();
  rippleGeo.setAttribute('position', geo.attributes.position);
  rippleGeo.setAttribute('aHitT', geo.attributes.aHitT);
  rippleGeo.setAttribute('aColT', geo.attributes.aColT);
  const rippleUniforms = { uTime: uniforms.uTime, uRecord: { value: 1 }, uDpr: uniforms.uDpr, uWindow: { value: 160 }, ...OUTPUT };
  const ripples = new THREE.Points(
    rippleGeo,
    new THREE.ShaderMaterial({ vertexShader: RIPPLE_VERT, fragmentShader: RIPPLE_FRAG, uniforms: rippleUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ripples.frustumCulled = false;
  group.add(ripples);

  const model = makeDomModel();
  model.visible = false;
  group.add(model);
  scene.add(group);

  let closeupDom = null;
  let selected = null;
  let hovered = null;

  const markSel = () => {
    const a = geo.attributes.aSel;
    a.array.fill(0);
    if (hovered !== null) a.array[hovered] = 1;
    if (selected !== null) a.array[selected] = 1;
    a.needsUpdate = true;
  };

  return {
    group,
    points,
    uniforms,
    model,
    lines: { upperLines, instrLines },
    /** Line widths in CSS px and the viewport size the line shader needs. */
    setLines({ width = 1.9, upperWidth = 1.2, opacity = 0.75, upperOpacity = 0.5, w, h }) {
      instrLines.material.linewidth = width;
      upperLines.material.linewidth = upperWidth;
      instrLines.material.opacity = opacity;
      upperLines.material.opacity = upperOpacity;
      instrLines.material.resolution.set(w, h);
      upperLines.material.resolution.set(w, h);
    },
    setRipples(on) {
      rippleUniforms.uRecord.value = on ? 1 : 0;
      ripples.visible = on;
    },
    /** Load the per-DOM record: list of {dom, t, q, kind}; colours computed by the caller. */
    setRecord(first, colorOf) {
      const hitT = geo.attributes.aHitT.array;
      const q = geo.attributes.aQ.array;
      const col = geo.attributes.aColT.array;
      const kind = geo.attributes.aKind.array;
      hitT.fill(1e9);
      q.fill(0);
      kind.fill(0);
      first.forEach((pl) => {
        hitT[pl.dom] = pl.t;
        q[pl.dom] = pl.q;
        kind[pl.dom] = pl.kind === 'noise' ? 1 : pl.kind === 'atm' ? 2 : 0;
        const c = colorOf(pl);
        col[pl.dom * 3] = c[0];
        col[pl.dom * 3 + 1] = c[1];
        col[pl.dom * 3 + 2] = c[2];
      });
      ['aHitT', 'aQ', 'aColT', 'aKind'].forEach((k) => (geo.attributes[k].needsUpdate = true));
    },
    setResidualColors(entries) {
      const col = geo.attributes.aColR.array;
      entries.forEach(({ dom, color }) => {
        col[dom * 3] = color[0];
        col[dom * 3 + 1] = color[1];
        col[dom * 3 + 2] = color[2];
      });
      geo.attributes.aColR.needsUpdate = true;
    },
    setCloseup(domId) {
      const hide = geo.attributes.aHide.array;
      hide.fill(0);
      closeupDom = domId;
      if (domId !== null) {
        hide[domId] = 1;
        model.position.set(...array.doms[domId].pos);
      }
      geo.attributes.aHide.needsUpdate = true;
    },
    setModelVisible(v) {
      model.visible = v && closeupDom !== null;
    },
    select(domId) {
      selected = domId;
      markSel();
    },
    hover(domId) {
      if (domId === hovered) return;
      hovered = domId;
      markSel();
    },
    get selected() {
      return selected;
    },
    /** Nearest DOM to a screen point among candidate ids (all DOMs if null). */
    pick(x, y, stage, candidates = null, radiusPx = 14) {
      let best = null;
      let bestD = radiusPx * radiusPx;
      const ids = candidates || array.doms.map((d) => d.id);
      for (const id of ids) {
        const p = stage.project(array.doms[id].pos);
        if (!p.visible) continue;
        const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          best = id;
        }
      }
      return best;
    },
  };
}
