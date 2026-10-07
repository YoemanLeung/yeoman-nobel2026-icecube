// The Lab: three experiments on the same teaching model (scattering, backgrounds, track vs cascade).
// Each control re-runs the simulation with new physics parameters (same seed), so differences come
// from the physics and not from re-rolled randomness.

import { DEFAULT_PARAMS, CASCADE_PRESET, cleanPulses } from '../science/event.js';
import { quantile } from '../core/math.js';

export function createLab({ root, text, onChange, onReco }) {
  const state = { scatteringLength: DEFAULT_PARAMS.scatteringLength, noise: false, atmMuon: false, clean: false, kind: 'track' };

  function params() {
    const base = { scatteringLength: state.scatteringLength, noise: state.noise, atmMuon: state.atmMuon };
    return state.kind === 'cascade' ? { ...base, ...CASCADE_PRESET } : { ...base, kind: 'track' };
  }

  function build() {
    const t = text().lab;
    root.innerHTML = `
      <h3>${t.title}</h3>
      <p class="intro">${t.intro}</p>
      <section><h4>${t.scatter}</h4>
        <label class="slider"><span>${t.lambda}</span><input type="range" min="8" max="100" step="1" data-k="lambda" value="${state.scatteringLength}" /><output data-o="lambda"></output></label>
        <p class="note">${t.scatterNote}</p></section>
      <section><h4>${t.background}</h4>
        <label class="check"><input type="checkbox" data-k="noise" ${state.noise ? 'checked' : ''} /> ${t.noise}</label>
        <label class="check"><input type="checkbox" data-k="clean" ${state.clean ? 'checked' : ''} /> ${t.clean}</label>
        <p class="note">${t.cleanNote}</p>
        <label class="check"><input type="checkbox" data-k="atm" ${state.atmMuon ? 'checked' : ''} /> ${t.atm}</label>
        <p class="note">${t.atmNote}</p></section>
      <section><h4>${t.kind}</h4>
        <label class="check"><input type="radio" name="kind" value="track" ${state.kind === 'track' ? 'checked' : ''} /> ${t.track}</label>
        <label class="check"><input type="radio" name="kind" value="cascade" ${state.kind === 'cascade' ? 'checked' : ''} /> ${t.cascade}</label>
        <p class="note">${t.kindNote}</p></section>
      <p class="stats" data-o="stats"></p>
      <p class="stats" data-o="noise"></p>
      <p class="stats" data-o="reco"></p>
      <button type="button" class="run" data-a="reco">${t.reco}</button>`;
    const q = (s) => root.querySelector(s);
    const lambda = q('[data-k="lambda"]');
    const out = q('[data-o="lambda"]');
    out.textContent = `${state.scatteringLength} m`;
    lambda.addEventListener('input', () => {
      state.scatteringLength = Number(lambda.value);
      out.textContent = `${state.scatteringLength} m`;
    });
    lambda.addEventListener('change', () => onChange(params(), state));
    q('[data-k="noise"]').addEventListener('change', (e) => {
      state.noise = e.target.checked;
      onChange(params(), state);
    });
    q('[data-k="clean"]').addEventListener('change', (e) => {
      state.clean = e.target.checked;
      onChange(params(), state);
    });
    q('[data-k="atm"]').addEventListener('change', (e) => {
      state.atmMuon = e.target.checked;
      onChange(params(), state);
    });
    root.querySelectorAll('input[name="kind"]').forEach((r) =>
      r.addEventListener('change', (e) => {
        state.kind = e.target.value;
        onChange(params(), state);
      }),
    );
    q('[data-a="reco"]').addEventListener('click', () => onReco(state));
  }

  /** Summaries shown under the controls after each run. */
  function report(array, ev, recoResult) {
    const t = text().lab;
    const signal = ev.pulses.filter((p) => p.kind === 'signal');
    const delays = signal.map((p) => p.t - p.tGeo).sort((a, b) => a - b);
    const q = (s) => root.querySelector(s);
    if (!q('[data-o="stats"]')) return;
    q('[data-o="stats"]').textContent = t.stats.replace('{hits}', String(new Set(signal.map((p) => p.dom)).size)).replace('{delay}', String(Math.round(quantile(delays, 0.5) || 0)));
    if (state.noise) {
      const n = ev.pulses.filter((p) => p.kind === 'noise').length;
      const kept = cleanPulses(array, ev.pulses).filter((p) => p.kind === 'noise').length;
      q('[data-o="noise"]').textContent = t.statsNoise.replace('{n}', String(n)).replace('{kept}', String(state.clean ? kept : n));
    } else {
      q('[data-o="noise"]').textContent = '';
    }
    q('[data-o="reco"]').textContent = recoResult
      ? t.recoStats.replace('{err}', recoResult.err.toFixed(1)).replace('{r90}', recoResult.r90.toFixed(1))
      : '';
  }

  return { build, report, state, params };
}
