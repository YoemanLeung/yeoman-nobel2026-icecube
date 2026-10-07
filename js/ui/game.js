// The reconstruction game and its panel.
// The viewer turns a candidate track (two angles); everything they see is computed by the teaching
// model: per-DOM residuals, the recorded-vs-predicted scatter, the count of records that direct light
// can explain. "Let the algorithm continue" runs LineFit -> Nelder-Mead refinement -> bootstrap.

import { DEG, clamp, residualColor, angleBetween, travelVector, v3 } from '../core/math.js';
import { firstPulsePerDom } from '../science/event.js';
import { hitsForReco, centerOfGravity, lineFit, playerFeedback, evaluateTrack, fitSteps, bootstrapSteps, geoTime } from '../science/reco.js';
import { drawScatter, drawResidualHist } from './plots.js';

const DIRECT_WINDOW = [-30, 80]; // ns

function residualRgb(dt) {
  return residualColor(0.5 + 0.5 * clamp(dt / 250, -1, 1));
}

export function createGame({ array, event, frame, text, root, onUserInput }) {
  let hits = [];
  let cog = [0, 0, 0];
  let truth = event.truth;
  let start = { zenith: 0, azimuth: 0 };
  let plateau = { zenith: 0, azimuth: 0 };
  let pre = null; // precomputed tour results
  let user = { zenith: 0, azimuth: 0 };
  let mode = 'tour';
  let live = null; // user-run algorithm state
  let lastKey = '';
  let view = null; // last output for 3D + panel
  let reveal = 1; // fraction of scatter points shown (the fly-in lands them in time order)

  /** Use the event's signal pulses, or an explicit pulse list (e.g. cleaned, with background). */
  function load(ev, pulses = null) {
    event = ev;
    truth = ev.truth;
    const use = pulses || ev.pulses.filter((p) => p.kind === 'signal');
    hits = hitsForReco(array, firstPulsePerDom(use));
    cog = centerOfGravity(hits);
    start = { zenith: clamp(truth.zenith - 24 * DEG, 5 * DEG, 175 * DEG), azimuth: truth.azimuth + 38 * DEG };
    plateau = { zenith: truth.zenith + 2.6 * DEG, azimuth: truth.azimuth - 3.2 * DEG };
    user = { ...start };
    pre = null;
    live = null;
    lastKey = '';
    precomputeFit();
  }

  /** The tour's algorithm run (deterministic): the fit is synchronous (tens of ms), the bootstrap
   *  runs in chunks so the page stays responsive; until it finishes the fan grows from what exists. */
  function precomputeFit() {
    const lf = lineFit(hits);
    const path = [];
    for (const it of fitSteps(hits, { zenith: lf.zenith, azimuth: lf.azimuth, anchor: lf.anchor })) path.push(it);
    pre = { lf, path, fit: path[path.length - 1], replicates: [], r50: null, r90: null };
    return pre;
  }

  async function precompute() {
    if (!pre) precomputeFit();
    const mine = pre;
    let k = 0;
    for (const it of bootstrapSteps(hits, mine.fit, { n: 40 })) {
      if (pre !== mine) return null; // a new event was loaded meanwhile
      mine.replicates = it.replicates.slice();
      if (it.done) {
        mine.r50 = it.r50;
        mine.r90 = it.r90;
      }
      if (++k % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return mine;
  }

  function feedback(zenith, azimuth, anchor = cog) {
    const fb = playerFeedback(hits, zenith, azimuth, anchor);
    const direct = fb.residuals.filter((r) => r >= DIRECT_WINDOW[0] && r <= DIRECT_WINDOW[1]).length;
    return { ...fb, direct };
  }

  function fitFeedback(fit) {
    const ev = evaluateTrack(hits, fit.anchor, fit.dir);
    const predicted = hits.map((h) => ev.t0 + geoTime(h.pos, fit.anchor, fit.dir));
    const absSorted = ev.residuals.map(Math.abs).sort((a, b) => a - b);
    const direct = ev.residuals.filter((r) => r >= DIRECT_WINDOW[0] && r <= DIRECT_WINDOW[1]).length;
    return { residuals: ev.residuals, predicted, medianAbs: absSorted[Math.floor(absSorted.length / 2)], direct };
  }

  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
  const mixAng = (a, b, f) => ({ zenith: a.zenith + (b.zenith - a.zenith) * f, azimuth: a.azimuth + (b.azimuth - a.azimuth) * f });

  /** Scene + panel state for a tour phase (pure given the precomputed run). */
  function tourView(phase) {
    if (!phase) return null;
    const p = pre;
    if (phase.phase === 'intro') return candidateView(start, 'intro');
    if (phase.phase === 'demo') return candidateView(mixAng(start, plateau, ease(phase.t * 1.15)), 'demo');
    if (!p) return candidateView(plateau, 'demo');
    if (phase.phase === 'algo') {
      const t = phase.t;
      if (t < 0.12) return trackView({ zenith: p.lf.zenith, azimuth: p.lf.azimuth, anchor: p.lf.anchor }, 'linefit');
      if (t < 0.55) {
        const idx = Math.min(p.path.length - 1, Math.floor(((t - 0.12) / 0.43) * p.path.length));
        return trackView(p.path[idx], 'refine');
      }
      const k = Math.max(1, Math.floor(((t - 0.55) / 0.42) * p.replicates.length));
      return trackView(p.fit, 'boot', p.replicates.slice(0, Math.min(k, p.replicates.length)));
    }
    if (phase.phase === 'result' || phase.phase === 'sky') return trackView(p.fit, 'result', p.replicates, p.r90 ?? 0.05);
    return null;
  }

  function candidateView(ang, step) {
    const fb = feedback(ang.zenith, ang.azimuth);
    return {
      step,
      candidate: { anchor: cog, dir: fb.dir },
      angles: ang,
      fb,
      residualColors: hits.map((h, i) => ({ dom: h.dom, color: residualRgb(fb.residuals[i]) })),
    };
  }

  function trackView(tr, step, fan = [], r90 = null) {
    const dir = tr.dir || travelVector(tr.zenith, tr.azimuth);
    const fit = { ...tr, dir };
    const fb = fitFeedback(fit);
    const out = {
      step,
      candidate: step === 'linefit' || step === 'refine' ? { anchor: tr.anchor, dir } : null,
      fit: step === 'boot' || step === 'result' ? { anchor: tr.anchor, dir } : null,
      angles: { zenith: tr.zenith, azimuth: tr.azimuth },
      fb,
      fan,
      fanAnchor: tr.anchor,
      residualColors: hits.map((h, i) => ({ dom: h.dom, color: residualRgb(fb.residuals[i]) })),
    };
    if (r90 !== null) {
      out.r90 = r90 / DEG;
      out.err = angleBetween(dir, truth.dir) / DEG;
      out.eq = frame.toEquatorial(tr.zenith, tr.azimuth);
    }
    return out;
  }

  // ------------------------------------------------------------------------------- user mode
  function userView() {
    if (live) return live.view;
    return candidateView(user, 'user');
  }

  function setUser(zenith, azimuth) {
    mode = 'user';
    live = null;
    user = { zenith: clamp(zenith, 0.5 * DEG, 179.5 * DEG), azimuth: ((azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
  }

  /** Run the algorithm from the viewer's current direction, animated over frames. */
  function runLive() {
    mode = 'user';
    const init = { zenith: user.zenith, azimuth: user.azimuth, anchor: cog };
    const lf = lineFit(hits);
    const gen = fitSteps(hits, { zenith: lf.zenith, azimuth: lf.azimuth, anchor: lf.anchor });
    live = { stage: 'linefit', gen, boot: null, frames: 0, view: trackView({ ...lf, anchor: lf.anchor }, 'linefit'), init };
  }

  function stepLive() {
    if (!live || live.stage === 'done') return;
    live.frames += 1;
    if (live.stage === 'linefit') {
      if (live.frames > 30) live.stage = 'refine';
      return;
    }
    if (live.stage === 'refine') {
      for (let i = 0; i < 2; i++) {
        const it = live.gen.next();
        if (it.done || it.value.done) {
          const fit = it.value || live.last;
          live.fit = fit;
          live.bootGen = bootstrapSteps(hits, fit, { n: 40, seed: 11 });
          live.stage = 'boot';
          break;
        }
        live.last = it.value;
        live.view = trackView(it.value, 'refine');
      }
      return;
    }
    if (live.stage === 'boot') {
      const it = live.bootGen.next();
      if (it.done) return;
      const v = it.value;
      if (v.done) {
        live.view = trackView(live.fit, 'result', v.replicates, v.r90);
        live.stage = 'done';
      } else {
        live.view = trackView(live.fit, 'boot', v.replicates);
      }
    }
  }

  // ------------------------------------------------------------------------------- panel
  let els = null;
  function buildPanel() {
    const t = text();
    root.innerHTML = `
      <h3>${t.game.title}</h3>
      <label class="slider"><span>${t.game.zenith}</span><input type="range" min="0" max="180" step="0.1" data-k="zen" /><output data-o="zen"></output></label>
      <label class="slider"><span>${t.game.azimuth}</span><input type="range" min="0" max="360" step="0.1" data-k="az" /><output data-o="az"></output></label>
      <div class="metric"><span>${t.game.direct}</span><b data-o="direct"></b></div>
      <div class="meter"><i data-o="meter"></i></div>
      <div class="metric small"><span>${t.game.spread}</span><b data-o="spread"></b></div>
      <canvas class="plot" data-c="scatter" aria-label="${t.game.scatterY}"></canvas>
      <canvas class="plot short" data-c="hist" aria-label="Δt"></canvas>
      <p class="hint">${t.game.zero}</p>
      <button type="button" class="run" data-a="run">${t.game.run}</button>
      <ol class="steps"><li data-s="linefit">${t.game.linefit}</li><li data-s="refine">${t.game.refine}</li><li data-s="boot">${t.game.boot}</li></ol>
      <p class="result" data-o="result"></p>
      <p class="note">${t.game.note}</p>
      <button type="button" class="link" data-a="reset">${t.game.reset}</button>`;
    const q = (s) => root.querySelector(s);
    els = {
      zen: q('[data-k="zen"]'),
      az: q('[data-k="az"]'),
      zenO: q('[data-o="zen"]'),
      azO: q('[data-o="az"]'),
      direct: q('[data-o="direct"]'),
      meter: q('[data-o="meter"]'),
      spread: q('[data-o="spread"]'),
      scatter: q('[data-c="scatter"]'),
      hist: q('[data-c="hist"]'),
      result: q('[data-o="result"]'),
      run: q('[data-a="run"]'),
      steps: root.querySelectorAll('.steps li'),
    };
    const onSlide = () => {
      setUser(Number(els.zen.value) * DEG, Number(els.az.value) * DEG);
      onUserInput && onUserInput('slide');
    };
    els.zen.addEventListener('input', onSlide);
    els.az.addEventListener('input', onSlide);
    els.run.addEventListener('click', () => {
      runLive();
      onUserInput && onUserInput('run');
    });
    q('[data-a="reset"]').addEventListener('click', () => {
      setUser(start.zenith, start.azimuth);
      onUserInput && onUserInput('reset');
    });
    lastKey = '';
  }

  function renderPanel(v) {
    if (!els || !v) return;
    const t = text();
    const zen = v.angles.zenith / DEG;
    const az = (((v.angles.azimuth / DEG) % 360) + 360) % 360;
    const key = `${zen.toFixed(2)}|${az.toFixed(2)}|${v.step}|${(v.fan || []).length}|${reveal.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;
    if (document.activeElement !== els.zen) els.zen.value = zen.toFixed(1);
    if (document.activeElement !== els.az) els.az.value = az.toFixed(1);
    els.zenO.textContent = `${zen.toFixed(1)}°`;
    els.azO.textContent = `${az.toFixed(1)}°`;
    els.direct.textContent = `${v.fb.direct} / ${hits.length}`;
    els.meter.style.width = `${Math.min(100, (v.fb.direct / Math.max(1, hits.length)) * 100 * 3.5)}%`;
    els.spread.textContent = `${Math.round(v.fb.medianAbs)} ns`;
    const obs = hits.map((h) => h.t / 1000);
    const pred = v.fb.predicted.map((p) => p / 1000);
    const lo = Math.min(...obs) - 0.3;
    const hi = Math.max(...obs) + 0.3;
    drawScatter(els.scatter, pred, obs, { xLabel: t.game.scatterX, yLabel: t.game.scatterY, range: [lo, hi], reveal, rank: timeRanks() });
    drawResidualHist(els.hist, v.fb.residuals, { label: 'Δt = t_rec − t_pred (ns)' });
    const order = ['linefit', 'refine', 'boot', 'result'];
    const at = order.indexOf(v.step);
    els.steps.forEach((li, i) => {
      li.classList.toggle('done', at > i || v.step === 'result');
      li.classList.toggle('now', at === i);
    });
    els.run.disabled = Boolean(live && live.stage !== 'done');
    els.run.textContent = els.run.disabled ? t.game.running : t.game.run;
    els.result.textContent =
      v.step === 'result' && v.r90 !== undefined ? t.game.result.replace('{err}', v.err.toFixed(1)).replace('{r90}', v.r90.toFixed(1)) : '';
  }

  /** Rank 0..1 of every hit by recorded time (the order in which the fly-in lands them). */
  function timeRanks() {
    const order = hits.map((h, i) => [h.t, i]).sort((a, b) => a[0] - b[0]);
    const rank = new Array(hits.length);
    order.forEach(([, i], r) => (rank[i] = r / Math.max(1, hits.length - 1)));
    return rank;
  }

  /** Screen positions of every hit on the scatter plot (for the fly-in), using the current view. */
  function scatterTargets() {
    if (!els || !view || els.scatter.offsetParent === null) return null;
    const rect = els.scatter.getBoundingClientRect();
    const box = { x0: 38, y0: 8, x1: rect.width - 8, y1: rect.height - 30 };
    const obs = hits.map((h) => h.t / 1000);
    const lo = Math.min(...obs) - 0.3;
    const hi = Math.max(...obs) + 0.3;
    const sx = (v) => rect.left + box.x0 + ((v - lo) / (hi - lo)) * (box.x1 - box.x0);
    const sy = (v) => rect.top + box.y1 - ((v - lo) / (hi - lo)) * (box.y1 - box.y0);
    const rank = timeRanks();
    return hits.map((h, i) => ({ dom: h.dom, to: { x: sx(view.fb.predicted[i] / 1000), y: sy(obs[i]) }, rank: rank[i] }));
  }

  return {
    load,
    precompute,
    buildPanel,
    scatterTargets,
    get hits() {
      return hits;
    },
    get cog() {
      return cog;
    },
    get mode() {
      return mode;
    },
    get precomputed() {
      return pre;
    },
    setTourMode() {
      mode = 'tour';
      live = null;
    },
    /** Fraction of scatter points drawn (0..1), quantised so the panel redraws only when it changes. */
    setReveal(f) {
      reveal = Math.round(clamp(f, 0, 1) * 50) / 50;
    },
    /** Called every frame; returns the view for the 3D layer. */
    update(phase) {
      if (mode === 'user') stepLive();
      view = mode === 'user' ? userView() : tourView(phase);
      renderPanel(view);
      return view;
    },
    get view() {
      return view;
    },
    get start() {
      return start;
    },
  };
}
