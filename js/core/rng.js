// Seeded pseudo-random numbers.
// Every random choice in the event model draws from a stream derived from (seed, label),
// so the scene obeys State = F(t, event, parameters, seed): same inputs, same picture.

/** FNV-1a 32-bit hash of a string. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for visual Monte Carlo. Returns [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named random stream with the samplers the event model needs. */
export function createStream(seed, label) {
  const rand = mulberry32((seed ^ hashString(String(label))) >>> 0);

  const normal = () => {
    // Box-Muller; 1 - u keeps log() finite.
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const poisson = (lambda) => {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = rand();
      while (p > limit) {
        k += 1;
        p *= rand();
      }
      return k;
    }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
  };

  // Marsaglia & Tsang (2000); shape < 1 handled with the standard boost.
  const gamma = (shape, rate) => {
    if (shape < 1) {
      const boost = Math.pow(1 - rand(), 1 / shape);
      return gamma(shape + 1, rate) * boost;
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = normal();
      const v0 = 1 + c * x;
      if (v0 <= 0) continue;
      const v = v0 * v0 * v0;
      const u = 1 - rand();
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return (d * v) / rate;
    }
  };

  const unitVector = () => {
    const z = 2 * rand() - 1;
    const phi = 2 * Math.PI * rand();
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(phi), z, r * Math.sin(phi)];
  };

  return {
    uniform: rand,
    range: (a, b) => a + (b - a) * rand(),
    int: (n) => Math.floor(rand() * n),
    normal,
    exponential: (mean) => -mean * Math.log(1 - rand()),
    poisson,
    gamma,
    unitVector,
  };
}
