// Teaching-event simulation.
//
// What it is: a deterministic toy Monte Carlo that turns a chosen interaction (vertex, direction,
// light yield) into what the detector records: per-DOM pulses (time, charge) plus a sample of
// representative photon paths for the "physics" layer. It is a teaching model, not IceCube software.
//
// Physics kept on purpose
//  - Light comes from charged secondaries (muon track, particle shower), never from the neutrino.
//  - Track light leaves at the Cherenkov angle; direct-light arrival time is the standard
//    t = t0 + (l - rho / tan(theta_c)) / c + rho / (sin(theta_c) * c_ice).
//  - Scattering only ever DELAYS light; delays follow the Pandel gamma distribution.
//  - Expected charge falls with distance; the number of photoelectrons is Poisson.
// Simplifications (stated in the UI): homogeneous ice, no dust-layer optics, no PMT
// saturation or angular acceptance, a fixed light-yield scale instead of an energy spectrum.

import { createStream } from '../core/rng.js';
import { v3, orthoBasis, travelVector, clamp } from '../core/math.js';
import {
  C_VACUUM,
  C_ICE,
  THETA_C,
  PANDEL,
  TEACHING_ZENITH,
  TEACHING_AZIMUTH,
  DOM_NOISE_RATE_HZ,
} from './constants.js';
import { stringNeighbours } from './geometry.js';

const TAN_C = Math.tan(THETA_C);
const SIN_C = Math.sin(THETA_C);
const COS_C = Math.cos(THETA_C);
const JITTER_NS = 2.0; // PMT transit-time spread (order of magnitude)
const MAX_PE_SAMPLED = 48; // photoelectrons whose times are sampled per DOM (charge is not capped)
const NOISE_WINDOW = [-3000, 9000]; // ns, readout window used for random noise

export const DEFAULT_PARAMS = Object.freeze({
  kind: 'track', // 'track' (nu_mu charged current) | 'cascade' (nu_e CC / neutral current)
  seed: 170922,
  zenith: TEACHING_ZENITH,
  azimuth: TEACHING_AZIMUTH,
  vertex: [-470, -2195, 18],
  trackYield: 700, // photoelectron scale of the muon
  cascadeYield: 3.6e4, // photoelectron scale of the hadronic shower at the vertex
  muonLength: 4000, // m; a TeV muon easily leaves the array
  attenuation: 38, // m, expected-charge fall-off at the default optics (~diffusion length)
  scatteringLength: PANDEL.lambda,
  absorptionLength: PANDEL.lambdaA,
  noise: false,
  atmMuon: false,
});

export const CASCADE_PRESET = Object.freeze({
  kind: 'cascade',
  vertex: [40, -2080, -30],
  cascadeYield: 2.4e5,
});

// --------------------------------------------------------------------------------------------
// Light sources

function trackSource({ start, dir, length, t0, yieldScale, kind }) {
  return { type: 'track', start, dir, length, t0, yieldScale, kind };
}

function cascadeSource({ pos, t0, yieldScale, kind }) {
  return { type: 'cascade', pos, t0, yieldScale, kind };
}

/** Expected photoelectrons and direct-light geometry of one source at one DOM. */
function sourceAt(src, domPos, attenuation) {
  if (src.type === 'cascade') {
    const dist = v3.dist(domPos, src.pos);
    const mu = (src.yieldScale * Math.exp(-dist / attenuation)) / Math.max(dist, 4) ** 2;
    return { mu, dEff: dist, emit: src.pos, te: src.t0, tGeo: src.t0 + dist / C_ICE };
  }
  const rel = v3.sub(domPos, src.start);
  const l = v3.dot(rel, src.dir);
  const rho = Math.max(v3.len(v3.sub(rel, v3.scale(src.dir, l))), 0.5);
  const sEmit = l - rho / TAN_C;
  const base = (src.yieldScale * Math.exp(-rho / attenuation)) / Math.max(rho, 4);
  if (sEmit >= 0 && sEmit <= src.length) {
    const dEff = rho / SIN_C;
    const emit = v3.addScaled(src.start, src.dir, sEmit);
    const te = src.t0 + sEmit / C_VACUUM;
    return { mu: base, dEff, emit, te, tGeo: te + dEff / C_ICE };
  }
  // Outside the luminous segment: only scattered light from the nearest end can arrive.
  const sEnd = sEmit < 0 ? 0 : src.length;
  const emit = v3.addScaled(src.start, src.dir, sEnd);
  const dEff = v3.dist(domPos, emit);
  const te = src.t0 + sEnd / C_VACUUM;
  const overshoot = sEmit < 0 ? -sEmit : sEmit - src.length;
  return { mu: base * Math.exp(-overshoot / 40), dEff, emit, te, tGeo: te + dEff / C_ICE };
}

function pandelDelay(rng, dEff, scatteringLength, absorptionLength) {
  const shape = Math.max(dEff, 1) / scatteringLength;
  const rate = 1 / PANDEL.tau + C_ICE / absorptionLength;
  return rng.gamma(shape, rate);
}

// --------------------------------------------------------------------------------------------
// Photon paths for the physics layer (representative samples, not photon counts)

function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += v3.dist(pts[i - 1], pts[i]);
  return s;
}

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + v3.dist(pts[i - 1], pts[i]));
  return cum;
}

/** A path from emission point to DOM whose length equals (ta - te) * c_ice, so it is causal. */
function photonPath(rng, emit, te, ta, domPos) {
  const D = v3.sub(domPos, emit);
  const L0 = v3.len(D);
  const target = Math.max(L0, (ta - te) * C_ICE);
  if (target - L0 < 1.5) {
    const pts = [emit, domPos];
    return { pts, cum: cumulative(pts), te, ta };
  }
  const axis = v3.norm(D);
  const [u, w] = orthoBasis(axis);
  const kinks = clamp(Math.round((target - L0) / 45) + 1, 1, 6);
  const offsets = Array.from({ length: kinks }, () => {
    const a = rng.uniform() * 2 * Math.PI;
    return {
      side: v3.add(v3.scale(u, Math.cos(a)), v3.scale(w, Math.sin(a))),
      mag: 0.45 + 0.55 * rng.uniform(),
      along: (rng.uniform() - 0.5) * 0.8,
    };
  });
  const build = (A) => [
    emit,
    ...offsets.map((o, k) => {
      const onLine = v3.addScaled(emit, D, (k + 1) / (kinks + 1));
      return v3.add(v3.addScaled(onLine, o.side, A * o.mag), v3.scale(axis, A * o.along));
    }),
    domPos,
  ];
  let lo = 0;
  let hi = target;
  for (let i = 0; i < 28; i++) {
    const mid = 0.5 * (lo + hi);
    if (polylineLength(build(mid)) < target) lo = mid;
    else hi = mid;
  }
  const pts = build(0.5 * (lo + hi));
  return { pts, cum: cumulative(pts), te, ta };
}

/** Position on a photon path at physical time t (null if not in flight). */
export function photonPosition(ph, t) {
  if (t < ph.te || t > ph.ta) return null;
  const total = ph.cum[ph.cum.length - 1];
  const s = ((t - ph.te) / Math.max(ph.ta - ph.te, 1e-6)) * total;
  let i = 1;
  while (i < ph.cum.length - 1 && ph.cum[i] < s) i++;
  const seg = ph.cum[i] - ph.cum[i - 1] || 1;
  return v3.lerp(ph.pts[i - 1], ph.pts[i], clamp((s - ph.cum[i - 1]) / seg, 0, 1));
}

// --------------------------------------------------------------------------------------------
// Event assembly

function buildSources(p, dir) {
  const sources = [];
  if (p.kind === 'track') {
    sources.push(trackSource({ start: p.vertex, dir, length: p.muonLength, t0: 0, yieldScale: p.trackYield, kind: 'track' }));
    sources.push(cascadeSource({ pos: p.vertex, t0: 0, yieldScale: p.cascadeYield, kind: 'cascade' }));
  } else {
    sources.push(cascadeSource({ pos: p.vertex, t0: 0, yieldScale: p.cascadeYield, kind: 'cascade' }));
  }
  if (p.atmMuon) sources.push(atmMuonSource());
  return sources;
}

/** A down-going atmospheric muon crossing the array (background demo). */
export function atmMuonSource() {
  const dir = travelVector((38 * Math.PI) / 180, (64 * Math.PI) / 180); // arrives from above
  const pass = [170, -1960, -150];
  const back = 900;
  return trackSource({
    start: v3.addScaled(pass, dir, -back),
    dir,
    length: 2400,
    t0: 1900 - back / C_VACUUM,
    yieldScale: 520,
    kind: 'atm',
  });
}

function scaledAttenuation(p) {
  return (
    DEFAULT_PARAMS.attenuation *
    Math.sqrt(p.scatteringLength / DEFAULT_PARAMS.scatteringLength) *
    Math.sqrt(p.absorptionLength / DEFAULT_PARAMS.absorptionLength)
  );
}

function domPulses(array, p, sources, attenuation) {
  const pulses = [];
  for (const dom of array.doms) {
    const contrib = sources.map((src) => sourceAt(src, dom.pos, attenuation));
    const muTotal = contrib.reduce((s, c) => s + c.mu, 0);
    if (muTotal < 1e-4) continue;
    const rng = createStream(p.seed, `dom:${dom.id}`);
    const n = rng.poisson(muTotal);
    if (n === 0) continue;

    const pes = [];
    for (let k = 0; k < Math.min(n, MAX_PE_SAMPLED); k++) {
      let pick = rng.uniform() * muTotal;
      let si = 0;
      while (si < contrib.length - 1 && pick > contrib[si].mu) {
        pick -= contrib[si].mu;
        si += 1;
      }
      const c = contrib[si];
      const delay = pandelDelay(rng, c.dEff, p.scatteringLength, p.absorptionLength);
      const tPhys = c.tGeo + delay; // photon reaches the glass
      pes.push({ t: tPhys + JITTER_NS * rng.normal(), tPhys, si, delay }); // recorded time adds PMT jitter
    }
    pes.sort((a, b) => a.t - b.t);

    // Pulses are split by source kind so a background muon never hides inside a signal pulse.
    const byKind = new Map();
    pes.forEach((pe) => {
      const kind = sources[pe.si].kind === 'atm' ? 'atm' : 'signal';
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(pe);
    });
    const sampled = pes.length;
    byKind.forEach((list, kind) => {
      const share = list.length / sampled;
      const first = list[0];
      const photons = list.slice(0, list.length > 2 ? 2 : 1).map((pe) => {
        const c = contrib[pe.si];
        return { ...photonPath(rng, c.emit, c.te, pe.tPhys, dom.pos), src: sources[pe.si].kind };
      });
      pulses.push({
        dom: dom.id,
        t: first.t,
        q: Math.max(1, Math.round(n * share)),
        kind,
        src: sources[first.si].kind,
        tGeo: contrib[first.si].tGeo,
        times: list.map((pe) => pe.t),
        photons,
      });
    });
  }
  return pulses;
}

function noisePulses(array, p) {
  const rng = createStream(p.seed, 'noise');
  const span = NOISE_WINDOW[1] - NOISE_WINDOW[0];
  const expected = array.doms.length * DOM_NOISE_RATE_HZ * span * 1e-9;
  const n = rng.poisson(expected);
  return Array.from({ length: n }, () => {
    const t = NOISE_WINDOW[0] + rng.uniform() * span;
    return { dom: rng.int(array.doms.length), t, q: 1, kind: 'noise', src: 'noise', tGeo: t, times: [t], photons: [] };
  });
}

/** Representative photons that never reach a DOM: they draw the Cherenkov cone and then fade. */
function ambientPhotons(p, sources) {
  const rng = createStream(p.seed, 'ambient');
  const out = [];
  sources.forEach((src) => {
    if (src.type === 'track') {
      const [u, w] = orthoBasis(src.dir);
      const visible = Math.min(src.length, 1500);
      for (let s = 2; s < visible; s += 3) {
        for (let k = 0; k < 2; k++) {
          const a = rng.uniform() * 2 * Math.PI;
          const radial = v3.add(v3.scale(u, Math.cos(a)), v3.scale(w, Math.sin(a)));
          const dir = v3.add(v3.scale(src.dir, COS_C), v3.scale(radial, SIN_C));
          out.push({
            origin: v3.addScaled(src.start, src.dir, s),
            dir,
            te: src.t0 + s / C_VACUUM,
            length: Math.min(rng.exponential(70), 240),
            src: src.kind,
          });
        }
      }
    } else {
      for (let k = 0; k < 160; k++) {
        out.push({
          origin: src.pos,
          dir: rng.unitVector(),
          te: src.t0 + rng.uniform() * 4,
          length: Math.min(rng.exponential(48), 200),
          src: src.kind,
        });
      }
    }
  });
  return out;
}

/** Short charged-particle tracks of the hadronic shower X at the vertex (drawn amber). */
function showerSparks(p, dir) {
  const rng = createStream(p.seed, 'sparks');
  const n = p.kind === 'cascade' ? 56 : 30;
  return Array.from({ length: n }, () => {
    const jitter = v3.scale(rng.unitVector(), p.kind === 'cascade' ? 0.75 : 0.55);
    return { dir: v3.norm(v3.add(dir, jitter)), length: 3 + rng.uniform() * (p.kind === 'cascade' ? 16 : 11) };
  });
}

/** Simple local-coincidence cleaning: keep a pulse if a neighbour (+-2 on the string) fired within +-1 us. */
export function cleanPulses(array, pulses, windowNs = 1000) {
  const byDom = new Map();
  pulses.forEach((pl) => {
    if (!byDom.has(pl.dom)) byDom.set(pl.dom, []);
    byDom.get(pl.dom).push(pl);
  });
  return pulses.filter((pl) =>
    stringNeighbours(array, pl.dom, 2).some((nb) =>
      (byDom.get(nb) || []).some((other) => Math.abs(other.t - pl.t) <= windowNs),
    ),
  );
}

/**
 * Simulate one event. Pure function of (array, params): call it again with the same input and
 * every pulse, photon and spark is identical.
 */
export function simulateEvent(array, overrides = {}) {
  const p = { ...DEFAULT_PARAMS, ...overrides };
  const dir = travelVector(p.zenith, p.azimuth);
  const sources = buildSources(p, dir);
  const attenuation = scaledAttenuation(p);

  const physics = domPulses(array, p, sources, attenuation);
  const noise = p.noise ? noisePulses(array, p) : [];
  const pulses = [...physics, ...noise].sort((a, b) => a.t - b.t).map((pl, i) => ({ ...pl, id: i }));

  const signalTimes = physics.filter((pl) => pl.kind === 'signal').map((pl) => pl.t).sort((a, b) => a - b);
  const lastSignal = signalTimes.length ? signalTimes[Math.floor(signalTimes.length * 0.985)] : 3000;

  return {
    params: p,
    truth: { vertex: p.vertex, dir, zenith: p.zenith, azimuth: p.azimuth },
    sources,
    pulses,
    ambient: ambientPhotons(p, sources),
    sparks: showerSparks(p, dir),
    neutrino: { dir, end: p.vertex, approach: 2600 },
    timeRange: [-1400, Math.max(lastSignal + 400, 2500)],
  };
}

/** Earliest pulse per DOM among the given pulses (what the reconstruction uses). */
export function firstPulsePerDom(pulses) {
  const best = new Map();
  pulses.forEach((pl) => {
    const cur = best.get(pl.dom);
    if (!cur || pl.t < cur.t) best.set(pl.dom, { ...pl, q: (cur ? cur.q : 0) + pl.q });
    else best.set(pl.dom, { ...cur, q: cur.q + pl.q });
  });
  return [...best.values()].sort((a, b) => a.t - b.t);
}
