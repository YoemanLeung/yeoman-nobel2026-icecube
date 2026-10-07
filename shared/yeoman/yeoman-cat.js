// <yeoman-cat> — the animated mascot of 星野旅人 Yeoman, as a dependency-free web component.
//
//   <script type="module" src="../_shared/yeoman/yeoman-cat.js"></script>
//   <yeoman-cat size="140" bubble="right" sticker></yeoman-cat>
//
//   const cat = document.querySelector('yeoman-cat');
//   cat.setPose('wave');                 // persistent pose (see POSES)
//   cat.react('surprise', 1600);         // temporary pose, then back
//   cat.wear(['beanie', 'scarf']);       // accessories: beanie scarf cap magnifier telescope
//   cat.say('你好呢', { hold: 4000 });    // speech bubble with typing effect
//   cat.lookAt(0.6, -0.2);               // gaze, each component in [-1, 1]
//   cat.setClock(() => seconds);         // optional external clock (frame-by-frame rendering)
//   cat.addEventListener('yeoman-poke', (e) => { e.preventDefault(); cat.say('…喵？'); });
//
// Attributes: size, bubble (right | left | top), sticker (white die-cut border drawn as geometry, so it
// moves with each part and never shimmers), boil (opt-in hand-drawn line boil), reduced-motion, seed.
// Motion is procedural (springs + sines) so poses blend. All random timing comes from a seeded stream.

import { PALETTE, SHAPES, STROKES, FACE, ACCESSORIES, SHOULDERS, brushVariants } from './yeoman-art.js';

// The resting face is the stickers' sulky one (corners down); the soft faces are the contrast.
const POSES = {
  idle: { armL: 24, armR: -24, lean: 0, eyes: 'dot', mouth: 'cat', ears: 0 },
  huff: { armL: 14, armR: -14, lean: 4, eyes: 'meh', mouth: 'pout', ears: -3, lookX: 0.85, lookY: -0.2, blush: 1.12 },
  smug: { armL: 30, armR: -30, lean: -2, eyes: 'meh', mouth: 'w', ears: 2, blush: 1 },
  sparkle: { armL: 26, armR: -26, lean: 0, eyes: 'sparkle', mouth: 'w', ears: 5, blush: 1.25, bounce: 0.45, fx: 'sparkle' },
  wave: { armL: 6, armR: -138, lean: -2, eyes: 'happy', mouth: 'w', ears: 3, wave: 14 },
  present: { armL: 108, armR: -108, lean: 0, eyes: 'dot', mouth: 'cat', ears: 2 },
  point: { armL: 6, armR: -100, lean: -3, eyes: 'dot', mouth: 'cat', ears: 2 },
  think: { armL: 8, armR: 100, lean: 6, eyes: 'up', mouth: 'flat', lookY: -0.7, lookX: 0.3, fx: '?' },
  surprise: { armL: 150, armR: -150, lean: 0, eyes: 'wide', mouth: 'o', ears: 7, hop: true, fx: '!' },
  cheer: { armL: 156, armR: -156, lean: 0, eyes: 'happy', mouth: 'w', ears: 4, bounce: 1, fx: 'sparkle', blush: 1.2 },
  shiver: { armL: -26, armR: 26, lean: 0, eyes: 'squint', mouth: 'wavy', ears: -7, shiver: 1 },
  sleep: { armL: 2, armR: -2, lean: 5, eyes: 'closed', mouth: 'cat', ears: -9, squash: 0.05, fx: 'z' },
  stargaze: { armL: 18, armR: -112, lean: -4, eyes: 'up', mouth: 'cat', lookY: -1, lookX: 0.5, ears: 2 },
  inspect: { armL: 8, armR: 38, lean: 3, eyes: 'dot', mouth: 'flat', lookX: -0.4, lookY: 0.5 },
  happy: { armL: 12, armR: -12, lean: 0, eyes: 'happy', mouth: 'w', ears: 3, blush: 1.15 },
};

const HALO = '#fffaf0';
const TAIL_D = 'M 166 197 C 190 197 203 183 203 167 C 203 157 199 151 193 149';

const STYLE = `
  :host { display: inline-block; position: relative; --cat-size: 140px; width: calc(var(--cat-size) * 1.04);
    height: var(--cat-size); user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .wrap { position: absolute; inset: 0; }
  svg.cat { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; cursor: pointer;
    transform: rotate(var(--tilt, 0deg)); transform-origin: 45.8% 89.6%; } /* --tilt leans the figure on its feet; the bubble stays upright */
  svg.cat:focus-visible { outline: 2px dashed ${PALETTE.yellow}; outline-offset: 4px; border-radius: 12px; }
  .ink path, .ink { fill: ${PALETTE.ink}; }
  .line { fill: none; stroke: ${PALETTE.ink}; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
  .acc-line { fill: none; stroke: ${PALETTE.ink}; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
  .mouth { fill: none; stroke: ${PALETTE.ink}; stroke-width: 2.7; stroke-linecap: round; stroke-linejoin: round; }
  .eyes { fill: ${PALETTE.ink}; }
  :host(:not([boil])) .v1, :host(:not([boil])) .v2,
  .root[data-boil="0"] .v1, .root[data-boil="0"] .v2,
  .root[data-boil="1"] .v0, .root[data-boil="1"] .v2,
  .root[data-boil="2"] .v0, .root[data-boil="2"] .v1 { display: none; }
  :host(:not([boil])) .v0 { display: inline; }
  .halo, .acc-halo { display: none; }
  :host([sticker]) .halo, :host([sticker]) .acc.on .acc-halo { display: inline; }
  .halo path { fill: ${HALO}; stroke: ${HALO}; stroke-width: 13; stroke-linejoin: round; stroke-linecap: round; }
  .halo .h-tail path { fill: none; stroke-width: 26; }
  .acc-halo { fill: ${HALO}; stroke: ${HALO}; stroke-width: 9; stroke-linejoin: round; stroke-linecap: round; }
  .acc { display: none; }
  .acc.on { display: inline; }
  .pads { transition: opacity 0.2s; }
  .bubble { position: absolute; left: 86%; bottom: 74%; width: max-content; min-width: 6em; max-width: var(--bubble-max, min(18em, 62vw));
    padding: 0.62em 0.85em; border-radius: 1.1em; background: rgba(255, 251, 241, 0.97); color: #2a2420;
    font: 500 var(--bubble-font-size, 15px)/1.55 var(--bubble-font, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.28), 0 0 0 1.5px rgba(30, 26, 23, 0.85);
    opacity: 0; transform: translateY(6px) scale(0.96); transform-origin: 0% 100%;
    transition: opacity 0.22s ease, transform 0.22s ease; pointer-events: none; white-space: pre-line; }
  .bubble.show { opacity: 1; transform: none; }
  .bubble .unsaid { visibility: hidden; }
  .bubble::after { content: ""; position: absolute; left: 0.9em; bottom: -9px; width: 14px; height: 14px;
    background: inherit; transform: rotate(45deg) skew(8deg, 8deg); box-shadow: 1.5px 1.5px 0 0 rgba(30, 26, 23, 0.85); }
  :host([bubble="left"]) .bubble { left: auto; right: 86%; transform-origin: 100% 100%; }
  :host([bubble="left"]) .bubble::after { left: auto; right: 0.9em; }
  :host([bubble="top"]) .bubble { left: 50%; bottom: 100%; transform: translate(-50%, 6px) scale(0.96); }
  :host([bubble="top"]) .bubble.show { transform: translate(-50%, 0); }
  :host([bubble="top"]) .bubble::after { left: calc(50% - 7px); }
  /* above the cat, growing to the right: for a cat docked at the left edge of a narrow screen */
  :host([bubble="top-left"]) .bubble { left: 6%; bottom: 100%; transform: translateY(6px) scale(0.96); transform-origin: 12% 100%; }
  :host([bubble="top-left"]) .bubble.show { transform: none; }
  :host([bubble="top-left"]) .bubble::after { left: 1.6em; }
  .fx { position: absolute; pointer-events: none; font: 700 calc(var(--cat-size) * 0.2)/1 "Caveat Brush", "Comic Sans MS", cursive;
    color: ${PALETTE.ink}; text-shadow: 0 0 6px rgba(255, 255, 255, 0.85); animation: rise 1.4s ease-out forwards; }
  .fx.sparkle { color: ${PALETTE.yellow}; text-shadow: 0 0 8px rgba(255, 220, 120, 0.9); }
  .fx.z { animation: drift 2.6s ease-out forwards; font-size: calc(var(--cat-size) * 0.16); }
  .fx.puff { color: #e8f6ff; text-shadow: 0 0 6px rgba(0, 0, 0, 0.4); font-size: calc(var(--cat-size) * 0.14); animation: drift 1.6s ease-out forwards; }
  @keyframes rise { 0% { opacity: 0; transform: translateY(8px) scale(0.6); } 20% { opacity: 1; transform: translateY(0) scale(1.1); }
    100% { opacity: 0; transform: translateY(-26px) scale(1); } }
  @keyframes drift { 0% { opacity: 0; transform: translate(0, 0) scale(0.7); } 25% { opacity: 1; }
    100% { opacity: 0; transform: translate(18px, -40px) scale(1.15); } }
`;

const springTo = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

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

function brushGroup(strokes, seed) {
  return brushVariants(strokes, seed)
    .map((markup, v) => `<g class="v${v}">${markup}</g>`)
    .join('');
}

function catMarkup() {
  const P = PALETTE;
  const pads = `
    <g class="pads"><ellipse cx="0" cy="25" rx="4.4" ry="3.4" fill="${P.pad}" />
    <circle cx="-5" cy="19.4" r="1.9" fill="${P.pad}" /><circle cx="0" cy="18" r="1.9" fill="${P.pad}" /><circle cx="5" cy="19.4" r="1.9" fill="${P.pad}" /></g>`;
  const arm = (side, seed) => `
    <path d="${SHAPES.arm}" fill="url(#creamFill)" />
    <g class="ink">${brushGroup(STROKES.arm, seed)}</g>${pads}
    ${side === 'R' ? `<g class="acc acc-magnifier">${ACCESSORIES.magnifier}</g>` : ''}`;
  return `
  <svg class="cat" viewBox="0 0 240 230" role="img" aria-label="Yeoman" tabindex="0">
    <defs>
      <radialGradient id="creamFill" cx="46%" cy="40%" r="70%">
        <stop offset="0" stop-color="${P.cream}" /><stop offset="0.78" stop-color="${P.cream}" />
        <stop offset="1" stop-color="${P.creamShade}" />
      </radialGradient>
      <radialGradient id="yellowFill" cx="40%" cy="35%" r="75%">
        <stop offset="0" stop-color="#ffd85c" /><stop offset="1" stop-color="${P.yellowDeep}" />
      </radialGradient>
      <clipPath id="bodyClip"><path d="${SHAPES.body}" /></clipPath>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" /></filter>
      <filter id="haloShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" />
        <feOffset dy="2.4" result="off" />
        <feFlood flood-color="#000" flood-opacity="0.38" />
        <feComposite in2="off" operator="in" />
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <ellipse class="ground" cx="110" cy="209" rx="66" ry="7" fill="rgba(0, 0, 0, 0.28)" filter="url(#soft)" />
    <g class="root" data-boil="0">
      <g class="acc acc-telescope">${ACCESSORIES.telescope}</g>
      <g class="halo" filter="url(#haloShadow)">
        <g class="h-tail"><path d="${TAIL_D}" /></g>
        <g class="h-earL"><path d="${SHAPES.earL}" /></g>
        <g class="h-earR"><path d="${SHAPES.earR}" /></g>
        <path d="${SHAPES.body}" /><path d="${SHAPES.footL}" /><path d="${SHAPES.footR}" />
        <g class="h-armL"><path d="${SHAPES.arm}" /></g>
        <g class="h-armR"><path d="${SHAPES.arm}" /></g>
      </g>
      <g class="tail">
        <path d="${TAIL_D}" fill="none" stroke="${P.ink}" stroke-width="15" stroke-linecap="round" />
        <path d="${TAIL_D}" fill="none" stroke="${P.cream}" stroke-width="8.6" stroke-linecap="round" />
      </g>
      <g class="earL"><path d="${SHAPES.earL}" fill="url(#yellowFill)" /><g class="ink">${brushGroup(STROKES.earL, 11)}</g></g>
      <g class="earR"><path d="${SHAPES.earR}" fill="url(#creamFill)" /><g class="ink">${brushGroup(STROKES.earR, 12)}</g></g>
      <g class="body">
        <path d="${SHAPES.body}" fill="url(#creamFill)" />
        <g clip-path="url(#bodyClip)">
          <path d="${SHAPES.patch}" fill="url(#yellowFill)" />
          <path d="${SHAPES.spot}" fill="url(#yellowFill)" />
        </g>
        <g class="ink">${brushGroup(STROKES.body, 21)}</g>
      </g>
      <g class="acc acc-scarf" transform="translate(110 -26) scale(0.92 1) translate(-110 0)">${ACCESSORIES.scarf}</g>
      <g class="feet">
        <path d="${SHAPES.footL}" fill="url(#creamFill)" /><path d="${SHAPES.footR}" fill="url(#creamFill)" />
        <g class="ink">${brushGroup(STROKES.footL, 31)}${brushGroup(STROKES.footR, 32)}</g>
      </g>
      <g class="armL">${arm('L', 41)}</g>
      <g class="armR">${arm('R', 42)}</g>
      <g class="face">
        <g class="blush" filter="url(#soft)" opacity="0.82">
          <ellipse cx="${FACE.blushL[0]}" cy="${FACE.blushL[1]}" rx="12" ry="7" fill="${P.blush}" />
          <ellipse cx="${FACE.blushR[0]}" cy="${FACE.blushR[1]}" rx="12" ry="7" fill="${P.blush}" />
        </g>
        <g class="eyes"><g class="eyeL"></g><g class="eyeR"></g></g>
        <path class="mouth" d="${FACE.mouths.cat}" />
      </g>
      <g class="acc acc-beanie" transform="translate(0 -16)">${ACCESSORIES.beanie}</g>
      <g class="acc acc-cap" transform="translate(0 -16)">${ACCESSORIES.cap}</g>
    </g>
  </svg>`;
}

class YeomanCat extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'reduced-motion'];
  }

  constructor() {
    super();
    this._pose = 'idle';
    this._temp = null; // { name, until }
    this._look = { x: 0, y: 0, tx: 0, ty: 0, auto: true };
    this._pointAngle = -100;
    this._eyes = null;
    this._mouth = null;
    this._state = { armL: 6, armR: -6, lean: 0, ears: 0, squash: 0, hopT: -1, bounceAmp: 0, shiver: 0, waveAmp: 0, tassel: 0, tasselV: 0, pom: 0, pomV: 0, blush: 0.82 };
    this._line = null; // { text, shown } for showLine()
    this._timers = { blinkAt: 2, blinkT: -1, twitchAt: 6, twitchT: -1, twitchSide: 1, lookAt: 4, fxAt: 0, boilAt: 0, puffAt: 1 };
    this._boil = 0;
    this._clock = 0;
    this._last = 0;
    this._raf = 0;
    this._typing = 0;
    this._hide = 0;
    this._clockFn = null;
    this._rand = mulberry(7);
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    this._rand = mulberry(Number(this.getAttribute('seed')) || 7);
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="wrap">${catMarkup()}<div class="bubble" role="status" aria-live="polite"></div></div>`;
    const q = (s) => root.querySelector(s);
    this._el = {
      svg: q('svg'),
      root: q('.root'),
      tail: q('.tail'),
      earL: q('.earL'),
      earR: q('.earR'),
      armL: q('.armL'),
      armR: q('.armR'),
      hTail: q('.h-tail'),
      hEarL: q('.h-earL'),
      hEarR: q('.h-earR'),
      hArmL: q('.h-armL'),
      hArmR: q('.h-armR'),
      padsL: q('.armL .pads'),
      padsR: q('.armR .pads'),
      face: q('.face'),
      eyeL: q('.eyeL'),
      eyeR: q('.eyeR'),
      mouth: q('.mouth'),
      blush: q('.blush'),
      bubble: q('.bubble'),
      wrap: q('.wrap'),
      tassel: q('.tassel'),
      pompom: q('.pompom'),
      ground: q('.ground'),
    };
    this._motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._applySize();
    this._renderFace('dot', 'cat');
    this._el.svg.addEventListener('click', () => this._poke());
    this._el.svg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._poke();
      }
    });
    this._onVisibility = () => (document.hidden ? this._stop() : this._start());
    document.addEventListener('visibilitychange', this._onVisibility);
    this._start();
  }

  disconnectedCallback() {
    this._stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this._applySize();
  }

  // ---------------------------------------------------------------- public API
  setPose(name) {
    if (POSES[name]) this._pose = name;
    this._temp = null;
    this._fxFor(name);
    return this;
  }

  get pose() {
    return this._temp ? this._temp.name : this._pose;
  }

  react(name, ms = 1500) {
    if (!POSES[name]) return this;
    this._temp = { name, until: this._clock + ms / 1000 };
    if (POSES[name].hop) this._state.hopT = 0;
    this._fxFor(name);
    return this;
  }

  /** Point the right paw toward a direction in screen space (dx, dy), e.g. (1, -0.4). */
  pointAt(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    this._pointAngle = (Math.atan2(-dx / len, dy / len) * 180) / Math.PI;
    if (this._pointAngle > 20) this._pointAngle = Math.min(this._pointAngle, 30);
    this.lookAt(dx / len, dy / len);
    return this.setPose('point');
  }

  lookAt(x, y) {
    if (x === null || x === undefined) {
      this._look.auto = true;
      return this;
    }
    this._look.auto = false;
    this._look.tx = Math.max(-1, Math.min(1, x));
    this._look.ty = Math.max(-1, Math.min(1, y));
    return this;
  }

  wear(items = []) {
    const want = new Set(items);
    this.shadowRoot.querySelectorAll('.acc').forEach((g) => {
      const name = [...g.classList].find((c) => c.startsWith('acc-')).slice(4);
      g.classList.toggle('on', want.has(name));
    });
    return this;
  }

  say(text, { hold, typing = true } = {}) {
    const b = this._el.bubble;
    this._line = null;
    clearInterval(this._typing);
    clearTimeout(this._hide);
    if (!text) {
      b.classList.remove('show');
      return this;
    }
    b.classList.add('show');
    const chars = [...String(text)];
    if (!typing || this._reduced()) {
      b.textContent = text;
    } else {
      let i = 0;
      b.textContent = '';
      const step = /[　-鿿＀-￯]/.test(text) ? 34 : 16;
      this._typing = setInterval(() => {
        i += 1;
        b.textContent = chars.slice(0, i).join('');
        if (i >= chars.length) clearInterval(this._typing);
      }, step);
    }
    const ms = hold === undefined ? 2600 + chars.length * 90 : hold;
    if (Number.isFinite(ms)) this._hide = setTimeout(() => b.classList.remove('show'), ms);
    return this;
  }

  quiet() {
    this._line = null;
    return this.say('');
  }

  /**
   * Show the first `count` characters of `text` in the bubble, without timers: a narration player drives
   * it from its own clock (in sync with the voice, and frame-exact in a video export). null hides it.
   */
  showLine(text, count = Infinity) {
    const b = this._el && this._el.bubble;
    if (!b) return this;
    if (!text) {
      if (this._line) {
        b.classList.remove('show');
        this._line = null;
      }
      return this;
    }
    clearInterval(this._typing);
    clearTimeout(this._hide);
    const chars = [...String(text)];
    const n = Math.max(0, Math.min(chars.length, Math.floor(count)));
    if (!this._line || this._line.text !== text || this._line.shown !== n) {
      // the full line reserves the bubble's size, so it does not grow while the words come in
      b.innerHTML = `<span class="said"></span><span class="unsaid"></span>`;
      b.firstChild.textContent = chars.slice(0, n).join('');
      b.lastChild.textContent = chars.slice(n).join('');
      this._line = { text, shown: n };
    }
    b.classList.add('show');
    return this;
  }

  /** Drive the motion from an external clock in seconds (e.g. a video renderer); null = real time. */
  setClock(fn) {
    this._clockFn = typeof fn === 'function' ? fn : null;
    this._last = this._now();
    return this;
  }

  // ---------------------------------------------------------------- internals
  _now() {
    return this._clockFn ? this._clockFn() * 1000 : performance.now();
  }

  _reduced() {
    return this.hasAttribute('reduced-motion') || (this._motionQuery && this._motionQuery.matches);
  }

  _applySize() {
    const size = parseFloat(this.getAttribute('size')) || 140;
    this.style.setProperty('--cat-size', `${size}px`);
  }

  _start() {
    if (this._raf) return;
    this._last = this._now();
    const loop = () => {
      const now = this._now();
      const dt = Math.max(0, Math.min(0.05, (now - this._last) / 1000));
      this._last = now;
      this._tick(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _poke() {
    const ev = new CustomEvent('yeoman-poke', { bubbles: true, composed: true, cancelable: true });
    const handled = !this.dispatchEvent(ev);
    this._timers.twitchT = 0;
    this._timers.twitchSide = this._rand() < 0.5 ? -1 : 1;
    if (this.pose !== 'sleep') this._state.hopT = 0;
    if (!handled) this.say('…喵？', { hold: 1800 });
  }

  _fxFor(name) {
    const fx = POSES[name] && POSES[name].fx;
    if (!fx) return;
    if (fx === 'z') {
      this._timers.fxAt = this._clock + 0.4;
      return;
    }
    if (fx === 'sparkle') {
      ['✦', '✧', '✦'].forEach((c, i) => setTimeout(() => this._spawnFx(c, 'sparkle', 0.15 + 0.6 * this._rand(), 0.05 + 0.25 * this._rand()), i * 160));
      return;
    }
    this._spawnFx(fx, '', 0.66, 0.02);
  }

  _spawnFx(text, cls, x, y) {
    const span = document.createElement('span');
    span.className = `fx ${cls}`;
    span.textContent = text;
    span.style.left = `${x * 100}%`;
    span.style.top = `${y * 100}%`;
    this._el.wrap.appendChild(span);
    setTimeout(() => span.remove(), 2700);
  }

  _renderFace(eyes, mouth) {
    if (eyes === this._eyes && mouth === this._mouth) return;
    if (eyes !== this._eyes) {
      const draw = FACE.eyes[eyes] || FACE.eyes.dot;
      this._el.eyeL.innerHTML = draw(FACE.eyeL[0], FACE.eyeL[1], -1);
      this._el.eyeR.innerHTML = draw(FACE.eyeR[0], FACE.eyeR[1], 1);
      this._eyes = eyes;
    }
    if (mouth !== this._mouth) {
      this._el.mouth.setAttribute('d', FACE.mouths[mouth] || FACE.mouths.cat);
      this._mouth = mouth;
    }
  }

  /** Shivering comes in short regular bursts (about 10 Hz for 0.6 s every 2.2 s), not constant noise. */
  _shiverOffset(t) {
    const phase = (t % 2.2) / 2.2;
    const env = phase < 0.28 ? Math.sin((phase / 0.28) * Math.PI) : 0;
    return env * Math.sin(t * 2 * Math.PI * 10) * 1.1;
  }

  _tick(dt) {
    this._clock += dt;
    const t = this._clock;
    const reduced = this._reduced();
    const rnd = this._rand;
    if (this._temp && t > this._temp.until) this._temp = null;
    const name = this.pose;
    const pose = POSES[name];
    const s = this._state;
    const T = this._timers;

    const armRTarget = name === 'point' ? this._pointAngle : pose.armR;
    s.waveAmp = springTo(s.waveAmp, pose.wave || 0, 6, dt);
    s.armL = springTo(s.armL, pose.armL, 9, dt);
    s.armR = springTo(s.armR, armRTarget, 9, dt);
    s.lean = springTo(s.lean, pose.lean || 0, 5, dt);
    s.ears = springTo(s.ears, pose.ears || 0, 8, dt);
    s.squash = springTo(s.squash, pose.squash || 0, 4, dt);
    s.bounceAmp = springTo(s.bounceAmp, reduced ? 0 : pose.bounce || 0, 6, dt);
    s.shiver = springTo(s.shiver, reduced ? 0 : pose.shiver || 0, 8, dt);

    // gaze: explicit target, the pose's preferred gaze, or idle wandering
    if (this._look.auto && t > T.lookAt) {
      T.lookAt = t + 2.5 + rnd() * 4;
      const wander = name === 'idle' && rnd() < 0.6;
      this._look.tx = wander ? (rnd() - 0.5) * 1.2 : 0;
      this._look.ty = wander ? (rnd() - 0.5) * 0.5 : 0;
    }
    const gx = pose.lookX !== undefined && this._look.auto ? pose.lookX : this._look.tx;
    const gy = pose.lookY !== undefined && this._look.auto ? pose.lookY : this._look.ty;
    this._look.x = springTo(this._look.x, gx, 7, dt);
    this._look.y = springTo(this._look.y, gy, 7, dt);

    // blink and ear twitch timers
    if (t > T.blinkAt && T.blinkT < 0) T.blinkT = 0;
    let blink = 1;
    if (T.blinkT >= 0) {
      T.blinkT += dt;
      const k = T.blinkT / 0.16;
      blink = k < 1 ? Math.abs(1 - 2 * k) * 0.9 + 0.1 : 1;
      if (k >= 1) {
        T.blinkT = -1;
        T.blinkAt = t + 2.2 + rnd() * 4.2;
      }
    }
    if (t > T.twitchAt && T.twitchT < 0) {
      T.twitchT = 0;
      T.twitchSide = rnd() < 0.5 ? -1 : 1;
    }
    let twitchL = 0;
    let twitchR = 0;
    if (T.twitchT >= 0) {
      T.twitchT += dt;
      const k = T.twitchT / 0.28;
      const amp = Math.sin(Math.min(1, k) * Math.PI) * 11;
      if (T.twitchSide < 0) twitchL = amp;
      else twitchR = -amp;
      if (k >= 1) {
        T.twitchT = -1;
        T.twitchAt = t + 4.5 + rnd() * 7;
      }
    }

    // hop (one-shot) and bounce (continuous)
    let lift = 0;
    if (s.hopT >= 0) {
      s.hopT += dt;
      const k = s.hopT / 0.42;
      lift += k < 1 ? Math.sin(k * Math.PI) * 14 : 0;
      if (k >= 1) s.hopT = -1;
    }
    lift += s.bounceAmp * Math.abs(Math.sin(t * Math.PI * 2.6)) * 10;

    // breathing, gentle sway, shiver bursts (with a little breath puff in the cold)
    const breathe = reduced ? 0 : Math.sin(t * (name === 'sleep' ? 1.3 : 2.1)) * 0.012;
    const shake = s.shiver * this._shiverOffset(t);
    const sx = 1 + breathe * 0.6 + s.squash * 0.25;
    const sy = 1 - breathe - s.squash - Math.abs(shake) * 0.004;
    const lean = s.lean + Math.sin(t * 0.9) * (reduced ? 0 : 0.6);
    if (s.shiver > 0.5 && t > T.puffAt) {
      T.puffAt = t + 2.2;
      this._spawnFx('～', 'puff', 0.62, 0.42);
    }

    this._el.root.setAttribute('transform', `translate(${110 + shake} ${202 - lift}) rotate(${lean}) scale(${sx} ${sy}) translate(-110 -202)`);
    const shadowScale = Math.max(0.55, 1 - lift / 34);
    this._el.ground.setAttribute('transform', `translate(110 207) scale(${shadowScale} 1) translate(-110 -207)`);

    // arms: an arm swinging outward slides its pivot to the body edge so the paw clears the silhouette
    const wave = s.waveAmp * Math.sin(t * 8);
    const out = (deg) => Math.min(1, Math.max(0, (deg - 25) / 70)) * SHOULDERS.outward;
    const armL = `translate(${SHOULDERS.L[0] - out(s.armL)} ${SHOULDERS.L[1] - out(s.armL) * 0.2}) rotate(${s.armL})`;
    const rAng = s.armR + wave;
    const armR = `translate(${SHOULDERS.R[0] + out(-rAng)} ${SHOULDERS.R[1] - out(-rAng) * 0.2}) rotate(${rAng})`;
    this._el.armL.setAttribute('transform', armL);
    this._el.armR.setAttribute('transform', armR);
    this._el.hArmL.setAttribute('transform', armL);
    this._el.hArmR.setAttribute('transform', armR);
    this._el.padsL.style.opacity = Math.abs(s.armL) > 95 ? 1 : 0;
    this._el.padsR.style.opacity = Math.abs(s.armR) > 95 ? 1 : 0;

    // ears pivot near their bases, with a little counter-parallax to the gaze
    const earShift = -this._look.x * 1.6;
    const earL = `translate(${earShift} 0) rotate(${-s.ears + twitchL} 70 64)`;
    const earR = `translate(${earShift} 0) rotate(${s.ears + twitchR} 150 64)`;
    this._el.earL.setAttribute('transform', earL);
    this._el.earR.setAttribute('transform', earR);
    this._el.hEarL.setAttribute('transform', earL);
    this._el.hEarR.setAttribute('transform', earR);

    // face: gaze offset and blink
    this._el.face.setAttribute('transform', `translate(${this._look.x * 6} ${this._look.y * 4.5})`);
    const eyesName = pose.eyes;
    this._renderFace(eyesName, pose.mouth);
    const by = ['dot', 'wide', 'up', 'sparkle', 'meh'].includes(eyesName) ? blink : 1;
    s.blush = springTo(s.blush, 0.82 * (pose.blush || 1), 6, dt);
    this._el.blush.setAttribute('opacity', Math.min(1, s.blush).toFixed(3));
    const bs = 1 + Math.max(0, s.blush - 0.82) * 0.6;
    this._el.blush.setAttribute('transform', `translate(110 111) scale(${bs.toFixed(3)}) translate(-110 -111)`);
    this._el.eyeL.setAttribute('transform', `translate(${FACE.eyeL[0]} ${FACE.eyeL[1]}) scale(1 ${by}) translate(${-FACE.eyeL[0]} ${-FACE.eyeL[1]})`);
    this._el.eyeR.setAttribute('transform', `translate(${FACE.eyeR[0]} ${FACE.eyeR[1]}) scale(1 ${by}) translate(${-FACE.eyeR[0]} ${-FACE.eyeR[1]})`);

    // tail sway
    const tailAng = (reduced ? 0 : Math.sin(t * 2.3) * 7) + (name === 'sleep' ? 14 : 0) + s.bounceAmp * Math.sin(t * 16) * 6;
    const tail = `rotate(${tailAng} 168 197)`;
    this._el.tail.setAttribute('transform', tail);
    this._el.hTail.setAttribute('transform', tail);

    // secondary motion: tassel and pompom lag behind the body
    const drive = -(lean * 0.9) - shake * 2 - lift * 0.6;
    s.tasselV += ((drive - s.tassel) * 60 - s.tasselV * 7) * dt;
    s.tassel += s.tasselV * dt;
    s.pomV += ((lift * 0.35 - s.pom) * 90 - s.pomV * 9) * dt;
    s.pom += s.pomV * dt;
    if (this._el.tassel) this._el.tassel.setAttribute('transform', `rotate(${s.tassel} 146 61)`);
    if (this._el.pompom) this._el.pompom.setAttribute('transform', `translate(0 ${s.pom})`);

    if (pose.fx === 'z' && t > T.fxAt) {
      T.fxAt = t + 1.5;
      this._spawnFx('z', 'z', 0.62 + rnd() * 0.08, 0.02);
    }

    // optional line boil (attribute `boil`): cycle the three hand-drawn variants about 4 times a second
    if (this.hasAttribute('boil') && !reduced && t > T.boilAt) {
      T.boilAt = t + 0.25;
      this._boil = (this._boil + 1) % 3;
      this._el.root.dataset.boil = String(this._boil);
    }
  }
}

if (!customElements.get('yeoman-cat')) customElements.define('yeoman-cat', YeomanCat);

export { YeomanCat, POSES };
