// Small canvas plots for the side panels: recorded-vs-predicted scatter, residual histogram, and a
// DOM's photon-arrival histogram. Device-pixel aware, dark theme, axis labels in the panel language.

import { clamp, timeColor, residualColor, toCss } from '../core/math.js';

function setup(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 260;
  const h = canvas.clientHeight || 150;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

const AXIS = 'rgba(190, 220, 240, 0.55)';
const GRID = 'rgba(190, 220, 240, 0.12)';
const TEXT = 'rgba(220, 236, 248, 0.85)';
const FONT = '11px "PingFang SC", "Noto Sans SC", system-ui, sans-serif';

function frame(g, box, xLabel, yLabel) {
  g.strokeStyle = AXIS;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(box.x0, box.y0);
  g.lineTo(box.x0, box.y1);
  g.lineTo(box.x1, box.y1);
  g.stroke();
  g.fillStyle = TEXT;
  g.font = FONT;
  g.textAlign = 'center';
  if (xLabel) g.fillText(xLabel, (box.x0 + box.x1) / 2, box.y1 + 24);
  if (yLabel) {
    g.save();
    g.translate(box.x0 - 26, (box.y0 + box.y1) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(yLabel, 0, 0);
    g.restore();
  }
}

/** Recorded vs predicted time (us). Points on the diagonal = consistent; below it = impossible early light. */
export function drawScatter(canvas, pred, obs, { xLabel, yLabel, range, reveal = 1, rank = null } = {}) {
  const { g, w, h } = setup(canvas);
  const box = { x0: 38, y0: 8, x1: w - 8, y1: h - 30 };
  const [lo, hi] = range || [Math.min(...obs, ...pred), Math.max(...obs, ...pred)];
  const sx = (v) => box.x0 + ((v - lo) / (hi - lo)) * (box.x1 - box.x0);
  const sy = (v) => box.y1 - ((v - lo) / (hi - lo)) * (box.y1 - box.y0);
  // forbidden zone (recorded earlier than any straight path allows)
  g.fillStyle = 'rgba(51, 199, 255, 0.07)';
  g.beginPath();
  g.moveTo(sx(lo), sy(lo));
  g.lineTo(sx(hi), sy(hi));
  g.lineTo(sx(hi), sy(lo));
  g.closePath();
  g.fill();
  g.strokeStyle = GRID;
  for (let k = 1; k < 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    g.beginPath();
    g.moveTo(box.x0, sy(v));
    g.lineTo(box.x1, sy(v));
    g.stroke();
  }
  g.strokeStyle = 'rgba(255, 214, 102, 0.8)';
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(sx(lo), sy(lo));
  g.lineTo(sx(hi), sy(hi));
  g.stroke();
  g.setLineDash([]);
  for (let i = 0; i < obs.length; i++) {
    if (rank && rank[i] > reveal) continue; // not landed yet (fly-in)
    const r = obs[i] - pred[i];
    g.fillStyle = toCss(residualColor(0.5 + 0.5 * clamp(r / 0.3, -1, 1)), 0.85);
    g.beginPath();
    g.arc(sx(pred[i]), sy(obs[i]), 2.1, 0, Math.PI * 2);
    g.fill();
  }
  frame(g, box, xLabel, yLabel);
  g.fillStyle = 'rgba(220,236,248,0.6)';
  g.textAlign = 'left';
  g.fillText(`${lo.toFixed(1)}`, box.x0 + 2, box.y1 + 12);
  g.textAlign = 'right';
  g.fillText(`${hi.toFixed(1)}`, box.x1, box.y1 + 12);
}

/** Histogram of residuals (ns) with the direct-light window marked. */
export function drawResidualHist(canvas, residuals, { label = 'Δt (ns)', lo = -400, hi = 2000, bins = 48 } = {}) {
  const { g, w, h } = setup(canvas);
  const box = { x0: 30, y0: 8, x1: w - 8, y1: h - 26 };
  const counts = new Array(bins).fill(0);
  residuals.forEach((r) => {
    const k = Math.floor(((r - lo) / (hi - lo)) * bins);
    if (k >= 0 && k < bins) counts[k] += 1;
  });
  const max = Math.max(1, ...counts);
  const bw = (box.x1 - box.x0) / bins;
  const zero = box.x0 + ((0 - lo) / (hi - lo)) * (box.x1 - box.x0);
  g.fillStyle = 'rgba(255, 214, 102, 0.12)';
  g.fillRect(zero - (30 / (hi - lo)) * (box.x1 - box.x0), box.y0, (110 / (hi - lo)) * (box.x1 - box.x0), box.y1 - box.y0);
  counts.forEach((c, k) => {
    const center = lo + ((k + 0.5) / bins) * (hi - lo);
    g.fillStyle = toCss(residualColor(0.5 + 0.5 * clamp(center / 300, -1, 1)), 0.9);
    const bh = (c / max) * (box.y1 - box.y0);
    g.fillRect(box.x0 + k * bw + 0.5, box.y1 - bh, bw - 1, bh);
  });
  g.strokeStyle = 'rgba(255, 214, 102, 0.85)';
  g.beginPath();
  g.moveTo(zero, box.y0);
  g.lineTo(zero, box.y1);
  g.stroke();
  frame(g, box, label, '');
  g.fillStyle = 'rgba(220,236,248,0.6)';
  g.textAlign = 'center';
  g.fillText('0', zero, box.y1 + 12);
}

/** Photon arrival times inside one DOM (ns after its first photon). */
export function drawPulse(canvas, times, { label = 'ns', color = [0.6, 0.85, 1] } = {}) {
  const { g, w, h } = setup(canvas);
  const box = { x0: 26, y0: 8, x1: w - 8, y1: h - 24 };
  if (!times || times.length === 0) {
    frame(g, box, label, '');
    return;
  }
  const t0 = times[0];
  const span = Math.max(200, Math.ceil((times[times.length - 1] - t0) / 100) * 100 + 100);
  const bins = 40;
  const counts = new Array(bins).fill(0);
  times.forEach((t) => {
    const k = Math.min(bins - 1, Math.floor(((t - t0) / span) * bins));
    counts[k] += 1;
  });
  const max = Math.max(1, ...counts);
  const bw = (box.x1 - box.x0) / bins;
  counts.forEach((c, k) => {
    const bh = (c / max) * (box.y1 - box.y0);
    g.fillStyle = toCss(color, 0.9);
    g.fillRect(box.x0 + k * bw + 0.5, box.y1 - bh, bw - 1, bh);
  });
  frame(g, box, label, '');
  g.fillStyle = 'rgba(220,236,248,0.6)';
  g.textAlign = 'left';
  g.fillText('0', box.x0, box.y1 + 12);
  g.textAlign = 'right';
  g.fillText(`${span}`, box.x1, box.y1 + 12);
}

/** A horizontal colour ramp for legends. */
export function rampCss(kind) {
  const f = kind === 'resid' ? residualColor : timeColor;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${toCss(f(t))} ${t * 100}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
