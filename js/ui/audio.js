// Optional sound, off by default. Hits can be heard as soft pings (pitch = depth, loudness =
// charge): a sonification of the data, never "the sound of a neutrino". Every key point is also in
// the subtitles, so nothing depends on audio.

export function createAudio() {
  let ctx = null;
  let master = null;
  let ambient = null;
  let enabled = false;
  let windowStart = 0;
  let notes = 0;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function stopAmbient() {
    if (!ambient) return;
    const { nodes, gain } = ambient;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => nodes.forEach((n) => n.stop && n.stop()), 1500);
    ambient = null;
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = Boolean(on) && ensure();
      if (!ctx) return enabled;
      if (enabled) ctx.resume();
      else stopAmbient();
      return enabled;
    },
    /** depth in m, charge in photoelectrons */
    ping(depth, charge) {
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      if (now - windowStart > 0.1) {
        windowStart = now;
        notes = 0;
      }
      if (notes++ > 3) return;
      const f = 220 * Math.pow(2, (2450 - depth) / 500);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const amp = 0.02 + 0.07 * Math.min(1, Math.log2(1 + charge) / 5);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, now + 0.6);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.65);
    },
    /** 'wind' on the surface, 'deep' under the ice, null for silence */
    ambience(mode) {
      if (!enabled || !ctx) return;
      if (ambient && ambient.mode === mode) return;
      stopAmbient();
      if (!mode) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      const nodes = [];
      if (mode === 'wind') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer();
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 0.6;
        src.connect(bp).connect(gain);
        src.start();
        nodes.push(src);
        gain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
      } else {
        [55, 82.4, 110.3].forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f * (1 + i * 0.002);
          o.connect(gain);
          o.start();
          nodes.push(o);
        });
        gain.gain.setTargetAtTime(0.025, ctx.currentTime, 1.5);
      }
      ambient = { mode, nodes, gain };
    },
  };
}
