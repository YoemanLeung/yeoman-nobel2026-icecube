// The hand-off from picture to data: every recorded DOM releases a dot that flies along an arc into
// its place on the recorded-vs-predicted plot. Pure function of the progress value, so scrubbing works.

import { clamp, toCss } from '../core/math.js';

export function createFlyLayer(root) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fly-layer';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  const g = canvas.getContext('2d');
  let shown = false;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  return {
    /** items: [{from: {x, y}, to: {x, y}, color: [r, g, b], rank: 0..1}], progress 0..1 */
    draw(items, progress) {
      const { w, h } = fit();
      g.clearRect(0, 0, w, h);
      shown = true;
      const k = clamp(w / 900, 0.6, 1); // smaller dots on a phone
      items.forEach((it) => {
        const p = clamp((progress - it.rank * 0.45) / 0.55, 0, 1);
        if (p <= 0 || p >= 1) return;
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const cx = (it.from.x + it.to.x) / 2;
        const cy = Math.min(it.from.y, it.to.y) - 140 * k;
        const x = (1 - e) * (1 - e) * it.from.x + 2 * (1 - e) * e * cx + e * e * it.to.x;
        const y = (1 - e) * (1 - e) * it.from.y + 2 * (1 - e) * e * cy + e * e * it.to.y;
        const r = (4.6 - 2.2 * e) * k;
        g.fillStyle = toCss(it.color, 0.22);
        g.beginPath();
        g.arc(x, y, r * 2.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = toCss(it.color, 0.95);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });
    },
    clear() {
      if (!shown) return;
      const { w, h } = fit();
      g.clearRect(0, 0, w, h);
      shown = false;
    },
  };
}
