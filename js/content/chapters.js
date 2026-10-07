// The tour, narration-driven. Each chapter schedules its narration lines back to back from the clip
// durations (content/durations.js) and anchors every camera move and effect to those cue times, so a
// different voice (e.g. the author's own recording) re-times the whole film consistently.
// Order: surface -> scale (+ the unexplained flash) -> slow motion -> reconstruction -> origin -> sky.
// Every chapter's apply(local) is a pure function of its local time.

import { smoothstep, clamp, lerp, v3 } from '../core/math.js';
import { poseAt, poseToPosition } from '../scene/stage.js';
import DURATIONS from './durations.js';

const win = (l, a, b, r = 0.6) => smoothstep(a, a + r, l) * (1 - smoothstep(b - r, b, l));
const piece = (l, pts) => {
  if (l <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (l <= pts[i][0]) {
      const [l0, v0] = pts[i - 1];
      const [l1, v1] = pts[i];
      return lerp(v0, v1, (l - l0) / Math.max(1e-6, l1 - l0));
    }
  }
  return pts[pts.length - 1][1];
};

/** Lay narration lines and marks on a timeline: [{key, at|gap}] | [{mark, gap}] | [{pause}]. */
export function schedule(items, D = DURATIONS) {
  let t = 0;
  const at = {};
  const cues = [];
  items.forEach((it) => {
    if (it.at !== undefined) t = it.at;
    if (it.gap) t += it.gap;
    if (it.pause) t += it.pause;
    if (it.mark) at[it.mark] = t;
    if (it.key) {
      const d = D[it.key] ?? 3;
      at[it.key] = t;
      at[`${it.key}_end`] = t + d;
      cues.push({ t, d: d + 0.3, key: it.key });
      t += d;
    }
  });
  return { at, cues, end: t };
}

// Yeoman's spots on screen: x, y = its feet as fractions of the viewport; side = where the bubble opens.
// The spots keep it at the edges of each shot, clear of the subject; it hops from one to the next.
const SPOT = {
  bl: { x: 0.1, y: 0.94, side: 'right' },
  blc: { x: 0.22, y: 0.94, side: 'right' },
  bc: { x: 0.4, y: 0.95, side: 'right' },
  bcr: { x: 0.52, y: 0.94, side: 'left' },
  brg: { x: 0.8, y: 0.93, side: 'left' },
  br: { x: 0.87, y: 0.94, side: 'left' },
};
const HOP = 0.9; // seconds a hop between spots takes

/** Where Yeoman stands at local time l: spots [{t, x, y, side}], each reached by a hop that starts at t. */
export function catAt(spots, l) {
  if (!spots || !spots.length) return null;
  let i = 0;
  while (i < spots.length - 1 && l >= spots[i + 1].t) i += 1;
  const cur = spots[i];
  const prev = spots[Math.max(0, i - 1)];
  const f = i === 0 ? 1 : clamp((l - cur.t) / HOP, 0, 1);
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  const dx = cur.x - prev.x;
  const dist = Math.hypot(dx, cur.y - prev.y);
  const arc = Math.sin(Math.PI * f);
  return {
    x: lerp(prev.x, cur.x, e),
    y: lerp(prev.y, cur.y, e),
    side: f < 0.5 ? prev.side : cur.side,
    hop: arc * Math.min(0.1, 0.035 + dist * 0.22),
    tilt: Math.sign(dx) * arc * 9,
  };
}

/** Pose looking from camera position P toward target T. */
function lookPose(P, T, fov = 50, extra = {}) {
  const d = v3.dist(P, T);
  return { target: T, dist: d, el: Math.asin(clamp((P[1] - T[1]) / d, -1, 1)), az: Math.atan2(-(P[2] - T[2]), P[0] - T[0]), fov, ...extra };
}

export function baseState() {
  return {
    scene: 'world',
    keys: null,
    env: { aurora: 1, strata: 0, diagram: false, bubbles: 0, streak: 0.4, rings: 0, upGlow: 0, burst: null },
    array: { idleAlpha: 0.75, record: 0, reco: 0, time: -1e9, model: false, lineWidth: 1.9, lineAlpha: 0.75, upperAlpha: null, ripples: false },
    event: { physics: 0, time: -1e9, showAngle: false },
    scale: {},
    recoPhase: null,
    celestial: 0,
    cosmos: { vis: {}, nu: 0, warp: null },
    fade: 0,
    flash: 0,
    labels: [],
    hud: { depth: null, scaleLabel: null, physTime: false, legend: null, layers: false, game: false, sky: 0, skyShow: null, messengers: 0, process: 0, fly: -1, plotReveal: 1 },
  };
}

export function buildChapters(ctx) {
  const { closeDomPos: D, center: C, vertex: V, dir, cog, eventEnd, jetAxis, cosmos } = ctx;
  const cs = ctx.centerString;
  const nb = ctx.neighbourMid;
  const along = (s) => v3.addScaled(V, dir, s);
  const domY = D[1];
  const [ax, az] = ctx.descentAxis;

  // ------------------------------------------------------------------ 1. surface + descent
  const S1 = schedule([
    { key: 'c1a', at: 0.6 },
    { key: 'c1b', gap: 0.5 },
    { mark: 'plunge', gap: 0.2 },
    { key: 'c1c', gap: 1.3 },
    { mark: 'slow', gap: 0.1 },
    { key: 'c1d', gap: 0.2 },
    { key: 'c1e', gap: 0.9 },
    { mark: 'end', gap: 1.4 },
  ]);
  const a1 = S1.at;
  const fallT = [ax + 6, 0, az - 4];
  const keys1 = [
    { t: 0, target: [0, 9, 0], dist: 106, az: -1.3, el: -0.045, fov: 55 },
    { t: a1.c1b, target: [0, 9, 0], dist: 88, az: -1.22, el: -0.03, fov: 55 },
    { t: a1.plunge - 1.5, target: [0, 6, 0], dist: 60, az: -1.02, el: 0.42, fov: 55 },
    { t: a1.plunge, target: [ax, 0, az], dist: 46, az: -0.85, el: 1.22, fov: 58 },
    { t: a1.c1c, target: [fallT[0], -120, fallT[2]], dist: 62, az: -0.62, el: 1.12, fov: 62, ease: 'inCubic' },
    { t: a1.slow, target: [fallT[0], -1340, fallT[2]], dist: 62, az: 0.45, el: 1.12, fov: 62, ease: 'linear' },
    { t: a1.c1e, target: D, dist: 1.5, az: -0.5, el: 0.08, fov: 50, ease: 'outCubic' },
    { t: a1.end, target: D, dist: 1.36, az: -0.36, el: 0.08, fov: 50 },
  ];
  // when the camera breaks the surface (for the snow burst and the flash)
  let plungeT = a1.plunge + 0.6;
  for (let l = a1.plunge; l < a1.c1c; l += 0.01) {
    if (poseToPosition(poseAt(keys1, l))[1] < 0) {
      plungeT = l;
      break;
    }
  }
  const plungeAt = poseToPosition(poseAt(keys1, plungeT));
  const camSpeed = (keys, l) => v3.dist(poseToPosition(poseAt(keys, l + 0.05)), poseToPosition(poseAt(keys, l - 0.05))) / 0.1;

  const surface = {
    id: 'surface',
    duration: S1.end,
    marks: S1.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    wear: ['beanie', 'scarf'],
    keys: keys1,
    cues: S1.cues,
    // poses only: the lines themselves are the narration in Yeoman's bubble
    cat: [
      { t: 0.2, pose: 'shiver', wear: ['beanie', 'scarf'] },
      { t: a1.c1b + 0.3, pose: 'point', point: [0.8, -0.4] },
      { t: a1.c1c, pose: 'cheer' },
      { t: a1.c1c + 2.6, pose: 'idle' },
      { t: a1.c1d, pose: 'point', point: [-0.3, 1] },
      { t: a1.c1e, pose: 'present' },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a1.c1b, ...SPOT.blc },
      { t: a1.plunge, ...SPOT.brg },
      { t: a1.c1e - 0.6, ...SPOT.bl },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      const falling = win(l, a1.plunge, a1.c1e + 0.5, 0.8);
      const camY = poseToPosition(poseAt(keys1, l))[1];
      s.env.strata = falling;
      s.env.bubbles = 0.8 * win(l, plungeT - 0.1, a1.c1e, 0.5);
      s.env.streak = clamp(camSpeed(keys1, l) * 0.03, 0.4, 14);
      s.env.rings = win(l, plungeT, a1.c1e - 0.4, 0.6);
      s.env.burst = { origin: [plungeAt[0], 0, plungeAt[2]], tau: l - plungeT };
      s.flash = 0.55 * Math.max(0, 1 - Math.abs(l - plungeT) / 0.32);
      s.array.idleAlpha = 0.85;
      s.array.lineWidth = lerp(1.9, 2.8, falling);
      s.array.lineAlpha = lerp(0.75, 0.95, falling);
      // from inside the array the 86 surface cables converge into rays (a warp-drive look): keep them
      // faint on the way down, so the instrumented section lights up as the reveal at 1,450 m
      s.array.upperAlpha = lerp(0.5, 0.08, win(l, plungeT - 0.4, a1.c1e, 0.8));
      s.array.model = l > a1.c1d;
      s.hud.depth = l > plungeT - 0.2 && l < a1.c1e + 1 ? 'camera' : null;
      s.scale = { cat: smoothstep(a1.c1e + 3, a1.c1e + 4.2, l) };
      if (win(l, 1.2, a1.plunge - 0.8) > 0.05) s.labels.push({ id: 'lab', anchor: [0, 20, 0], key: 'lab', o: win(l, 1.2, a1.plunge - 0.8) });
      // depth markers rushing past
      ctx.ringAnchors.forEach((r) => {
        const o = s.env.rings * (1 - smoothstep(60, 220, Math.abs(camY - r.y)));
        if (o > 0.04) s.labels.push({ id: `ring${r.depth}`, anchor: [ax + 36, r.y, az], text: `${r.depth.toLocaleString('en-US')} m`, o, cls: 'dim' });
      });
      if (l > a1.c1e) s.labels.push({ id: 'dom', anchor: [D[0], D[1] + 0.26, D[2]], key: 'dom', o: smoothstep(a1.c1e, a1.c1e + 0.8, l) });
      if (l > a1.c1e + 3) s.labels.push({ id: 'cat', anchor: ctx.scaleAnchors.cat, key: 'cat', o: smoothstep(a1.c1e + 3, a1.c1e + 4, l), cls: 'ref' });
      return s;
    },
  };

  // ------------------------------------------------------------------ 2. scale, the look up, the flash
  const S2 = schedule([
    { key: 'c2a', at: 0.5 },
    { key: 'c2b', gap: 0.3 },
    { mark: 'dive', gap: 0.2 },
    { mark: 'look', gap: 2.4 },
    { key: 'c2c', gap: 0.3 },
    { mark: 'rise', gap: 0.2 },
    { key: 'c2d', gap: 0.6 },
    { mark: 'flash', gap: 0.8 },
    { key: 'c2e', gap: 2.6 },
    { mark: 'end', gap: 1.2 },
  ]);
  const a2 = S2.at;
  // the look up: tilted ~57 deg so the strings rise out of the bottom of the frame and converge toward
  // the top edge, the way a skyscraper street looks from the pavement
  const lookFrom = [cs.x + 24, -2425, cs.z + 30];
  const lookTo = [cs.x + 330, -1755, cs.z - 280];
  const riseFrom = [cs.x + 20, -2190, cs.z + 30];
  const riseTo = [cs.x + 350, -1490, cs.z - 330];
  const keys2 = [
    { t: 0, target: D, dist: 1.36, az: -0.36, el: 0.08, fov: 50 },
    { t: a2.c2a + 0.6, target: [D[0] - 0.8, D[1] - 0.2, D[2]], dist: 4.2, az: -0.2, el: 0.1, fov: 50 },
    { t: a2.c2b, target: [cs.x, domY - 26, cs.z], dist: 78, az: 0.1, el: 0.06, fov: 50 },
    { t: a2.dive, target: [nb[0], domY - 40, nb[2]], dist: 330, az: 0.32, el: 0.14, fov: 52 },
    { t: a2.look, ...lookPose(lookFrom, lookTo, 74), ease: 'inOutQuint' },
    { t: a2.rise, ...lookPose(riseFrom, riseTo, 74), ease: 'inOutSine' },
    { t: a2.rise + 3.2, target: C, dist: 980, az: 0.12, el: 0.32, fov: 60, ease: 'inOutCubic' },
    { t: a2.flash - 0.4, target: C, dist: 2950, az: 0.62, el: 0.2, fov: 50, ease: 'outCubic' },
    { t: a2.end, target: C, dist: 2880, az: 1.0, el: 0.22, fov: 50 },
  ];
  const scale = {
    id: 'scale',
    duration: S2.end,
    marks: S2.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    // film chapter card: once the pull-back (c2a + 0.6 -> c2b) is 40 % done the scale figures have left through the
    // top of the frame; the card sits over the ice, below the spacing labels
    cardAt: lerp(a2.c2a + 0.6, a2.c2b, 0.4),
    cardTop: 0.56,
    keys: keys2,
    cues: S2.cues,
    cat: [
      { t: 0.4, pose: 'present', wear: [] },
      { t: a2.c2b, pose: 'point', point: [1, -0.1] },
      { t: a2.look + 0.3, pose: 'stargaze' },
      { t: a2.c2d, pose: 'huff' },
      { t: a2.flash + 0.2, pose: 'surprise' },
      { t: a2.c2e + 1, pose: 'think' },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a2.look - 0.4, ...SPOT.bc },
      { t: a2.c2d, ...SPOT.bl },
      { t: a2.flash + 0.3, ...SPOT.blc },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      s.array.model = l < a2.c2a + 1.5;
      const awe = win(l, a2.dive + 0.6, a2.rise + 2.4, 1.2);
      s.env.upGlow = awe;
      s.array.lineWidth = lerp(1.9, 2.6, awe);
      s.array.lineAlpha = lerp(0.75, 0.95, awe);
      s.array.idleAlpha = lerp(0.75, 0.95, awe);
      s.scale = {
        cat: 1 - smoothstep(a2.c2a + 1.2, a2.c2a + 2.6, l),
        human: win(l, 0.6, a2.c2b + 0.8, 0.8),
        vBracket: win(l, a2.c2a + 1.5, a2.dive + 0.2, 0.6),
        hBracket: win(l, a2.c2b + 0.5, a2.look - 0.6, 0.6),
        bar: win(l, a2.c2d + 0.8, a2.flash + 1.4, 0.8),
        tower: win(l, a2.c2d + 1.2, a2.flash + 1.4, 0.8),
        cube: win(l, a2.c2d + 1.6, a2.flash + 1.6, 1),
      };
      const lbl = (id, key, o, cls = 'ref') => o > 0.03 && s.labels.push({ id, anchor: ctx.scaleAnchors[id], key, o, cls });
      ['cat', 'human', 'vBracket', 'hBracket', 'bar', 'tower', 'cube'].forEach((id) => lbl(id, id, s.scale[id]));
      const deep = win(l, a2.c2d + 1.4, a2.flash, 0.6);
      if (deep > 0.05) s.labels.push({ id: 'deepcore', anchor: ctx.deepcoreAnchor, key: 'deepcore', o: deep });
      const cut = win(l, a2.c2d + 1, a2.flash + 1.2, 0.8);
      if (cut > 0.05) {
        // the dust label waits for the overview (rise + 3.2 s): before that its anchor sits at the frame's left edge
        const dustO = cut * smoothstep(a2.rise + 3.2, a2.rise + 4, l);
        if (dustO > 0.05) s.labels.push({ id: 'dust', anchor: ctx.dustAnchor, key: 'dust', o: dustO, cls: 'dim' });
        s.labels.push({ id: 'surfaceLbl', anchor: ctx.rulerAnchor, key: 'surface', o: cut, cls: 'dim' });
        s.labels.push({ id: 'bedrock', anchor: ctx.bedrockAnchor, key: 'bedrock', o: cut, cls: 'dim' });
      }
      if (l > a2.c2d) s.labels.push({ id: 'schematic', anchor: ctx.schematicAnchor, key: 'schematic', o: win(l, a2.c2d, a2.end + 2, 1), cls: 'dim' });
      // the unexplained flash: the whole event in 2.5 seconds, then frozen
      s.array.record = smoothstep(a2.flash, a2.flash + 0.3, l);
      s.array.time = piece(l, [[a2.flash, -40], [a2.flash + 2.5, eventEnd]]);
      s.array.ripples = true;
      s.hud.legend = l > a2.c2e ? 'time' : null;
      return s;
    },
  };

  // ------------------------------------------------------------------ 3. slow motion
  const S3 = schedule([
    { key: 'c3a', at: 0.4 },
    { key: 'c3b', gap: 0.3 },
    { mark: 'hit', gap: 0.3 },
    { key: 'c3c', gap: 0 },
    { key: 'c3d', gap: 0.3 },
    { key: 'c3e', gap: 0.4 },
    { key: 'c3f', gap: 0.4 },
    { key: 'c3g', gap: 0.8 },
    { mark: 'end', gap: 1.0 },
  ]);
  const a3 = S3.at;
  const tPhys = (l) =>
    piece(l, [
      [0, -1300],
      [a3.c3b_end, -150],
      [a3.hit, 0],
      [a3.c3d, 110],
      [a3.c3d_end, 1300],
      [a3.c3e_end, 3300],
      [a3.c3f_end, 5000],
      [a3.c3f_end + 2, eventEnd],
    ]);
  const slowmo = {
    id: 'slowmo',
    duration: S3.end,
    marks: S3.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    keys: [
      { t: 0, target: along(-40), dist: 560, az: -1.42, el: 0.17, fov: 50 },
      { t: a3.hit - 0.2, target: along(10), dist: 330, az: -1.5, el: 0.16, fov: 50 },
      { t: a3.c3d + 3, target: along(210), dist: 560, az: -1.38, el: 0.2, fov: 50 },
      { t: a3.c3f_end, target: along(540), dist: 1560, az: -1.16, el: 0.26, fov: 50 },
      { t: S3.end, target: along(540), dist: 1640, az: -0.94, el: 0.3, fov: 50 },
    ],
    cues: S3.cues,
    cat: [
      { t: 0.3, pose: 'smug', wear: [] },
      { t: a3.c3b, pose: 'point', point: [0.9, -0.3] },
      { t: a3.hit, pose: 'surprise' },
      { t: a3.c3d, pose: 'present' },
      { t: a3.c3e, pose: 'think' },
      { t: a3.c3f, pose: 'huff' },
      { t: a3.c3g, pose: 'sparkle' },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a3.c3f - 0.5, ...SPOT.blc },
      { t: a3.c3g, ...SPOT.bl },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      const t = tPhys(l);
      s.event = { physics: 1, time: t, showAngle: l > a3.c3d && l < a3.c3d_end };
      s.array.record = 1;
      s.array.time = t;
      s.array.idleAlpha = 0.6;
      s.array.ripples = true;
      s.fade = 1 - smoothstep(0, 0.6, l);
      s.hud.physTime = true;
      s.hud.layers = true;
      s.hud.legend = l > a3.c3f ? 'time' : null;
      if (t < 0) s.labels.push({ id: 'nu', dyn: 'nu', key: 'nu', o: 1 });
      if (t > 0 && t < 2600) s.labels.push({ id: 'mu', dyn: 'mu', key: 'mu', o: win(l, a3.hit + 0.4, a3.c3e_end) });
      if (t > 0 && t < 120) s.labels.push({ id: 'x', dyn: 'x', key: 'x', o: 1 });
      if (s.event.showAngle) s.labels.push({ id: 'angle', dyn: 'angle', key: 'angle', o: win(l, a3.c3d, a3.c3d_end) });
      return s;
    },
  };

  // ------------------------------------------------------------------ 4. reconstruction
  const S4 = schedule([
    { key: 'c4a', at: 0.4 },
    { key: 'c4b', gap: 0.4 },
    { key: 'c4c', gap: 0.3 },
    { key: 'c4d', gap: 0.3 },
    { key: 'c4e', gap: 0.3 },
    { key: 'c4f', gap: 0.5 },
    { key: 'c4g', gap: 0.3 },
    { key: 'c4h', gap: 0.5 },
    { mark: 'end', gap: 1.2 },
  ]);
  const a4 = S4.at;
  const reco = {
    id: 'reco',
    duration: S4.end,
    marks: S4.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    keys: [
      { t: 0, target: along(540), dist: 1640, az: -0.94, el: 0.3, fov: 50 },
      { t: a4.c4b + 1, target: cog, dist: 1500, az: -0.8, el: 0.33, fov: 50 },
      { t: S4.end, target: cog, dist: 1450, az: -0.42, el: 0.36, fov: 50 },
    ],
    cues: S4.cues,
    cat: [
      { t: 0.3, pose: 'smug', wear: [] },
      { t: a4.c4b, pose: 'present' },
      { t: a4.c4c, pose: 'think' },
      { t: a4.c4d, pose: 'point', point: [1, -0.25] },
      { t: a4.c4e, pose: 'present' },
      { t: a4.c4f, pose: 'idle' },
      { t: a4.c4g, pose: 'huff' },
      { t: a4.c4h, pose: 'smug', wear: ['cap'] },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a4.c4d - 0.3, ...SPOT.bcr },
      { t: a4.c4f, ...SPOT.bl },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      s.event = { physics: 1 - smoothstep(0.5, 3.0, l), time: eventEnd, showAngle: false };
      s.array.record = 1;
      s.array.time = eventEnd;
      s.array.idleAlpha = lerp(0.6, 0.35, smoothstep(3, 6, l));
      s.array.reco = smoothstep(a4.c4d, a4.c4d + 1.4, l);
      s.hud.layers = true;
      s.hud.legend = l > a4.c4d + 0.2 ? 'resid' : 'time';
      s.hud.game = l > a4.c4b + 0.3;
      s.hud.fly = l >= a4.c4b + 0.8 && l <= a4.c4b + 4.6 ? (l - (a4.c4b + 0.8)) / 3.8 : -1;
      // a plot point appears when its dot lands (dot i lands at fly progress 0.55 + 0.45 * rank_i)
      s.hud.plotReveal = clamp(((l - (a4.c4b + 0.8)) / 3.8 - 0.55) / 0.45, 0, 1);
      if (l < a4.c4b + 0.3) s.recoPhase = null;
      else if (l < a4.c4d) s.recoPhase = { phase: 'intro', t: l - a4.c4b };
      else if (l < a4.c4f) s.recoPhase = { phase: 'demo', t: (l - a4.c4d) / (a4.c4f - a4.c4d) };
      else if (l < a4.c4h) s.recoPhase = { phase: 'algo', t: (l - a4.c4f) / (a4.c4h - a4.c4f) };
      else s.recoPhase = { phase: 'result', t: l - a4.c4h };
      return s;
    },
  };

  // ------------------------------------------------------------------ 5. origin: sky -> blazar -> back to Earth
  const S5 = schedule([
    { key: 'c5a', at: 0.4 },
    { key: 'c5b', gap: 0.3 },
    { key: 'c5c', gap: 0.4 },
    { mark: 'warp', gap: 0.1 },
    { mark: 'arrive', gap: 3.2 },
    { key: 'c5d', gap: 0 },
    { key: 'c5e', gap: 0.3 },
    { key: 'c5f', gap: 0.3 },
    { mark: 'journey', gap: 0.4 },
    { key: 'c5g', gap: 0.2 },
    { mark: 'end', gap: 1.0 },
  ]);
  const a5 = S5.at;
  const jet = jetAxis;
  const jetEl = Math.asin(clamp(jet[1], -1, 1));
  const jetAz = Math.atan2(-jet[2], jet[0]);
  const warpIn = a5.warp + 1.1;
  const origin = {
    id: 'origin',
    duration: S5.end,
    marks: S5.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    keys: [
      { t: 0, target: cog, dist: 1450, az: -0.42, el: 0.36, fov: 50 },
      { t: a5.c5b, target: [0, -900, 0], dist: 21500, az: -0.66, el: 0.22, fov: 46, ease: 'inOutQuint' },
      { t: a5.warp, target: [0, -900, 0], dist: 19800, az: -0.2, el: 0.22, fov: 46 },
      { t: warpIn - 0.001, target: [0, -900, 0], dist: 5200, az: -0.15, el: 0.2, fov: 70, ease: 'inCubic' },
      { t: warpIn, target: cosmos.agn, dist: 9000, az: jetAz + 0.5, el: jetEl + 0.16, fov: 64 },
      { t: a5.arrive, target: cosmos.agn, dist: 900, az: jetAz + 0.5, el: jetEl + 0.16, fov: 50, ease: 'outCubic' },
      { t: a5.c5d + 6, target: cosmos.agn, dist: 64, az: jetAz + 0.56, el: jetEl + 0.14, fov: 50 },
      { t: a5.c5d_end, target: cosmos.agn, dist: 30, az: jetAz + 0.64, el: jetEl + 0.16, fov: 50 },
      { t: a5.journey, target: cosmos.agn, dist: 27, az: jetAz + 0.74, el: jetEl + 0.16, fov: 50 },
      { t: a5.journey + 2.6, target: [0.4, -0.75, 0], dist: 5, az: -1.5, el: -0.1, fov: 60, ease: 'inOutCubic' },
      { t: a5.journey + 4.2, target: [0.62, -0.8, 0], dist: 2.5, az: -1.57, el: -0.12, fov: 45, ease: 'outCubic' },
      { t: S5.end, target: [0.18, -0.95, 0], dist: 1.25, az: -1.57, el: -0.1, fov: 45 },
    ],
    cues: S5.cues,
    cat: [
      { t: 0.4, pose: 'point', point: [0.5, -1], wear: [] },
      { t: a5.c5b, pose: 'present' },
      { t: a5.c5c, pose: 'think' },
      { t: a5.warp, pose: 'surprise' },
      { t: a5.arrive + 0.4, pose: 'stargaze' },
      { t: a5.c5e, pose: 'present' },
      { t: a5.c5f, pose: 'smug' },
      { t: a5.journey, pose: 'cheer' },
      { t: a5.c5g + 2.5, pose: 'point', point: [-0.4, 1] },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a5.c5f - 0.6, ...SPOT.br },
      { t: a5.journey + 0.4, ...SPOT.bl },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      const inWorld = l < warpIn;
      s.scene = inWorld ? 'world' : 'cosmos';
      s.env.diagram = inWorld && l > 1.5;
      s.array.record = 1 - smoothstep(0.5, 2.5, l);
      s.array.time = eventEnd;
      s.array.idleAlpha = 0.5;
      s.celestial = inWorld ? win(l, 1.4, warpIn + 0.2, 1.2) : 0;
      s.recoPhase = inWorld ? { phase: 'sky', t: l } : null;
      s.fade = Math.max(win(l, warpIn - 0.45, warpIn + 0.35, 0.3), smoothstep(S5.end - 0.8, S5.end, l));
      s.flash = 0.35 * win(l, warpIn - 0.2, warpIn + 0.4, 0.2);
      // warp streaks: around the cut into the cosmos, and again on the flight back to Earth
      const warpA = Math.max(win(l, warpIn, a5.arrive + 0.3, 0.4), win(l, a5.journey + 0.2, a5.journey + 3.2, 0.5));
      s.cosmos.warp = warpA > 0.01 ? { opacity: warpA, speed: 2600 } : null;
      const earthA = win(l, a5.journey + 2, S5.end + 1, 0.4);
      s.cosmos.vis = {
        earth: earthA,
        spiral: win(l, warpIn, warpIn + 1.4, 0.3),
        field: win(l, warpIn + 0.6, a5.c5f_end, 1),
        agn: win(l, warpIn + 1, a5.journey + 2.2, 0.6) * (l > a5.c5f ? 0.45 : 1),
        journey: win(l, a5.journey - 0.2, a5.journey + 3.4, 0.4),
        nu: win(l, a5.journey + 3.4, S5.end + 1, 0.4),
        chord: win(l, a5.journey + 3.4, S5.end + 1, 0.4),
      };
      s.cosmos.nu = piece(l, [[a5.journey + 3.6, 0], [a5.c5g_end - 1.6, 0.968], [a5.c5g_end - 0.6, 1]]);
      const wl = l - warpIn;
      s.hud.scaleLabel = wl > 0.1 && wl < 1.1 ? 'galaxyScale' : wl >= 1.1 && wl < 3.2 ? 'farScale' : null;
      s.hud.process = win(l, a5.c5e, a5.c5e_end + 0.2, 0.5);
      s.hud.messengers = win(l, a5.c5f - 0.1, a5.c5f_end + 0.3, 0.5);
      if (s.celestial > 0.05) {
        s.labels.push({ id: 'equator', anchor: ctx.celestialAnchors.equator, key: 'equator', o: s.celestial });
        s.labels.push({ id: 'north', anchor: ctx.celestialAnchors.north, key: 'north', o: s.celestial, cls: 'dim' });
        s.labels.push({ id: 'south', anchor: ctx.celestialAnchors.south, key: 'south', o: s.celestial, cls: 'dim' });
      }
      if (earthA > 0.05) s.labels.push({ id: 'pole', anchor: ctx.cosmosAnchors.pole, key: 'pole', o: earthA });
      if (l > a5.c5g_end - 2) s.labels.push({ id: 'chord', anchor: ctx.cosmosAnchors.chordMid, key: 'chord', o: win(l, a5.c5g_end - 2, S5.end + 1), cls: 'ref' });
      return s;
    },
  };

  // ------------------------------------------------------------------ 6. back to the sky: the real case, then quiet
  const S6 = schedule([
    { key: 'c5h', at: 0.6 },
    { key: 'c5i', gap: 0.3 },
    { key: 'c5j', gap: 0.3 },
    { mark: 'quiet', gap: 0.6 },
    { key: 'c5k', gap: 0.4 },
    { key: 'c5l', gap: 0.4 },
    { mark: 'end', gap: 3.0 },
  ]);
  const a6 = S6.at;
  const sky = {
    id: 'sky',
    duration: S6.end,
    marks: S6.at, // cue and mark times (s), read by the score generator (web/_tools/bgm.mjs)
    keys: [
      { t: 0, target: C, dist: 2700, az: 0.3, el: 0.16, fov: 50 },
      { t: S6.end, target: C, dist: 2900, az: 0.75, el: 0.2, fov: 50 },
    ],
    cues: S6.cues,
    cat: [
      { t: 0.4, pose: 'sparkle', wear: [] },
      { t: a6.c5i, pose: 'point', point: [1, -0.2] },
      { t: a6.c5j, pose: 'present' },
      { t: a6.quiet, pose: 'stargaze', wear: ['telescope'] },
      { t: a6.c5k, pose: 'think', wear: [] },
      { t: a6.c5l, pose: 'smug' },
      { t: a6.c5l_end + 0.8, pose: 'sleep', wear: [] },
    ],
    catSpots: [
      { t: 0, ...SPOT.bl },
      { t: a6.c5i - 0.3, ...SPOT.bcr },
      { t: a6.quiet, ...SPOT.blc },
      { t: a6.c5l_end + 0.5, ...SPOT.bl },
    ],
    apply(l) {
      const s = baseState();
      s.keys = this.keys;
      s.fade = 1 - smoothstep(0, 0.8, l);
      s.array.record = 1 - smoothstep(a6.quiet, a6.c5l, l);
      s.array.time = eventEnd;
      s.array.idleAlpha = 0.6 + 0.2 * smoothstep(a6.quiet, a6.c5l, l);
      s.recoPhase = { phase: 'sky', t: 99 };
      s.hud.sky = win(l, 0.3, a6.quiet + 1.2, 0.8);
      s.hud.skyShow = { teach: true, real: l > a6.c5h + 3.2, txs: l > a6.c5i + 0.2 };
      return s;
    },
  };

  return [surface, scale, slowmo, reco, origin, sky];
}
