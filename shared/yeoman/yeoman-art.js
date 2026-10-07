// Yeoman — static artwork for the animated mascot.
//
// Drawn from the sticker set in {museum}/assets/yeoman/ (yeoman_wave, _stargaze, _present, _ramen, ...):
//  - one cream head+body mass: a big head, widest at the cheeks, a soft waist just below them, then a chubby
//    belly and bottom that are a little wider than the head; thick wobbly sumi-brush outline, tapered ends
//  - yellow calico patch: the whole LEFT ear (viewer's left) and the upper-left of the head
//  - a second yellow spot low on the left hip
//  - two black dot eyes set wide apart, a "人"-shaped mouth whose corners turn down (the default sulky,
//    tsundere face of the stickers), oval pink blush
//  - short stubby arms; yellow toe beans on the raised paw; a cream tail curling out from behind the hip
// Coordinates live in a 240 x 230 box; the cat's base centre is (110, 202).

export const SVGNS = 'http://www.w3.org/2000/svg';

export const PALETTE = Object.freeze({
  ink: '#1e1a17',
  cream: '#fff8ea',
  creamShade: '#f4e3c4',
  yellow: '#f8c73a',
  yellowDeep: '#eeb021',
  blush: '#f4a09a',
  pad: '#f5b92f',
  red: '#d4473a',
  redDeep: '#b0362c',
  navy: '#22305a',
  gold: '#f2c14e',
  steel: '#e9e4da',
});

// ------------------------------------------------------------------------------------------
// Shapes (fills)

export const SHAPES = Object.freeze({
  // standing, like yeoman_hoop: head as wide as the body, a long torso with a gentle waist (y ~150),
  // and two stubby feet with a notch between them, all in one outline
  body:
    'M 110 44 C 140 44 166 50 174 68 C 180 80 182 92 180 106 C 178 120 173 134 173 150 ' +
    'C 173 162 177 172 176 186 C 175 198 170 204 162 206 C 148 209 128 209 119 204 C 115 201 113 197 110 197 ' +
    'C 107 197 105 201 101 204 C 92 209 72 209 58 206 C 50 204 45 198 44 186 C 43 172 47 162 47 150 ' +
    'C 47 134 42 120 40 106 C 38 92 40 80 46 68 C 54 50 80 44 110 44 Z',
  earL: 'M 46 74 C 47 56 52 34 58 22 C 61 16 67 15 71 19 C 80 28 90 38 100 45 L 70 66 Z',
  earR: 'M 174 74 C 173 56 168 34 162 22 C 159 16 153 15 149 19 C 140 28 130 38 120 45 L 150 66 Z',
  patch:
    'M 34 62 C 48 42 76 38 102 43 C 99 52 91 60 81 66 C 71 73 63 84 58 96 C 51 101 41 97 36 86 Z',
  spot: 'M 158 170 C 164 161 178 163 178 176 C 178 189 166 193 159 188 C 154 184 154 176 158 170 Z',
  // the feet are part of the outline now; kept as empty shapes so the halo and older markup still work
  footL: 'M 70 206 Z',
  footR: 'M 150 206 Z',
  // arms are drawn pointing DOWN from a pivot at (0, 0)
  arm: 'M -10 -2 C -11 11 -11 23 -6 29 C -2 33 6 33 9 28 C 12 21 11 10 10 -2 Z',
});

// Brush strokes: centre-lines rendered as tapered filled polygons.
export const STROKES = Object.freeze({
  body: [
    { d: 'M 58 206 C 50 204 45 198 44 186 C 43 172 47 162 47 150 C 47 134 42 120 40 106 C 38 92 40 80 46 70', w: 6.8 },
    { d: 'M 99 46 C 106 44 114 44 121 46', w: 5.4 },
    { d: 'M 174 70 C 180 80 182 92 180 106 C 178 120 173 134 173 150 C 173 162 177 172 176 186 C 175 198 170 204 162 206', w: 6.8 },
    { d: 'M 60 207 C 72 209 92 209 101 204 C 105 201 107 197 110 197 C 113 197 115 201 119 204 C 128 209 148 209 160 207', w: 3.8 },
  ],
  earL: [{ d: 'M 46 72 C 47 56 52 34 58 22 C 61 16 67 15 71 19 C 80 28 90 38 100 45', w: 6 }],
  earR: [{ d: 'M 174 72 C 173 56 168 34 162 22 C 159 16 153 15 149 19 C 140 28 130 38 120 45', w: 6 }],
  footL: [],
  footR: [],
  arm: [{ d: 'M -10 -1 C -11 11 -11 23 -6 29 C -2 33 6 33 9 28 C 12 21 11 10 10 -1', w: 4.4 }],
});

// stubby arms grow out of the sides of the torso (mid-body, just above the waist, as in yeoman_hoop), their roots
// tucked inside the outline so they read as part of the body rather than hung from the cheeks
export const SHOULDERS = Object.freeze({ L: [53, 142], R: [167, 142], outward: 5 });

export const FACE = Object.freeze({
  eyeL: [86, 97],
  eyeR: [134, 97],
  blushL: [70, 111],
  blushR: [150, 111],
  eyes: {
    dot: (cx, cy) => `<ellipse cx="${cx}" cy="${cy}" rx="5.6" ry="6.4" />`,
    // half-lidded side-eye: the "hmph" of the tsundere moments
    meh: (cx, cy) =>
      `<path d="M ${cx - 5.8} ${cy - 1.6} L ${cx + 5.8} ${cy - 0.8} Q ${cx + 5.6} ${cy + 6.2} ${cx} ${cy + 6.4} Q ${cx - 5.8} ${cy + 6} ${cx - 5.8} ${cy - 1.6} Z" />` +
      `<path d="M ${cx - 8} ${cy - 3.6} L ${cx + 7.6} ${cy - 2.4}" class="line" />`,
    wide: (cx, cy) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="6.8" ry="7.8" /><circle cx="${cx + 2}" cy="${cy - 2.6}" r="1.9" fill="#fff" />`,
    // the rare soft side: big shiny eyes
    sparkle: (cx, cy) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="7.2" ry="8.2" /><circle cx="${cx + 2.4}" cy="${cy - 2.8}" r="2.6" fill="#fff" />` +
      `<circle cx="${cx - 2.4}" cy="${cy + 2.8}" r="1.3" fill="#fff" />`,
    happy: (cx, cy) => `<path d="M ${cx - 6} ${cy + 2} Q ${cx} ${cy - 6} ${cx + 6} ${cy + 2}" class="line" />`,
    closed: (cx, cy) => `<path d="M ${cx - 6} ${cy - 1} Q ${cx} ${cy + 5} ${cx + 6} ${cy - 1}" class="line" />`,
    squint: (cx, cy, side) =>
      side < 0
        ? `<path d="M ${cx - 5} ${cy - 5} L ${cx + 4} ${cy} L ${cx - 5} ${cy + 5}" class="line" />`
        : `<path d="M ${cx + 5} ${cy - 5} L ${cx - 4} ${cy} L ${cx + 5} ${cy + 5}" class="line" />`,
    up: (cx, cy) => `<ellipse cx="${cx}" cy="${cy - 2}" rx="5.4" ry="6" />`,
  },
  mouths: {
    // the default: a "人" whose corners turn down, like the stickers
    cat: 'M 110 103 L 110 108 M 102.5 115 Q 106.5 109.2 110 108 Q 113.5 109.2 117.5 115',
    pout: 'M 110 103 L 110 107.5 M 103 115.8 Q 107 109 110 107.5 Q 113 109 116.6 114',
    w: 'M 110 103 L 110 107 M 102 108.5 Q 106 114.5 110 108.8 Q 114 114.5 118 108.5',
    o: 'M 110 103 L 110 106 M 110 107.2 m -3.4 3.6 a 3.4 3.8 0 1 0 6.8 0 a 3.4 3.8 0 1 0 -6.8 0',
    flat: 'M 110 103 L 110 107 M 104.5 110.5 L 115.5 110.5',
    wavy: 'M 110 103 L 110 106.5 M 102 111.5 Q 106 108 110 111.5 Q 114 115 118 111.5',
    smile: 'M 110 103 L 110 107 M 103.5 109 Q 110 115.5 116.5 109',
  },
});

// ------------------------------------------------------------------------------------------
// Accessories (plain SVG strings; colours from PALETTE)

const P = PALETTE;
export const ACCESSORIES = Object.freeze({
  scarf: `
    <path d="M 36 146 C 72 162 148 162 184 146 L 185 160 C 148 176 72 176 35 160 Z M 138 165 L 151 196 L 136 198 L 127 168 Z" class="acc-halo" />
    <path d="M 36 146 C 72 162 148 162 184 146 L 185 160 C 148 176 72 176 35 160 Z" fill="${P.red}" />
    <path d="M 39 153 C 74 168 146 168 181 153" stroke="${P.yellow}" stroke-width="3" fill="none" stroke-linecap="round" />
    <path d="M 138 165 L 151 196 L 136 198 L 127 168 Z" fill="${P.redDeep}" />
    <path d="M 136 198 l -1 5 M 141 197.4 l 0 5.4 M 146 196.8 l 1 5.2 M 151 196.2 l 2 5" stroke="${P.redDeep}" stroke-width="2.2" stroke-linecap="round" />
    <path d="M 36 146 C 72 162 148 162 184 146 M 35 160 C 72 176 148 176 185 160 M 138 165 L 151 196 L 136 198 L 127 168" class="acc-line" />`,
  beanie: `
    <path d="M 78 72 C 78 46 142 46 142 72 Z M 74 74 C 74 64 146 64 146 74 C 146 80 74 80 74 74 Z" class="acc-halo" />
    <circle cx="110" cy="35" r="9.5" class="acc-halo" />
    <circle cx="110" cy="35" r="9.5" fill="${P.cream}" class="pompom" />
    <path d="M 78 72 C 78 46 142 46 142 72 Z" fill="${P.red}" />
    <path d="M 74 74 C 74 64 146 64 146 74 C 146 80 74 80 74 74 Z" fill="${P.redDeep}" />
    <path d="M 84 69 l 0 8 M 92 68 l 0 9 M 100 67.4 l 0 9.4 M 108 67.2 l 0 9.6 M 116 67.2 l 0 9.6 M 124 67.4 l 0 9.4 M 132 68 l 0 9 M 140 69 l 0 8" stroke="${P.red}" stroke-width="2" stroke-linecap="round" />
    <path d="M 78 68 C 80 44 140 44 142 68 M 74 74 C 74 64 146 64 146 74 C 146 80 74 80 74 74" class="acc-line" />
    <circle cx="110" cy="35" r="9.5" class="acc-line pompom" />`,
  cap: `
    <path d="M 60 54 L 110 35 L 160 54 L 110 70 Z M 142 81 L 152 81 L 150 95 L 144 95 Z" class="acc-halo" />
    <path d="M 82 66 C 84 54 136 54 138 66 L 138 72 C 120 78 100 78 82 72 Z" fill="${P.navy}" />
    <path d="M 60 54 L 110 35 L 160 54 L 110 70 Z" fill="${P.navy}" />
    <path d="M 60 54 L 110 35 L 160 54 L 110 70 Z" class="acc-line" />
    <g class="tassel"><path d="M 110 52 C 126 54 140 57 146 61 L 147 83" stroke="${P.gold}" stroke-width="2.6" fill="none" stroke-linecap="round" />
    <path d="M 142 81 L 152 81 L 150 95 L 144 95 Z" fill="${P.gold}" /></g>
    <circle cx="110" cy="52" r="3" fill="${P.gold}" />`,
  magnifier: `
    <path d="M 0 30 L 4 52" class="acc-halo" /><circle cx="-4" cy="66" r="15" class="acc-halo" />
    <path d="M 0 30 L 4 52" stroke="#6b4a2f" stroke-width="5" stroke-linecap="round" />
    <circle cx="-4" cy="66" r="15" fill="rgba(190, 230, 255, 0.35)" stroke="${P.ink}" stroke-width="4.2" />
    <path d="M -12 60 Q -8 55 -2 55" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.8" />`,
  telescope: `
    <path d="M 204 152 L 191 203 M 204 152 L 218 203 M 204 152 L 204 205" class="acc-halo" />
    <g transform="rotate(-38 204 148)"><rect x="165" y="135" width="72" height="24" rx="5" class="acc-halo" /></g>
    <path d="M 204 152 L 191 203 M 204 152 L 218 203 M 204 152 L 204 205" stroke="${P.ink}" stroke-width="3.2" stroke-linecap="round" />
    <g transform="rotate(-38 204 148)">
      <rect x="175" y="140" width="56" height="16" rx="4" fill="${P.steel}" stroke="${P.ink}" stroke-width="3.4" />
      <rect x="225" y="137" width="10" height="22" rx="3" fill="#3a3d44" stroke="${P.ink}" stroke-width="3" />
      <rect x="167" y="143" width="10" height="10" rx="2" fill="#3a3d44" stroke="${P.ink}" stroke-width="2.6" />
      <path d="M 195 140 L 195 156" stroke="${P.ink}" stroke-width="2" />
    </g>`,
});

// ------------------------------------------------------------------------------------------
// Brush-stroke generator: a centre-line becomes a filled polygon whose width swells and tapers
// like a loaded brush, with a little seeded noise so three variants can "boil" in turn.

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let measurer = null;
function measurePath(d) {
  if (!measurer) {
    measurer = document.createElementNS(SVGNS, 'svg');
    measurer.setAttribute('width', '0');
    measurer.setAttribute('height', '0');
    measurer.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    document.body.appendChild(measurer);
  }
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', d);
  measurer.appendChild(path);
  return path;
}

/** Tapered brush polygon for centre-line `d`; returns an SVG path string. */
export function brushPath(d, width, seed, { taperIn = 0.16, taperOut = 0.24, minFrac = 0.16, wobble = 0.55 } = {}) {
  const path = measurePath(d);
  const total = path.getTotalLength();
  const n = Math.max(14, Math.ceil(total / 2.6));
  const rand = mulberry(seed);
  const knots = Array.from({ length: 7 }, () => rand());
  const noiseAt = (s) => {
    const x = s * (knots.length - 1);
    const i = Math.min(knots.length - 2, Math.floor(x));
    const f = 0.5 - 0.5 * Math.cos(Math.PI * (x - i));
    return knots[i] * (1 - f) + knots[i + 1] * f;
  };
  const pts = Array.from({ length: n + 1 }, (_, i) => path.getPointAtLength((total * i) / n));
  path.remove();
  const left = [];
  const right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    const s = i / n;
    const ramp = Math.min(1, s / taperIn) ** 0.75 * Math.min(1, (1 - s) / taperOut) ** 0.75;
    const w = width * (minFrac + (1 - minFrac) * ramp) * (0.82 + 0.36 * noiseAt(s));
    const jx = (rand() - 0.5) * wobble;
    const jy = (rand() - 0.5) * wobble;
    left.push(`${(p.x + nx * w * 0.5 + jx).toFixed(2)} ${(p.y + ny * w * 0.5 + jy).toFixed(2)}`);
    right.push(`${(p.x - nx * w * 0.5 + jx).toFixed(2)} ${(p.y - ny * w * 0.5 + jy).toFixed(2)}`);
  });
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

/** Three boil variants of a list of strokes, as <g> markup strings. */
export function brushVariants(strokes, baseSeed) {
  return [0, 1, 2].map((v) =>
    strokes.map((st, i) => `<path d="${brushPath(st.d, st.w, baseSeed * 97 + i * 13 + v * 7919)}" />`).join(''),
  );
}
