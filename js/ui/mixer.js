// The page's mixer: one Web Audio context with a voice bus and a music bus, each with the viewer's level (the
// volume panel's sliders, remembered in localStorage), and a dip on the music bus while Yeoman speaks. Media
// elements are routed through it, because iOS ignores HTMLMediaElement.volume. The context is created suspended and
// starts on the viewer's first click (browsers block sound before), via resume() from the players.

export const LEVELS = Object.freeze({ voice: 1, music: 0.6 }); // defaults; the film export mixes at these too
const DUCK = 0.45; // music gain while a line is spoken (about -7 dB)
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
  let ctx = null;
  let voice = null;
  let music = null;
  let duck = null;
  let ducked = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    voice = ctx.createGain();
    music = ctx.createGain();
    duck = ctx.createGain();
    voice.gain.value = levels.voice;
    music.gain.value = levels.music;
    duck.connect(music);
    voice.connect(ctx.destination);
    music.connect(ctx.destination);
    return true;
  }

  return {
    /** Route a media element into the 'voice' or 'music' bus (false when Web Audio is unavailable). */
    connect(el, bus) {
      if (!ensure()) return false;
      ctx.createMediaElementSource(el).connect(bus === 'music' ? duck : voice);
      return true;
    },
    /** Start the context once the viewer has interacted (call from the frame loop while something should sound). */
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
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
      const node = bus === 'music' ? music : voice;
      if (node) node.gain.setTargetAtTime(levels[bus], ctx.currentTime, 0.04);
    },
    /** Dip the music while a line is spoken. */
    duck(on) {
      if (!duck || on === ducked) return;
      duck.gain.setTargetAtTime(on ? DUCK : 1, ctx.currentTime, 0.18);
      ducked = on;
    },
  };
}
