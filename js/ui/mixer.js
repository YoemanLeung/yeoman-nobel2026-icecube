// The page's mixer: one Web Audio context with a voice bus and a music bus, each with the viewer's level (the
// volume panel's sliders, remembered in localStorage), and a dip on the music bus while Yeoman speaks. The players'
// media elements are routed through it, because iOS ignores HTMLMediaElement.volume.
//
// Phones decide when a page may make sound, and sound dropping out on a phone shaped this module:
// - the context is made, and resumed, inside the viewer's first tap, click or key press (iOS starts audio only from
//   a gesture's own handler, not from a later animation frame);
// - the same gesture unlocks each player's media element with a play() and an immediate pause(): iOS lets an
//   element play outside a gesture only once it has been played inside one, so each player keeps one element;
// - every later gesture, and a return to the page, resumes the context if it is not running: iOS suspends it, or
//   leaves it "interrupted" after a call, an alarm, a locked screen or a trip to another app;
// - the audio session is declared as playback where Safari supports it, so the silent switch does not mute the page.

export const LEVELS = Object.freeze({ voice: 1, music: 0.6 }); // defaults; the film export mixes at these too
const DUCK = 0.45; // music gain while a line is spoken (about -7 dB)
const GESTURES = ['click', 'touchend', 'keydown']; // events WebKit counts as a gesture (touchstart, pointerdown are not)
const KEY = (bus) => `icecube-volume-${bus}`;

function remembered(bus) {
  try {
    const v = Number(localStorage.getItem(KEY(bus)));
    return localStorage.getItem(KEY(bus)) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : LEVELS[bus];
  } catch {
    return LEVELS[bus];
  }
}

export function createMixer() {
  const levels = { voice: remembered('voice'), music: remembered('music') };
  const members = []; // { el, bus, routed }: the players' media elements
  const locked = new Set(); // elements no gesture has unlocked yet
  let ctx = null;
  let buses = null; // { voice, music, duck } gain nodes
  let ducked = false;

  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* no Audio Session API: the browser decides */
  }

  function route(m) {
    if (m.routed) return;
    try {
      ctx.createMediaElementSource(m.el).connect(m.bus === 'music' ? buses.duck : buses.voice);
      m.routed = true;
    } catch {
      /* stays a direct element: plays at full level */
    }
  }

  /** Make the context and its buses (on the first gesture), then route the players' elements into them. */
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch {
      return false;
    }
    buses = { voice: ctx.createGain(), music: ctx.createGain(), duck: ctx.createGain() };
    buses.voice.gain.value = levels.voice;
    buses.music.gain.value = levels.music;
    buses.duck.connect(buses.music);
    buses.voice.connect(ctx.destination);
    buses.music.connect(ctx.destination);
    members.forEach(route);
    return true;
  }

  function resume() {
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  }

  /** Inside a gesture: start the context and unlock the elements that have not been unlocked yet. */
  function unlock(e) {
    if (!ensure()) return;
    if (ctx.state !== 'running') {
      resume();
      // older iOS also wants a sound started inside the gesture: one silent sample
      const tick = ctx.createBufferSource();
      tick.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      tick.connect(ctx.destination);
      tick.start(0);
    }
    // a touchend is a gesture only when it ends a tap (not a scroll or a drag), so it tries, but only a click or a
    // key press (or an element already playing) marks an element as unlocked
    const sure = e.type !== 'touchend';
    locked.forEach((el) => {
      if (el.error) return; // a failed source cannot be unlocked; a later gesture tries again
      if (!el.paused) {
        locked.delete(el);
        return;
      }
      const p = el.play();
      el.pause();
      if (p) p.catch(() => {});
      if (sure) locked.delete(el);
    });
  }
  GESTURES.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }));
  const back = () => document.visibilityState === 'visible' && resume();
  document.addEventListener('visibilitychange', back);
  window.addEventListener('pageshow', back);

  return {
    /** Route a player's media element into the 'voice' or 'music' bus (from the first gesture on). */
    connect(el, bus) {
      const m = { el, bus, routed: false };
      members.push(m);
      locked.add(el);
      if (ctx) route(m);
    },
    /** Make sure the context runs (from the players, while something should sound). */
    resume,
    /** 'running', 'suspended', 'interrupted', 'closed', or 'none' before the first gesture. */
    get state() {
      return ctx ? ctx.state : 'none';
    },
    level(bus) {
      return levels[bus];
    },
    setLevel(bus, value) {
      levels[bus] = Math.min(1, Math.max(0, value));
      try {
        localStorage.setItem(KEY(bus), String(levels[bus]));
      } catch {
        /* not remembered */
      }
      if (buses) buses[bus === 'music' ? 'music' : 'voice'].gain.setTargetAtTime(levels[bus], ctx.currentTime, 0.04);
    },
    /** Dip the music while a line is spoken. */
    duck(on) {
      if (!buses || on === ducked) return;
      buses.duck.gain.setTargetAtTime(on ? DUCK : 1, ctx.currentTime, 0.18);
      ducked = on;
    },
  };
}
