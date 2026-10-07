// The physics layer of one event, drawn as a pure function of physical time t (ns):
// neutrino marker (dashed, violet; a marker, not light), muon (warm white), hadronic shower sparks
// (amber), and sampled Cherenkov photons (blue-white). Detected photons end on their DOM exactly
// when it records; "ambient" photons fly out on the Cherenkov cone and fade (absorbed or scattered away).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { softDot } from './textures.js';
import { photonPosition } from '../science/event.js';
import { C_VACUUM, C_ICE, THETA_C } from '../science/constants.js';
import { v3, orthoBasis, clamp, smoothstep } from '../core/math.js';

const PHOTON_TAIL_NS = 30;
const AMBIENT_TAIL_NS = 70;

function rgbaLines(maxSegments) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegments * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSegments * 8), 4));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

function rgbaPoints(max, sizePx, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 4), 4));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size: sizePx,
    sizeAttenuation: false,
    map: softDot(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function tube(color, opacity = 1) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.frustumCulled = false;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
function placeTube(mesh, from, to, radius) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.visible = len > 1e-3;
  if (!mesh.visible) return;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(radius, len, radius);
}

function sprite(color, sizeWorld) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(sizeWorld);
  return s;
}

export function createEventView(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // the neutrino's path: a dashed fat line (a marker of the path, not light)
  const nuGeo = new LineSegmentsGeometry();
  nuGeo.setPositions([0, 0, 0, 1, 1, 1]);
  const nuMat = new LineMaterial({ color: 0xc9b6ff, linewidth: 2.4, dashed: true, dashSize: 20, gapSize: 13, transparent: true, depthWrite: false, worldUnits: false });
  const nuLine = new LineSegments2(nuGeo, nuMat);
  nuLine.frustumCulled = false;
  const muGlow = tube(0x9fd8ff, 0.18);
  const nuMarker = sprite(0xe4d8ff, 26);
  const nuRing = sprite(0xb79cff, 52);
  nuRing.material.opacity = 0.35;
  const muon = tube(0xfff0d0, 0.95);
  const muHead = sprite(0xfff3dc, 30);
  const atm = tube(0xd8dde4, 0.7);
  const atmHead = sprite(0xe8edf2, 22);
  const sparks = rgbaLines(80);
  sparks.material.blending = THREE.NormalBlending;
  const detLines = rgbaLines(900);
  const detHeads = rgbaPoints(900, 6, 0xffffff);
  const ambLines = rgbaLines(2600);
  const ambHeads = rgbaPoints(2600, 4, 0xffffff);
  const angle = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 40), 3)),
    new THREE.LineBasicMaterial({ color: 0xffd666, transparent: true, opacity: 0.9 }),
  );
  angle.frustumCulled = false;
  const focus = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 64), 3)),
    new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  focus.frustumCulled = false;
  focus.visible = false;
  group.add(nuLine, nuRing, nuMarker, muGlow, muon, muHead, atm, atmHead, sparks, ambLines, ambHeads, detLines, detHeads, angle, focus);

  let ev = null;
  let detected = [];
  let anglePoint = null;

  function buildAngle() {
    const src = ev.sources.find((s) => s.type === 'track' && s.kind === 'track');
    if (!src) {
      anglePoint = null;
      return;
    }
    const P = v3.addScaled(src.start, src.dir, 110);
    const [u] = orthoBasis(src.dir);
    const cdir = v3.add(v3.scale(src.dir, Math.cos(THETA_C)), v3.scale(u, Math.sin(THETA_C)));
    const L = 150;
    const pts = [...P, ...v3.addScaled(P, src.dir, L), ...P, ...v3.addScaled(P, cdir, L)];
    const R = 70;
    for (let i = 0; i < 18; i++) {
      const a0 = (THETA_C * i) / 18;
      const a1 = (THETA_C * (i + 1)) / 18;
      const p0 = v3.addScaled(P, v3.add(v3.scale(src.dir, Math.cos(a0)), v3.scale(u, Math.sin(a0))), R);
      const p1 = v3.addScaled(P, v3.add(v3.scale(src.dir, Math.cos(a1)), v3.scale(u, Math.sin(a1))), R);
      pts.push(...p0, ...p1);
    }
    angle.geometry.attributes.position.array.set(pts);
    angle.geometry.attributes.position.needsUpdate = true;
    angle.geometry.setDrawRange(0, pts.length / 3);
    const mid = THETA_C / 2;
    anglePoint = v3.addScaled(P, v3.add(v3.scale(src.dir, Math.cos(mid)), v3.scale(u, Math.sin(mid))), R + 28);
  }

  function setEvent(next) {
    ev = next;
    detected = [];
    ev.pulses.forEach((pl) => pl.photons.forEach((ph) => detected.push({ ph, kind: pl.kind })));
    buildAngle();
  }

  function writeSeg(lines, i, a, b, rgb, alphaA, alphaB) {
    const pos = lines.geometry.attributes.position.array;
    const col = lines.geometry.attributes.color.array;
    pos.set(a, i * 6);
    pos.set(b, i * 6 + 3);
    col.set([rgb[0], rgb[1], rgb[2], alphaA, rgb[0], rgb[1], rgb[2], alphaB], i * 8);
  }

  function writePoint(points, i, p, rgb, alpha) {
    points.geometry.attributes.position.array.set(p, i * 3);
    points.geometry.attributes.color.array.set([rgb[0], rgb[1], rgb[2], alpha], i * 4);
  }

  function finish(obj, count) {
    obj.geometry.setDrawRange(0, count);
    obj.geometry.attributes.position.needsUpdate = true;
    obj.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * Draw the state at physical time t. opts.physics = layer opacity (0 hides everything here);
   * opts.camDist scales line thickness so the muon stays a few pixels wide at any zoom.
   * Returns world anchors for HTML labels.
   */
  function update(t, { physics = 1, camDist = 1500, showAngle = false, nuOnly = false, resolution = [1280, 720] } = {}) {
    group.visible = Boolean(ev) && physics > 0.001;
    const anchors = { nu: null, mu: null, x: null, atm: null, angle: null };
    if (!group.visible) return anchors;
    const thick = clamp(camDist * 0.0011, 0.03, 5);
    const a = physics;
    const { dir, end: vtx, approach } = ev.neutrino;

    // neutrino: dashed incoming path up to the marker; after the interaction the path stays faint
    const start = v3.addScaled(vtx, dir, -approach);
    const head = t < 0 ? v3.addScaled(vtx, dir, Math.max(-approach, C_VACUUM * t)) : vtx;
    nuGeo.setPositions([...start, ...head]);
    nuLine.computeLineDistances();
    nuMat.opacity = a * (t < 0 ? 0.95 : 0.4);
    nuMat.dashSize = thick * 16;
    nuMat.gapSize = thick * 10;
    nuMat.resolution.set(resolution[0], resolution[1]);
    const nuVisible = t < 0 && t > -approach / C_VACUUM;
    nuMarker.visible = nuRing.visible = nuVisible;
    if (nuVisible) {
      nuMarker.position.set(...head);
      nuRing.position.set(...head);
      nuMarker.scale.setScalar(thick * 9);
      nuRing.scale.setScalar(thick * 20 * (1 + 0.15 * Math.sin(t * 0.02)));
      nuMarker.material.opacity = a;
      anchors.nu = head;
    }

    // charged secondaries exist only after the interaction (t >= 0)
    const tracks = ev.sources.filter((s) => s.type === 'track');
    const main = tracks.find((s) => s.kind === 'track');
    muon.visible = muHead.visible = muGlow.visible = false;
    if (main && t >= main.t0 && !nuOnly) {
      const len = Math.min(main.length, (t - main.t0) * C_VACUUM);
      const tip = v3.addScaled(main.start, main.dir, len);
      placeTube(muon, main.start, tip, thick * 0.9);
      placeTube(muGlow, main.start, tip, thick * 3.2);
      muon.material.opacity = 0.95 * a;
      muGlow.material.opacity = 0.16 * a;
      muHead.visible = len < main.length;
      muHead.position.set(...tip);
      muHead.scale.setScalar(thick * 14);
      muHead.material.opacity = a;
      anchors.mu = v3.addScaled(main.start, main.dir, Math.min(len, 260));
    }
    const bg = tracks.find((s) => s.kind === 'atm');
    atm.visible = atmHead.visible = false;
    if (bg && t >= bg.t0) {
      const len = Math.min(bg.length, (t - bg.t0) * C_VACUUM);
      const tip = v3.addScaled(bg.start, bg.dir, len);
      placeTube(atm, bg.start, tip, thick * 0.75);
      atm.material.opacity = 0.75 * a;
      atmHead.visible = len < bg.length;
      atmHead.position.set(...tip);
      atmHead.scale.setScalar(thick * 11);
      anchors.atm = v3.addScaled(bg.start, bg.dir, Math.min(len, 1100));
    }

    // hadronic shower X: short amber tracks from the vertex, gone after ~60 ns
    let ns = 0;
    if (t >= 0 && !nuOnly) {
      const fade = 1 - smoothstep(40, 110, t);
      ev.sparks.forEach((sp) => {
        const l = Math.min(sp.length, t * C_VACUUM);
        writeSeg(sparks, ns++, vtx, v3.addScaled(vtx, sp.dir, l), [1, 0.7, 0.32], 0.9 * fade * a, 0.9 * fade * a);
      });
      if (fade > 0.01) anchors.x = v3.addScaled(vtx, ev.sparks[0].dir, 8);
    }
    finish(sparks, ns * 2);

    // ambient Cherenkov photons
    let na = 0;
    if (!nuOnly) {
      for (const ph of ev.ambient) {
        if (t < ph.te) continue;
        const d = (t - ph.te) * C_ICE;
        if (d > ph.length) continue;
        const fadeOut = 1 - smoothstep(ph.length * 0.65, ph.length, d);
        const p = v3.addScaled(ph.origin, ph.dir, d);
        const q = v3.addScaled(ph.origin, ph.dir, Math.max(0, d - AMBIENT_TAIL_NS * C_ICE));
        const rgb = ph.src === 'atm' ? [0.75, 0.8, 0.88] : [0.55, 0.82, 1.0];
        writeSeg(ambLines, na, q, p, rgb, 0, 0.7 * fadeOut * a);
        writePoint(ambHeads, na, p, rgb, 0.9 * fadeOut * a);
        na += 1;
        if (na >= 2600) break;
      }
    }
    finish(ambLines, na * 2);
    finish(ambHeads, na);

    // detected photons: in flight between emission and arrival
    let nd = 0;
    if (!nuOnly) {
      for (const { ph, kind } of detected) {
        const p = photonPosition(ph, t);
        if (!p) continue;
        const q = photonPosition(ph, Math.max(ph.te, t - PHOTON_TAIL_NS)) || p;
        const rgb = kind === 'atm' ? [0.85, 0.88, 0.95] : [0.75, 0.92, 1.0];
        writeSeg(detLines, nd, q, p, rgb, 0, 0.85 * a);
        writePoint(detHeads, nd, p, rgb, 1.0 * a);
        nd += 1;
        if (nd >= 900) break;
      }
    }
    finish(detLines, nd * 2);
    finish(detHeads, nd);

    focus.material.opacity = 0.95 * a;
    angle.visible = showAngle && Boolean(anglePoint);
    angle.material.opacity = 0.9 * a;
    if (angle.visible) anchors.angle = anglePoint;
    return anchors;
  }

  /** Highlight the full sample light paths behind one record (null clears). */
  function setFocus(photons) {
    if (!photons || photons.length === 0) {
      focus.visible = false;
      return;
    }
    const pts = [];
    photons.forEach((ph) => {
      for (let i = 1; i < ph.pts.length && pts.length < 3 * 2 * 64; i++) pts.push(...ph.pts[i - 1], ...ph.pts[i]);
    });
    focus.geometry.attributes.position.array.set(pts);
    focus.geometry.attributes.position.needsUpdate = true;
    focus.geometry.setDrawRange(0, pts.length / 3);
    focus.visible = true;
  }

  return { group, setEvent, update, setFocus, focus };
}
