// The IceCube Lab (ICL) at the centre of the array, modelled on photographs of it: a two-storey dark blue box
// raised on a white cross-braced steel frame, open steel stairs zig-zagging up its south face, and two white
// corrugated cable towers, one at each end, joined to the upper floor by enclosed bridges. The surface cables
// come up the towers and over the bridges into the server room on the upper floor (IceCube instrumentation
// paper, arXiv:1612.05093). There are no published drawings: sizes are read off photographs (box about
// 15 x 12 x 9.6 m on a 2.6 m frame, towers 4.8 m across and 13.6 m tall plus masts).
// +z is the south face (the one the tour's camera sees), +x east.

import * as THREE from 'three';
import { softDot, corrugationNormal } from './textures.js';

const BASE = 2.6; // underside of the box above the snow
const BOX = { w: 15, h: 9.6, d: 12 };
const FLOOR2 = BASE + 4.7; // upper floor
const ROOF = BASE + BOX.h;
const FRONT = BOX.d / 2; // the south face
const TOWER = { r: 2.4, h: 13.6, x: 15.9, z: -0.4, mast: 3.2 };
const BRIDGE_Y = FLOOR2 + 2.9; // centre of the cable bridges

/** Batches boxes and bars into one InstancedMesh per material (a unit cube, scaled per instance). */
function createKit(group) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const o = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const push = (mat) => {
    o.updateMatrix();
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(o.matrix.clone());
  };
  return {
    /** a box of size [sx, sy, sz] centred at [x, y, z], turned by ry about the vertical */
    box(mat, [sx, sy, sz], [x, y, z], ry = 0) {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.scale.set(sx, sy, sz);
      push(mat);
    },
    /** a square bar of thickness t from point a to point b */
    bar(mat, a, b, t = 0.12) {
      const va = new THREE.Vector3(...a);
      const d = new THREE.Vector3(...b).sub(va);
      const len = d.length();
      o.position.copy(va).addScaledVector(d, 0.5);
      o.quaternion.setFromUnitVectors(up, d.normalize());
      o.scale.set(t, len, t);
      push(mat);
    },
    /** a mesh with its own geometry */
    mesh(geo, mat, [x, y, z], rot = [0, 0, 0]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(...rot);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    },
    flush() {
      batches.forEach((list, mat) => {
        const im = new THREE.InstancedMesh(unit, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = true;
        im.receiveShadow = true;
        group.add(im);
      });
      batches.clear();
    },
  };
}

const lerp3 = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

/** A guard rail along a -> b (points on the walking surface): posts, a top rail and a mid rail. */
function railing(kit, mat, a, b, { h = 1.05, gap = 1.25 } = {}) {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / gap));
  for (let i = 0; i <= n; i++) {
    const p = lerp3(a, b, i / n);
    kit.bar(mat, p, [p[0], p[1] + h, p[2]], 0.05);
  }
  kit.bar(mat, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.055);
  kit.bar(mat, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.04);
}

/** An open steel stair rising from a (foot, centre line) to b (head), w wide: treads, stringers, rails. */
function stair(kit, m, a, b, w = 1.1) {
  const rise = b[1] - a[1];
  const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const ux = (b[0] - a[0]) / run;
  const uz = (b[2] - a[2]) / run;
  const side = [uz * (w / 2), 0, -ux * (w / 2)];
  const ry = Math.atan2(ux, uz);
  const n = Math.max(2, Math.round(rise / 0.19));
  for (let i = 0; i < n; i++) {
    const p = lerp3(a, b, (i + 0.5) / n);
    kit.box(m.grate, [w, 0.05, (run / n) * 1.05], [p[0], a[1] + (rise * (i + 1)) / n - 0.03, p[2]], ry);
  }
  [1, -1].forEach((s) => {
    const foot = [a[0] + s * side[0], a[1] - 0.12, a[2] + s * side[2]];
    const head = [b[0] + s * side[0], b[1] - 0.12, b[2] + s * side[2]];
    kit.bar(m.frame, foot, head, 0.16);
    railing(kit, m.dark, [foot[0], foot[1] + 0.12, foot[2]], [head[0], head[1] + 0.12, head[2]], { h: 1.0, gap: 1.4 });
  });
}

/** A grated platform between x0..x1, z0..z1 with its walking surface at y, on posts. */
function deck(kit, m, [x0, x1], [z0, z1], y, { posts = [] } = {}) {
  kit.box(m.grate, [x1 - x0, 0.12, z1 - z0], [(x0 + x1) / 2, y - 0.06, (z0 + z1) / 2]);
  kit.box(m.dark, [x1 - x0, 0.22, 0.14], [(x0 + x1) / 2, y - 0.2, z1 - 0.07]);
  posts.forEach(([x, z]) => kit.bar(m.dark, [x, 0, z], [x, y - 0.1, z], 0.16));
}

function materials() {
  const ribs = corrugationNormal(18);
  const clad = (color, repeat) => {
    const map = ribs.clone();
    map.repeat.set(repeat, 1);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6, normalMap: map, normalScale: new THREE.Vector2(0.8, 0.8) });
  };
  return {
    front: clad(0x274760, 4),
    end: clad(0x8796a8, 3.2),
    tower: clad(0xdfe4ea, 9),
    bridge: clad(0xc3cbd4, 2),
    trim: new THREE.MeshStandardMaterial({ color: 0x18202a, metalness: 0.4, roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1f2630, metalness: 0.5, roughness: 0.5 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xd6dce3, roughness: 0.6 }),
    grate: new THREE.MeshStandardMaterial({ color: 0x9ea8b3, metalness: 0.3, roughness: 0.7 }),
    duct: new THREE.MeshStandardMaterial({ color: 0xe4e8ed, roughness: 0.55 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc9d6e4, roughness: 0.95 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x241a10, emissive: 0xffc070, emissiveIntensity: 2.4 }),
    dim: new THREE.MeshStandardMaterial({ color: 0x141b26, emissive: 0x2a3b55, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.25 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffd28a, emissiveIntensity: 3 }),
    doorLamp: new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffd28a, emissiveIntensity: 1.2 }),
  };
}

/** The box: two storeys, a floor band, a roof edge with a rail, roof plant, portholes and doors. */
function addBody(kit, m) {
  // faces: +x, -x (the lighter ends), top, bottom, south, north
  kit.mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), [m.end, m.end, m.snow, m.front, m.front, m.front], [0, BASE + BOX.h / 2, 0]);
  kit.box(m.trim, [BOX.w + 0.1, 0.24, BOX.d + 0.1], [0, FLOOR2, 0]);
  // a low parapet round the (snow-covered) roof
  kit.box(m.trim, [BOX.w + 0.3, 0.34, 0.24], [0, ROOF + 0.13, FRONT + 0.03]);
  kit.box(m.trim, [BOX.w + 0.3, 0.34, 0.24], [0, ROOF + 0.13, -FRONT - 0.03]);
  kit.box(m.trim, [0.24, 0.34, BOX.d + 0.3], [BOX.w / 2 + 0.03, ROOF + 0.13, 0]);
  kit.box(m.trim, [0.24, 0.34, BOX.d + 0.3], [-BOX.w / 2 - 0.03, ROOF + 0.13, 0]);
  kit.box(m.trim, [BOX.w + 0.2, 0.3, BOX.d + 0.2], [0, BASE + 0.1, 0]);
  railing(kit, m.dark, [-BOX.w / 2, ROOF + 0.28, FRONT], [BOX.w / 2, ROOF + 0.28, FRONT]);
  railing(kit, m.dark, [BOX.w / 2, ROOF + 0.28, FRONT], [BOX.w / 2, ROOF + 0.28, -FRONT]);
  railing(kit, m.dark, [-BOX.w / 2, ROOF + 0.28, FRONT], [-BOX.w / 2, ROOF + 0.28, -FRONT]);
  kit.box(m.duct, [3.4, 1.5, 2.4], [-3.5, ROOF + 1.0, -2.5]);
  kit.box(m.grate, [2.2, 1.1, 1.8], [3.8, ROOF + 0.8, -3.6]);
  kit.bar(m.dark, [5.6, ROOF, -4.6], [5.6, ROOF + 3.4, -4.6], 0.08);
  // portholes: a few lit, the rest dark glass in dark frames
  const hole = new THREE.CircleGeometry(0.34, 20);
  const ring = new THREE.RingGeometry(0.34, 0.45, 20);
  [[-5.4, FLOOR2 + 2.3, 1], [-3.0, FLOOR2 + 2.3, 0], [1.6, FLOOR2 + 2.3, 1], [4.4, FLOOR2 + 2.3, 0], [-4.6, BASE + 2.4, 0], [-1.4, BASE + 2.4, 1], [4.2, BASE + 2.4, 1]].forEach(([x, y, lit]) => {
    kit.mesh(hole, lit ? m.glow : m.dim, [x, y, FRONT + 0.03]).scale.set(1, 1.35, 1);
    kit.mesh(ring, m.trim, [x, y, FRONT + 0.04]).scale.set(1, 1.35, 1);
  });
  // doors onto the lower walkway and the upper landing, with lit vision panels
  [[1.0, BASE], [-6.4, BASE], [2.6, FLOOR2]].forEach(([x, y]) => {
    kit.box(m.trim, [1.05, 2.15, 0.1], [x, y + 1.08, FRONT + 0.05]);
    kit.box(m.glow, [0.3, 0.42, 0.04], [x, y + 1.55, FRONT + 0.11]);
  });
  // the white duct on the east end
  kit.box(m.duct, [1.3, 1.7, 2.6], [BOX.w / 2 + 0.65, BASE + 1.2, 2.2]);
}

/** The frame under the box: dark columns, white X bracing, perimeter beams. */
function addFrame(kit, m) {
  const xs = [-7.1, -2.4, 2.4, 7.1];
  const zs = [-5.6, 5.6];
  xs.forEach((x) => zs.forEach((z) => kit.bar(m.dark, [x, 0, z], [x, BASE, z], 0.34)));
  zs.forEach((z) => {
    kit.box(m.dark, [BOX.w, 0.36, 0.3], [0, BASE - 0.2, z]);
    for (let i = 0; i < xs.length - 1; i++) {
      kit.bar(m.frame, [xs[i], 0.1, z], [xs[i + 1], BASE - 0.35, z], 0.13);
      kit.bar(m.frame, [xs[i + 1], 0.1, z], [xs[i], BASE - 0.35, z], 0.13);
    }
  });
  xs.forEach((x) => {
    kit.box(m.dark, [0.3, 0.36, BOX.d], [x, BASE - 0.2, 0]);
    kit.bar(m.frame, [x, 0.1, zs[0]], [x, BASE - 0.35, zs[1]], 0.13);
    kit.bar(m.frame, [x, 0.1, zs[1]], [x, BASE - 0.35, zs[0]], 0.13);
  });
}

/** The south face: walkway, stair landing, upper landing and the stairs between them, up to the roof. */
function addStairs(kit, m) {
  const zDeck = [FRONT, FRONT + 1.6];
  deck(kit, m, [-7.5, 3.6], zDeck, BASE, { posts: [[-7.4, FRONT + 1.5], [-2.5, FRONT + 1.5], [2.4, FRONT + 1.5]] });
  railing(kit, m.dark, [-4.9, BASE, FRONT + 1.6], [3.6, BASE, FRONT + 1.6]);
  // from the snow up to the west end of the walkway
  stair(kit, m, [-12.6, 0, FRONT + 0.8], [-7.5, BASE, FRONT + 0.8]);
  // a switchback stair tower east of the walkway: up to a landing, then back west to the upper landing
  stair(kit, m, [3.6, BASE, FRONT + 0.8], [6.6, (BASE + FLOOR2) / 2, FRONT + 0.8]);
  deck(kit, m, [6.6, 7.9], [FRONT, FRONT + 3.2], (BASE + FLOOR2) / 2, { posts: [[7.8, FRONT + 0.1], [7.8, FRONT + 3.1], [6.7, FRONT + 3.1]] });
  railing(kit, m.dark, [7.9, (BASE + FLOOR2) / 2, FRONT], [7.9, (BASE + FLOOR2) / 2, FRONT + 3.2]);
  stair(kit, m, [6.6, (BASE + FLOOR2) / 2, FRONT + 2.4], [3.6, FLOOR2, FRONT + 2.4]);
  deck(kit, m, [0.6, 3.6], [FRONT, FRONT + 3.2], FLOOR2, { posts: [[0.7, FRONT + 3.1], [3.5, FRONT + 3.1]] });
  railing(kit, m.dark, [0.6, FLOOR2, FRONT + 3.2], [3.6, FLOOR2, FRONT + 3.2]);
  railing(kit, m.dark, [0.6, FLOOR2, FRONT + 1.6], [0.6, FLOOR2, FRONT + 3.2]);
  // from the upper landing west along the face to the roof
  stair(kit, m, [0.6, FLOOR2, FRONT + 0.8], [-5.0, ROOF, FRONT + 0.8], 1.0);
}

/** A cable tower with its bridge to the upper floor, door, mast and drift; s = -1 west, +1 east. */
function addTower(kit, m, s) {
  const x = s * TOWER.x;
  const { r, h, z } = TOWER;
  kit.mesh(new THREE.CylinderGeometry(r, r, h, 40, 1), m.tower, [x, h / 2, z]);
  kit.mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.34, 40), m.frame, [x, h + 0.1, z]);
  kit.mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.12, 0.5, 40), m.dark, [x, 0.25, z]);
  kit.bar(m.dark, [x, h, z], [x, h + TOWER.mast, z], 0.1);
  kit.bar(m.dark, [x - 0.5, h + TOWER.mast - 0.5, z], [x + 0.5, h + TOWER.mast - 0.5, z], 0.05);
  kit.box(m.trim, [1.1, 2.2, 0.2], [x, 1.2, z + r - 0.02]);
  kit.box(m.doorLamp, [0.36, 0.2, 0.2], [x, 2.6, z + r + 0.1]);
  // the enclosed cable bridge into the upper floor, with a collar where it meets the tower
  const x0 = s * (BOX.w / 2);
  const x1 = s * (TOWER.x - r + 0.3);
  kit.box(m.bridge, [Math.abs(x1 - x0), 1.5, 1.8], [(x0 + x1) / 2, BRIDGE_Y, z]);
  kit.box(m.trim, [Math.abs(x1 - x0), 0.16, 1.9], [(x0 + x1) / 2, BRIDGE_Y - 0.8, z]);
  kit.box(m.end, [0.9, 2.1, 2.3], [s * (TOWER.x - r - 0.1), BRIDGE_Y, z]);
  const drift = kit.mesh(new THREE.SphereGeometry(1, 24, 12), m.snow, [x + s * 0.6, -0.35, z + 1.6]);
  drift.scale.set(4.2, 1.0, 3.4);
}

/** Warm wall lamps (real point lights only when the tier allows) and light pools on the snow. */
function addLights(group, kit, m, lamps) {
  [[1.0, BASE + 2.5, FRONT + 0.15], [-6.4, BASE + 2.5, FRONT + 0.15], [2.6, FLOOR2 + 2.5, FRONT + 0.15]].forEach(([x, y, z], i) => {
    kit.box(m.lamp, [0.42, 0.24, 0.24], [x + 0.75, y, z]);
    if (lamps && i < 2) {
      const light = new THREE.PointLight(0xffc27a, 50, 36, 2);
      light.position.set(x + 0.75, y - 0.3, z + 1.4);
      group.add(light);
    }
  });
  const pool = new THREE.MeshBasicMaterial({ map: softDot(), color: 0xffa955, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  [[-1.5, FRONT + 4, 24, 12], [-TOWER.x, TOWER.z + 4, 7, 6], [TOWER.x, TOWER.z + 4, 7, 6]].forEach(([x, z, w, d]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pool);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.08, z);
    group.add(p);
  });
}

export function makeLab({ lamps }) {
  const group = new THREE.Group();
  const kit = createKit(group);
  const m = materials();
  addBody(kit, m);
  addFrame(kit, m);
  addStairs(kit, m);
  addTower(kit, m, -1);
  addTower(kit, m, 1);
  addLights(group, kit, m, lamps);
  const drift = kit.mesh(new THREE.SphereGeometry(1, 24, 12), m.snow, [-3, -0.3, -FRONT - 1.5]);
  drift.scale.set(9, 0.9, 3);
  kit.flush();
  return group;
}
