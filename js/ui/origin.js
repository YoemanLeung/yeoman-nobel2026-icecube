// Two flat diagrams for the origin chapter: the production sketch (p + γ → π → ν) and the
// three-messenger comparison. Kept in 2D so symbols and words stay legible.

export function renderProcess(root, t) {
  root.innerHTML = `
    <div class="inset-title">${t.origin.process}</div>
    <svg viewBox="0 0 420 150" class="process" role="img" aria-label="${t.origin.process}">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#cfe6f5" /></marker></defs>
      <g class="pr-p"><circle cx="40" cy="58" r="10" /><text x="40" y="92">${t.origin.p}</text></g>
      <path class="pr-move" d="M 54 58 L 112 58" marker-end="url(#arr)" />
      <path class="pr-gamma" d="M 128 18 q 6 -6 12 0 t 12 0 t 12 0" />
      <text class="pr-label" x="146" y="12">${t.origin.g}</text>
      <circle class="pr-hit" cx="128" cy="58" r="14" />
      <path class="pr-move" d="M 144 58 L 210 58" marker-end="url(#arr)" />
      <g class="pr-pi"><circle cx="226" cy="58" r="9" /><text x="226" y="92">${t.origin.pi}</text></g>
      <path class="pr-move" d="M 238 52 L 300 30" marker-end="url(#arr)" />
      <path class="pr-move" d="M 238 64 L 300 86" marker-end="url(#arr)" />
      <text class="pr-small" x="312" y="34">μ⁺ → e⁺ + ν_e + ν̄_μ</text>
      <path class="pr-nu" d="M 300 88 L 392 118" marker-end="url(#arr)" />
      <text class="pr-nu-label" x="350" y="140">${t.origin.nu}</text>
    </svg>`;
}

export function renderMessengers(root, t) {
  const [g, p, n] = t.origin.lanes;
  const [gn, pn, nn] = t.origin.laneNotes;
  root.innerHTML = `
    <svg viewBox="0 0 560 250" class="messengers" role="img" aria-label="${g}, ${p}, ${n}">
      <circle cx="44" cy="125" r="18" class="ms-source" />
      <text x="44" y="166" class="ms-cap">${t.origin.source}</text>
      <circle cx="516" cy="125" r="16" class="ms-earth" />
      <text x="516" y="166" class="ms-cap">${t.origin.earth}</text>
      <ellipse cx="300" cy="46" rx="34" ry="20" class="ms-cloud" />
      <path d="M 120 112 C 200 70 260 150 330 108 S 440 70 500 120" class="ms-field" />
      <path d="M 120 142 C 200 180 260 100 330 142 S 440 180 500 130" class="ms-field" />
      <path class="ms-gamma ms-anim" d="M 62 112 C 120 80 200 50 290 46" />
      <text x="140" y="40" class="ms-lab ms-g">${g}</text>
      <text x="330" y="22" class="ms-note">${gn}</text>
      <path class="ms-proton ms-anim" d="M 62 128 C 140 200 220 210 300 170 S 420 70 500 132" />
      <text x="190" y="226" class="ms-lab ms-p">${p}</text>
      <text x="330" y="226" class="ms-note">${pn}</text>
      <path class="ms-nu ms-anim" d="M 62 125 L 498 125" />
      <text x="200" y="116" class="ms-lab ms-n">${n}</text>
      <text x="330" y="146" class="ms-note">${nn}</text>
    </svg>
    <button type="button" class="ms-replay">${t.origin.replay}</button>`;
  // a bright particle races along each (faint) path; the photon stops at the dust cloud
  const svg = root.querySelector('svg');
  const lanes = [...root.querySelectorAll('.ms-anim')].map((path) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', path.classList.contains('ms-nu') ? '5.5' : '5');
    dot.setAttribute('class', `ms-dot ${path.getAttribute('class').split(' ')[0]}-dot`);
    svg.appendChild(dot);
    return { path, dot, absorbed: path.classList.contains('ms-gamma') };
  });
  let raf = 0;
  const replay = () => {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 3600); // one clock for start and progress (virtual in #export)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      lanes.forEach(({ path, dot, absorbed }) => {
        const len = path.getTotalLength();
        const pt = path.getPointAtLength(e * len);
        dot.setAttribute('cx', pt.x.toFixed(1));
        dot.setAttribute('cy', pt.y.toFixed(1));
        dot.style.opacity = absorbed ? String(1 - 0.85 * Math.max(0, (e - 0.8) / 0.2)) : '1';
      });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  root.querySelector('.ms-replay').addEventListener('click', replay);
  return { replay };
}
