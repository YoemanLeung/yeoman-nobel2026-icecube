// Small numeric helpers shared by the science model and the views.
// Vectors are plain [x, y, z] arrays and every helper returns a new array.

export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const smoothstep = (a, b, x) => {
  const t = clamp(invLerp(a, b, x), 0, 1);
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: (t) => t,
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  addScaled: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
};

/** Two unit vectors perpendicular to d (and to each other). */
export function orthoBasis(d) {
  const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = v3.norm(v3.cross(d, helper));
  const w = v3.cross(d, u);
  return [u, w];
}

// Detector frame used everywhere: x = grid east, y = up, z = grid south (right-handed, three.js style).
// Zenith/azimuth describe the ARRIVAL direction (where the particle comes from), IceCube style:
// zenith from straight up, azimuth from grid east counter-clockwise seen from above.
export function arrivalVector(zenith, azimuth) {
  const s = Math.sin(zenith);
  return [s * Math.cos(azimuth), Math.cos(zenith), -s * Math.sin(azimuth)];
}

export function zenAzFromArrival(vec) {
  const n = v3.norm(vec);
  const zenith = Math.acos(clamp(n[1], -1, 1));
  let azimuth = Math.atan2(-n[2], n[0]);
  if (azimuth < 0) azimuth += 2 * Math.PI;
  return { zenith, azimuth };
}

/** Travel direction of a particle that arrives from (zenith, azimuth). */
export const travelVector = (zenith, azimuth) => v3.scale(arrivalVector(zenith, azimuth), -1);

export function angleBetween(a, b) {
  return Math.acos(clamp(v3.dot(v3.norm(a), v3.norm(b)), -1, 1));
}

// ---------------------------------------------------------------------------------------------
// Colour maps. Arrival time uses a plasma-like ramp (no red/green pair, monotonic in lightness
// from late to early) so it reads for colour-vision-deficient viewers; the legend always names
// "early" and "late" in text as well.

const PLASMA_LITE = [
  [0.0, [1.0, 0.93, 0.36]],
  [0.25, [1.0, 0.68, 0.25]],
  [0.5, [0.96, 0.4, 0.42]],
  [0.75, [0.74, 0.31, 0.78]],
  [1.0, [0.42, 0.42, 1.0]],
];

const DIVERGING = [
  [0.0, [0.2, 0.78, 1.0]],
  [0.5, [0.86, 0.88, 0.9]],
  [1.0, [1.0, 0.6, 0.18]],
];

function ramp(stops, t) {
  const x = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return stops[stops.length - 1][1].slice();
}

/** 0 = earliest hit (warm yellow) ... 1 = latest hit (blue-violet). */
export const timeColor = (t) => ramp(PLASMA_LITE, t);
/** 0 = recorded earlier than predicted (cyan), 0.5 = on time, 1 = later (orange). */
export const residualColor = (t) => ramp(DIVERGING, t);

export const toCss = (rgb, a = 1) =>
  `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${a})`;

export function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return NaN;
  const pos = clamp(q, 0, 1) * (sortedValues.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lerp(sortedValues[lo], sortedValues[hi], pos - lo);
}
