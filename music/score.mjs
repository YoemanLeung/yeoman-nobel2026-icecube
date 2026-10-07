// The IceCube film's background score: an original ambient piece in D minor (Dorian colour) that follows the six
// chapters, rendered by web/_tools/bgm.mjs from this description and the tour's timeline (so a re-recorded voice
// re-times the music as well). Three stems: `intro` (the title card), `tour`, `outro` (the end card).
// Moods: polar night (calm, sparse bells, wind) -> scale (brighter) -> slow motion (suspended, a low pulse) ->
// reconstruction (plucked arpeggios, data flowing) -> origin (wide, a major lift, shimmer) -> sky (home, a final D major).

import { WAVES, pad, bell, pluck, wind, swell, impact, lowpass, mix, reverb, bus } from '../../_tools/bgm/synth.mjs';

// voicings as MIDI notes, lowest first (the lowest is the bass)
const CHORDS = {
  Dm9: [38, 50, 57, 60, 64, 65],
  Bbmaj7: [34, 46, 53, 57, 62],
  Fmaj9: [41, 48, 52, 55, 57, 64],
  C69: [36, 48, 55, 62, 64],
  Gm9: [43, 50, 53, 57, 58],
  Asus: [45, 52, 57, 62, 64],
  A: [45, 52, 57, 61, 64],
  Ebmaj7: [39, 51, 55, 58, 62, 69],
  Dmaj: [38, 50, 57, 62, 66, 69],
};
const BELL_NOTES = [74, 77, 79, 81, 84, 86, 89, 93]; // D minor pentatonic, high

// voiced for small speakers too: the chords sit an octave up (laptop and phone speakers drop everything below
// ~150 Hz), a quiet layer keeps the original octave for warmth, and a faint glass shimmer adds air above the voice
const MOODS = {
  intro: { chords: ['Dm9'], period: 14, cutoff: [1100, 1600], bells: 0.18, wind: 0.6, shimmer: 0.6, attack: 1 },
  surface: { chords: ['Dm9', 'Bbmaj7', 'Dm9', 'Gm9'], period: 8.5, cutoff: [1200, 1900], bells: 0.26, wind: 1, drone: 38, shimmer: 0.6 },
  scale: { chords: ['Fmaj9', 'C69', 'Dm9', 'Bbmaj7'], period: 7.5, cutoff: [1500, 2500], bells: 0.36, wind: 0.35, shimmer: 0.8 },
  slowmo: { chords: ['Gm9', 'Asus', 'A', 'Dm9'], period: 8, cutoff: [900, 1400], bells: 0.12, pulse: 1.25, drone: 45, shimmer: 0.3 },
  reco: { chords: ['Dm9', 'Bbmaj7', 'Fmaj9', 'C69'], period: 8.6, cutoff: [1300, 2000], bells: 0.08, arp: 84, shimmer: 0.4 },
  origin: { chords: ['Bbmaj7', 'Fmaj9', 'Ebmaj7', 'Fmaj9'], period: 9, cutoff: [1700, 3000], bells: 0.4, shimmer: 1.4 },
  sky: { chords: ['Gm9', 'Bbmaj7', 'Fmaj9', 'Dm9'], period: 8.5, cutoff: [1300, 2100], bells: 0.26, final: 'Dmaj', shimmer: 0.8 },
  outro: { chords: ['Fmaj9', 'Dm9'], period: 5.5, cutoff: [1100, 1700], bells: 0.2, wind: 0.4, shimmer: 0.6 },
};

/** Lay one mood over [from, to] (s) of a stem's buses. */
function section(b, rand, mood, from, to) {
  const span = to - from;
  const n = Math.max(1, Math.round(span / mood.period));
  const step = span / n;
  for (let k = 0; k < n; k++) {
    const last = k === n - 1;
    const name = last && mood.final ? mood.final : mood.chords[k % mood.chords.length];
    const at = from + k * step;
    const hold = step + (last ? 0.4 : 0.6);
    const attack = mood.attack || 2.6;
    CHORDS[name].forEach((midi, i) => {
      if (i === 0) {
        // the bass an octave up with its harmonics, so small speakers still carry the root
        pad(b.pads, rand, { at, hold, midi: midi + 12, gain: 0.032, wave: WAVES.sine, voices: 1, attack, release: 4 });
        pad(b.pads, rand, { at, hold, midi: midi + 12, gain: 0.03, wave: WAVES.soft, voices: 2, attack, release: 4 });
      } else {
        pad(b.pads, rand, { at, hold, midi: midi + 12, gain: 0.04, wave: i % 2 ? WAVES.soft : WAVES.hollow, attack, release: 3.8 });
        pad(b.pads, rand, { at, hold, midi, gain: 0.022, wave: WAVES.soft, voices: 2, attack, release: 3.8 });
      }
      if (mood.shimmer && i >= 2) {
        pad(b.bells, rand, { at: at + 0.6, hold: hold - 0.6, midi: midi + 24, gain: 0.009 * mood.shimmer, wave: WAVES.glass, voices: 2, attack: attack + 0.8, release: 4 });
      }
    });
    if (mood.arp) {
      const tones = CHORDS[name].slice(1).map((m) => m + 12);
      const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
      const beat = 60 / mood.arp / 2;
      for (let t = at + 0.3, i = 0; t < at + step - 0.2; t += beat, i++) {
        const midi = tones[pattern[i % pattern.length] % tones.length];
        const accent = i % 4 === 0 ? 1 : 0.65;
        pluck(b.plucks, rand, { at: t, midi, gain: 0.07 * accent, damping: 0.9965, bright: 0.38, pan: Math.sin(i * 1.3) * 0.5 });
      }
    }
  }
  if (mood.drone) pad(b.pads, rand, { at: from, hold: span, midi: mood.drone, gain: 0.03, wave: WAVES.hollow, voices: 2, attack: 4, release: 4 });
  if (mood.pulse) {
    for (let t = from + 1; t < to - 0.5; t += mood.pulse) impact(b.fx, { at: t, gain: 0.06, f0: 120, f1: 82, decay: 0.28 });
  }
  if (mood.bells) {
    for (let t = from + 1.2 + rand() * 1.5; t < to - 1; t += 1 / mood.bells * (0.5 + rand())) {
      bell(b.bells, { at: t, midi: BELL_NOTES[Math.floor(rand() * BELL_NOTES.length)], gain: 0.045 + rand() * 0.025, pan: rand() * 1.6 - 0.8 });
    }
  }
  if (mood.wind) wind(b.fx, rand, { from, to, levelAt: (t) => 0.01 * mood.wind * Math.min(1, (t - from) / 3, (to - t) / 3) });
}

/** A short cluster of bells: the moment something appears. */
function chime(b, rand, at, notes = [81, 86, 89]) {
  notes.forEach((midi, i) => bell(b.bells, { at: at + i * 0.09, midi, gain: 0.045, decay: 3.8, pan: (i - 1) * 0.5 }));
}

function buses(seconds) {
  return { pads: bus(seconds), bells: bus(seconds), plucks: bus(seconds), fx: bus(seconds) };
}

/** Mix the buses: the pads through a slowly moving low-pass, everything into one shared hall (mixed in place). */
function finish(b, cutoffAt) {
  lowpass(b.pads, cutoffAt);
  const wet = bus(b.pads.n / 48000 - 4);
  const { pads, bells, plucks, fx } = b;
  const sendAt = (j) => (pads.L[j] + pads.R[j]) * 0.5 + bells.L[j] + bells.R[j] + (plucks.L[j] + plucks.R[j]) * 0.6 + (fx.L[j] + fx.R[j]) * 0.4;
  reverb(wet, sendAt, { room: 0.87, damp: 0.3, gain: 1.1 });
  mix(pads, bells, 0.55);
  mix(pads, plucks, 0.8);
  mix(pads, fx, 1);
  mix(pads, wet, 1);
  return pads;
}

const brightness = (sections) => (t) => {
  const s = sections.find((x) => t >= x.from && t < x.to) || sections[sections.length - 1];
  const [lo, hi] = s.mood.cutoff;
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t - s.from) * 0.21));
};

/**
 * Render the stems for a timeline: {introSeconds, outroSeconds, chapters: [{id, start, duration, marks}]}.
 * Returns {intro, tour, outro} buses (each with a few seconds of tail).
 */
export function render(timeline, rand) {
  const stems = {};

  // the title card: one long Dm9 swell under the intro
  let b = buses(timeline.introSeconds);
  const intro = [{ from: 0, to: timeline.introSeconds, mood: MOODS.intro }];
  section(b, rand, MOODS.intro, 0, timeline.introSeconds);
  chime(b, rand, 0.9, [81, 86]);
  stems.intro = finish(b, brightness(intro));

  // the tour, chapter by chapter, with events on the chapters' marks
  const total = timeline.chapters.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  b = buses(total);
  const parts = timeline.chapters.map((c) => ({ from: c.start, to: c.start + c.duration, mood: MOODS[c.id] || MOODS.surface }));
  parts.forEach((p) => section(b, rand, p.mood, p.from, p.to));
  const at = (id, mark) => {
    const c = timeline.chapters.find((x) => x.id === id);
    return c && c.marks && c.marks[mark] !== undefined ? c.start + c.marks[mark] : null;
  };
  const events = [
    ['surface', 'plunge', (t) => { swell(b.fx, rand, { peak: t, gain: 0.07 }); impact(b.fx, { at: t, gain: 0.14, f0: 110, f1: 60 }); }],
    ['surface', 'slow', (t) => chime(b, rand, t + 0.4)],
    ['scale', 'look', (t) => swell(b.fx, rand, { peak: t + 1.2, rise: 2.4, gain: 0.04 })],
    ['scale', 'flash', (t) => { impact(b.fx, { at: t, gain: 0.16, f0: 120, f1: 64 }); chime(b, rand, t + 0.05, [84, 89, 93]); }],
    ['slowmo', 'hit', (t) => { impact(b.fx, { at: t, gain: 0.22, f0: 110, f1: 52, decay: 2 }); chime(b, rand, t + 0.1, [77, 81, 86]); }],
    ['origin', 'warp', (t) => swell(b.fx, rand, { peak: t + 1, rise: 2.2, gain: 0.06, f1: 4200 })],
    ['origin', 'arrive', (t) => chime(b, rand, t, [86, 89, 93])],
  ];
  events.forEach(([id, mark, fire]) => {
    const t = at(id, mark);
    if (t !== null) fire(t);
  });
  stems.tour = finish(b, brightness(parts));

  // the end card: Fmaj9 -> Dm9, fading
  b = buses(timeline.outroSeconds);
  section(b, rand, MOODS.outro, 0, timeline.outroSeconds);
  stems.outro = finish(b, brightness([{ from: 0, to: timeline.outroSeconds, mood: MOODS.outro }]));
  return stems;
}
