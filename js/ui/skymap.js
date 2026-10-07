// 2D sky chart for the last chapter: Orion for orientation, the teaching reconstruction (90%),
// IceCube-170922A's published 90% region and TXS 0506+056. East is left, as on sky maps.

import { ORION, IC170922A, TXS0506 } from '../science/sky.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Asymmetric 90% region drawn as four quarter-ellipses (RA+/-, Dec+/-). */
function asymPath(project, c) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dra = ca >= 0 ? c.raPlus : c.raMinus;
    const ddec = sa >= 0 ? c.decPlus : c.decMinus;
    const p = project(c.ra + ca * dra / Math.cos((c.dec * Math.PI) / 180), c.dec + sa * ddec);
    pts.push(`${p[0].toFixed(1)},${p[1].toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function circlePath(project, ra, dec, rDeg) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const p = project(ra + (Math.cos(a) * rDeg) / Math.cos((dec * Math.PI) / 180), dec + Math.sin(a) * rDeg);
    pts.push(`${p[0].toFixed(1)},${p[1].toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

export function createSkyMap(root) {
  root.innerHTML = '';
  const W = 440;
  const H = 360;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'skymap' });
  root.appendChild(svg);

  function render({ t = 99, fit, r90, step, show = null }) {
    svg.innerHTML = '';
    // main chart: RA 94..70 (east left), Dec -13..13
    const box = { x0: 44, y0: 26, x1: W - 16, y1: H - 40 };
    const raL = 94;
    const raR = 70;
    const decB = -13;
    const decT = 13;
    const project = (ra, dec) => [
      box.x0 + ((raL - ra) / (raL - raR)) * (box.x1 - box.x0),
      box.y1 - ((dec - decB) / (decT - decB)) * (box.y1 - box.y0),
    ];
    svg.appendChild(el('rect', { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0, class: 'sm-frame' }));
    for (let ra = 72; ra <= 92; ra += 4) {
      const [x] = project(ra, 0);
      svg.appendChild(el('line', { x1: x, y1: box.y0, x2: x, y2: box.y1, class: 'sm-grid' }));
      svg.appendChild(el('text', { x, y: box.y1 + 14, class: 'sm-tick' }, `${ra}°`));
    }
    for (let dec = -10; dec <= 10; dec += 5) {
      const [, y] = project(raL, dec);
      svg.appendChild(el('line', { x1: box.x0, y1: y, x2: box.x1, y2: y, class: dec === 0 ? 'sm-eq' : 'sm-grid' }));
      svg.appendChild(el('text', { x: box.x0 - 6, y: y + 4, class: 'sm-tick sm-right' }, `${dec > 0 ? '+' : ''}${dec}°`));
    }
    svg.appendChild(el('text', { x: (box.x0 + box.x1) / 2, y: H - 8, class: 'sm-axis' }, step.labels.ra));
    const yl = el('text', { x: 12, y: (box.y0 + box.y1) / 2, class: 'sm-axis', transform: `rotate(-90 12 ${(box.y0 + box.y1) / 2})` }, step.labels.dec);
    svg.appendChild(yl);

    // Orion
    const stars = ORION.stars;
    ORION.lines.forEach(([a, b]) => {
      const p = project(stars[a].ra, stars[a].dec);
      const q = project(stars[b].ra, stars[b].dec);
      svg.appendChild(el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: 'sm-con' }));
    });
    Object.values(stars).forEach((s) => {
      const p = project(s.ra, s.dec);
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: Math.max(1.6, 4.6 - s.mag * 1.0), class: 'sm-star' }));
    });
    const lbl = project(87.5, -4.5);
    svg.appendChild(el('text', { x: lbl[0], y: lbl[1], class: 'sm-con-label' }, step.labels.orion));

    // teaching reconstruction (appears first), then the real event and the blazar
    const showTeach = show ? show.teach : t > 0;
    const showReal = show ? show.real : t > 5.6;
    const showTxs = show ? show.txs : t > 7.5;
    if (showTeach && fit) {
      svg.appendChild(el('path', { d: circlePath(project, fit.ra, fit.dec, Math.max(r90, 0.3)), class: 'sm-teach' }));
    }
    if (showReal) svg.appendChild(el('path', { d: asymPath(project, IC170922A), class: 'sm-ic' }));
    if (showTxs) {
      const p = project(TXS0506.ra, TXS0506.dec);
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 3.2, class: 'sm-txs' }));
    }

    // zoom inset: RA 79.6..75.2, Dec 3.6..7.8
    const ib = { x0: box.x1 - 150, y0: box.y0 + 8, x1: box.x1 - 8, y1: box.y0 + 136 };
    const zL = 79.6;
    const zR = 75.2;
    const zB = 3.6;
    const zT = 7.8;
    const zp = (ra, dec) => [ib.x0 + ((zL - ra) / (zL - zR)) * (ib.x1 - ib.x0), ib.y1 - ((dec - zB) / (zT - zB)) * (ib.y1 - ib.y0)];
    if (showReal) {
      const c0 = project(zL, zT);
      const c1 = project(zR, zB);
      svg.appendChild(el('rect', { x: c0[0], y: c0[1], width: c1[0] - c0[0], height: c1[1] - c0[1], class: 'sm-zoombox' }));
      svg.appendChild(el('rect', { x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0, class: 'sm-inset' }));
      svg.appendChild(el('line', { x1: c1[0], y1: c0[1], x2: ib.x0, y2: ib.y0, class: 'sm-lead' }));
      // everything drawn in the zoom frame is clipped to the inset (the teaching circle is larger than it)
      const defs = el('defs');
      const clip = el('clipPath', { id: 'sm-inset-clip' });
      clip.appendChild(el('rect', { x: ib.x0, y: ib.y0, width: ib.x1 - ib.x0, height: ib.y1 - ib.y0 }));
      defs.appendChild(clip);
      svg.appendChild(defs);
      const inset = el('g', { 'clip-path': 'url(#sm-inset-clip)' });
      svg.appendChild(inset);
      if (fit) inset.appendChild(el('path', { d: circlePath(zp, fit.ra, fit.dec, Math.max(r90, 0.3)), class: 'sm-teach' }));
      inset.appendChild(el('path', { d: asymPath(zp, IC170922A), class: 'sm-ic' }));
      const b = zp(IC170922A.ra, IC170922A.dec);
      inset.appendChild(el('path', { d: `M ${b[0] - 4} ${b[1]} L ${b[0] + 4} ${b[1]} M ${b[0]} ${b[1] - 4} L ${b[0]} ${b[1] + 4}`, class: 'sm-cross' }));
      if (showTxs) {
        const p = zp(TXS0506.ra, TXS0506.dec);
        inset.appendChild(el('circle', { cx: p[0], cy: p[1], r: 4, class: 'sm-txs' }));
      }
    }

    // legend
    const lg = [
      [showTeach, 'sm-teach', step.labels.teach],
      [showReal, 'sm-ic', step.labels.ic],
      [showTxs, 'sm-txs-key', step.labels.txs],
    ];
    let ly = box.y1 - 46;
    lg.forEach(([on, cls, text]) => {
      if (!on) return;
      svg.appendChild(el('rect', { x: box.x0 + 8, y: ly - 8, width: 14, height: 9, class: `${cls} sm-key` }));
      svg.appendChild(el('text', { x: box.x0 + 28, y: ly, class: 'sm-legend' }, text));
      ly += 15;
    });
  }

  return { render };
}
