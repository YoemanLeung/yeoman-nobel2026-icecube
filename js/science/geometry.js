// Schematic geometry of the original 86-string IceCube array.
// Generated from the official spacing parameters, NOT from a surveyed coordinate file, and labelled
// "array schematic" in the UI. It keeps what matters for intuition: 78 standard strings on a
// 125 m triangular lattice with the characteristic hexagonal footprint, 8 denser DeepCore strings
// near the centre, 60 DOMs per string, 5,160 DOMs in total between 1,450 m and 2,450 m depth.

import {
  STRING_SPACING,
  DOMS_PER_STRING,
  DEPTH_TOP,
  DEPTH_BOTTOM,
  DEEPCORE,
  N_STRINGS,
  N_DOMS,
} from './constants.js';

// Strings per lattice row, north to south; row sums to 78 like the real layout.
const ROWS = [6, 7, 8, 9, 10, 10, 9, 8, 7, 4];
const ROW_STEP = (STRING_SPACING * Math.sqrt(3)) / 2; // 108.25 m

function standardStringPositions() {
  const positions = [];
  let xStart = 0;
  ROWS.forEach((count, r) => {
    if (r > 0) {
      const growing = ROWS[r] > ROWS[r - 1];
      xStart += growing ? -STRING_SPACING / 2 : STRING_SPACING / 2;
    }
    for (let i = 0; i < count; i++) positions.push([xStart + i * STRING_SPACING, r * ROW_STEP]);
  });
  const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const cz = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  return positions.map(([x, z]) => [x - cx, z - cz]);
}

function deepCorePositions(center) {
  const ring = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    return [center[0] + DEEPCORE.ringRadius * Math.cos(a), center[1] + DEEPCORE.ringRadius * Math.sin(a)];
  });
  const inner = [Math.PI * 0.75, Math.PI * 1.75].map((a) => [
    center[0] + DEEPCORE.innerRadius * Math.cos(a),
    center[1] + DEEPCORE.innerRadius * Math.sin(a),
  ]);
  return [...ring, ...inner];
}

function standardDepths() {
  const step = (DEPTH_BOTTOM - DEPTH_TOP) / (DOMS_PER_STRING - 1);
  return Array.from({ length: DOMS_PER_STRING }, (_, k) => DEPTH_TOP + k * step);
}

function deepCoreDepths() {
  const { upper, lower } = DEEPCORE;
  const top = Array.from({ length: upper.count }, (_, k) => upper.from + k * upper.step);
  const bottom = Array.from({ length: lower.count }, (_, k) => lower.from + k * lower.step);
  return [...top, ...bottom];
}

/**
 * Build the array. Coordinates in metres: x = grid east, y = up (y = -depth), z = grid south.
 * @returns {{strings: Array, doms: Array, positions: Float32Array, center: number[], radius: number, centerStringId: number}}
 */
export function buildArray() {
  const standard = standardStringPositions();
  const centerIndex = standard.reduce(
    (best, p, i) => (Math.hypot(p[0], p[1]) < Math.hypot(standard[best][0], standard[best][1]) ? i : best),
    0,
  );
  const deep = deepCorePositions(standard[centerIndex]);

  const strings = [
    ...standard.map(([x, z], i) => ({ id: i + 1, x, z, deepcore: false })),
    ...deep.map(([x, z], i) => ({ id: 79 + i, x, z, deepcore: true })),
  ];

  const stdDepths = standardDepths();
  const dcDepths = deepCoreDepths();
  const doms = [];
  strings.forEach((s, si) => {
    const depths = s.deepcore ? dcDepths : stdDepths;
    depths.forEach((depth, k) => {
      doms.push({
        id: si * DOMS_PER_STRING + k,
        string: s.id,
        index: k + 1, // 1 = top
        depth,
        deepcore: s.deepcore,
        pos: [s.x, -depth, s.z],
      });
    });
    s.firstDom = si * DOMS_PER_STRING;
  });

  if (strings.length !== N_STRINGS || doms.length !== N_DOMS) {
    throw new Error(`array schematic broken: ${strings.length} strings / ${doms.length} DOMs`);
  }

  const positions = new Float32Array(doms.length * 3);
  doms.forEach((d, i) => positions.set(d.pos, i * 3));

  const radius = Math.max(...strings.map((s) => Math.hypot(s.x, s.z)));
  const center = [0, -(DEPTH_TOP + DEPTH_BOTTOM) / 2, 0];
  return { strings, doms, positions, center, radius, centerStringId: centerIndex + 1 };
}

/** IceTop: 81 surface stations of two tanks each, sitting above the standard strings (+3 infill). */
export function buildIceTop(array) {
  const standard = array.strings.filter((s) => !s.deepcore);
  const infill = array.strings.filter((s) => s.deepcore).slice(0, 3);
  return [...standard, ...infill].map((s, i) => {
    const a = (i * 2.399) % (2 * Math.PI); // fixed pseudo-random tank orientation
    const dx = 5 * Math.cos(a);
    const dz = 5 * Math.sin(a);
    return [
      [s.x + dx + 14, 0, s.z + dz + 9],
      [s.x - dx + 14, 0, s.z - dz + 9],
    ];
  });
}

/** Neighbours on the same string within +-span positions (for the local-coincidence cleaning). */
export function stringNeighbours(array, domId, span = 2) {
  const dom = array.doms[domId];
  const first = array.strings.find((s) => s.id === dom.string).firstDom;
  const out = [];
  for (let k = -span; k <= span; k++) {
    if (k === 0) continue;
    const idx = dom.index - 1 + k;
    if (idx >= 0 && idx < DOMS_PER_STRING) out.push(first + idx);
  }
  return out;
}
