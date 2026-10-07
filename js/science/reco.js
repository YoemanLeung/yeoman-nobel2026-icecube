// Direction reconstruction for the teaching model.
//
// Hypothesis: an infinite straight track through `anchor` moving at c along `dir`. Each recorded
// DOM gets a predicted direct-light time; the residual is dt = t_obs - t_pred.
// Cost: an asymmetric robust loss. Light can arrive LATE (it scatters) but not EARLY (nothing
// beats the direct path), so early residuals cost quadratically and late ones only logarithmically.
// This mirrors the idea behind IceCube's likelihood fits but it is NOT a calibrated likelihood:
// the UI calls it a cost, and the uncertainty comes from bootstrap resampling of this toy model.

import { createStream } from '../core/rng.js';
import { v3, clamp, travelVector, zenAzFromArrival, angleBetween, orthoBasis, quantile } from '../core/math.js';
import { C_VACUUM, C_ICE, THETA_C } from './constants.js';

const TAN_C = Math.tan(THETA_C);
const SIN_C = Math.sin(THETA_C);

export const LOSS = Object.freeze({ earlySigma: 12, lateTau: 70 });

/** Direct-light time (t0 = 0) for a DOM at pos, track through anchor along dir. */
export function geoTime(pos, anchor, dir) {
  const rel = v3.sub(pos, anchor);
  const l = v3.dot(rel, dir);
  const rho = v3.len(v3.sub(rel, v3.scale(dir, l)));
  return (l - rho / TAN_C) / C_VACUUM + rho / (SIN_C * C_ICE);
}

const lossTerm = (dt) => (dt < 0 ? 0.5 * (dt / LOSS.earlySigma) ** 2 : Math.log1p(dt / LOSS.lateTau));
const hitWeight = (q) => Math.sqrt(Math.min(q, 10));

/** Best time offset and cost for a fixed track geometry (golden-section search over t0). */
export function evaluateTrack(hits, anchor, dir) {
  const u = hits.map((h) => h.t - geoTime(h.pos, anchor, dir));
  const w = hits.map((h) => hitWeight(h.q));
  const cost = (t0) => u.reduce((s, ui, i) => s + w[i] * lossTerm(ui - t0), 0);
  const sorted = [...u].sort((a, b) => a - b);
  let lo = sorted[0] - 60;
  let hi = quantile(sorted, 0.6) + 60;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = cost(x1);
  let f2 = cost(x2);
  for (let i = 0; i < 30; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = cost(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = cost(x2);
    }
  }
  const t0 = 0.5 * (lo + hi);
  return { t0, cost: cost(t0) / Math.max(1, hits.length), residuals: u.map((ui) => ui - t0) };
}

/** Charge-weighted centre of gravity of the hits (the fixed anchor of the player's track). */
export function centerOfGravity(hits) {
  const qs = hits.reduce((s, h) => s + h.q, 0) || 1;
  return hits.reduce((acc, h) => v3.addScaled(acc, h.pos, h.q / qs), [0, 0, 0]);
}

/** LineFit first guess: least-squares r_i = r0 + v t_i. Fast, robust, a few degrees off. */
export function lineFit(hits) {
  const n = hits.length;
  const tMean = hits.reduce((s, h) => s + h.t, 0) / n;
  const rMean = hits.reduce((acc, h) => v3.addScaled(acc, h.pos, 1 / n), [0, 0, 0]);
  let num = [0, 0, 0];
  let den = 0;
  hits.forEach((h) => {
    const dt = h.t - tMean;
    num = v3.addScaled(num, v3.sub(h.pos, rMean), dt);
    den += dt * dt;
  });
  const v = v3.scale(num, 1 / Math.max(den, 1e-9));
  const dir = v3.norm(v);
  const { zenith, azimuth } = zenAzFromArrival(v3.scale(dir, -1));
  return { dir, anchor: rMean, speed: v3.len(v), zenith, azimuth };
}

/** Feedback for the player: residuals with t0 aligned automatically, track through the COG. */
export function playerFeedback(hits, zenith, azimuth, anchor) {
  const dir = travelVector(zenith, azimuth);
  const { t0, cost, residuals } = evaluateTrack(hits, anchor, dir);
  const predicted = hits.map((h) => t0 + geoTime(h.pos, anchor, dir));
  const absSorted = residuals.map(Math.abs).sort((a, b) => a - b);
  const early = residuals.filter((r) => r < -25).length;
  return { dir, t0, cost, residuals, predicted, medianAbs: quantile(absSorted, 0.5), earlyCount: early };
}

// --------------------------------------------------------------------------------------------
// Nelder-Mead over (zenith, azimuth, du, dv) written as a generator so the UI can animate it.

function normaliseAngles([zen, az, ...rest]) {
  let z = zen;
  let a = az;
  if (z < 0) {
    z = -z;
    a += Math.PI;
  }
  if (z > Math.PI) {
    z = 2 * Math.PI - z;
    a += Math.PI;
  }
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return [z, a, ...rest];
}

function* nelderMead(f, x0, steps, maxEval) {
  const dim = x0.length;
  let simplex = [x0, ...steps.map((s, i) => x0.map((v, j) => (j === i ? v + s : v)))].map((x) => ({ x, f: f(x) }));
  let evals = simplex.length;
  while (evals < maxEval) {
    simplex.sort((a, b) => a.f - b.f);
    yield { best: simplex[0], evals };
    const spread = simplex[dim].f - simplex[0].f;
    const size = Math.max(...simplex.slice(1).map((s) => Math.hypot(...s.x.map((v, j) => (v - simplex[0].x[j]) / steps[j]))));
    if (spread < 1e-7 && size < 1e-3) break;
    const centroid = Array.from({ length: dim }, (_, j) => simplex.slice(0, dim).reduce((s, p) => s + p.x[j], 0) / dim);
    const worst = simplex[dim];
    const at = (t) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const reflected = { x: at(-1) };
    reflected.f = f(reflected.x);
    evals += 1;
    if (reflected.f < simplex[0].f) {
      const expanded = { x: at(-2) };
      expanded.f = f(expanded.x);
      evals += 1;
      simplex[dim] = expanded.f < reflected.f ? expanded : reflected;
    } else if (reflected.f < simplex[dim - 1].f) {
      simplex[dim] = reflected;
    } else {
      const contracted = { x: at(reflected.f < worst.f ? -0.5 : 0.5) };
      contracted.f = f(contracted.x);
      evals += 1;
      if (contracted.f < Math.min(worst.f, reflected.f)) {
        simplex[dim] = contracted;
      } else {
        simplex = simplex.map((p, i) => {
          if (i === 0) return p;
          const x = p.x.map((v, j) => simplex[0].x[j] + 0.5 * (v - simplex[0].x[j]));
          evals += 1;
          return { x, f: f(x) };
        });
      }
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  yield { best: simplex[0], evals, done: true };
}

function trackFromParams(x, anchor0, basis) {
  const [zen, az, du, dv] = normaliseAngles(x);
  const anchor = v3.add(anchor0, v3.add(v3.scale(basis[0], du), v3.scale(basis[1], dv)));
  return { zenith: zen, azimuth: az, anchor, dir: travelVector(zen, az) };
}

/**
 * Generator of fit iterations starting from `init` ({zenith, azimuth, anchor}).
 * Each yielded value carries the current best track; the last one has done = true.
 */
export function* fitSteps(hits, init, { stepDeg = 6, stepM = 25, maxEval = 420 } = {}) {
  const basis = orthoBasis(travelVector(init.zenith, init.azimuth));
  const f = (x) => {
    const tr = trackFromParams(x, init.anchor, basis);
    return evaluateTrack(hits, tr.anchor, tr.dir).cost;
  };
  const step = (stepDeg * Math.PI) / 180;
  const gen = nelderMead(f, [init.zenith, init.azimuth, 0, 0], [step, step, stepM, stepM], maxEval);
  for (const it of gen) {
    const tr = trackFromParams(it.best.x, init.anchor, basis);
    const ev = evaluateTrack(hits, tr.anchor, tr.dir);
    yield { ...tr, t0: ev.t0, cost: it.best.f, evals: it.evals, done: Boolean(it.done) };
  }
}

export function runToEnd(gen) {
  let last = null;
  for (const it of gen) last = it;
  return last;
}

export const fitTrack = (hits, init, opts) => runToEnd(fitSteps(hits, init, opts));

/**
 * Bootstrap: resample hits with replacement, refit from the best fit, collect directions.
 * Generator so the UI can show progress; the final value carries containment radii.
 */
export function* bootstrapSteps(hits, best, { n = 40, seed = 7 } = {}) {
  const replicates = [];
  for (let k = 0; k < n; k++) {
    const rng = createStream(seed, `boot:${k}`);
    const sample = hits.map(() => hits[rng.int(hits.length)]);
    const fit = fitTrack(sample, best, { stepDeg: 2, stepM: 10, maxEval: 160 });
    replicates.push({ zenith: fit.zenith, azimuth: fit.azimuth, dir: fit.dir });
    yield { k: k + 1, n, replicates };
  }
  const angles = replicates.map((r) => angleBetween(r.dir, best.dir)).sort((a, b) => a - b);
  yield { k: n, n, replicates, r50: quantile(angles, 0.5), r90: quantile(angles, 0.9), done: true };
}

/** Hits as the reconstruction sees them: positions from the array, first pulse time, total charge. */
export function hitsForReco(array, firstPulses) {
  return firstPulses.map((pl) => ({ dom: pl.dom, pos: array.doms[pl.dom].pos, t: pl.t, q: pl.q, kind: pl.kind }));
}

export { angleBetween, clamp };
