// Yeoman as the tour guide. It says the narration in its speech bubble (the words come out in step with the
// voice, so there are no subtitles) and hops between spots on screen, chosen per shot to stay clear of the
// subject. Lines and spots are pure functions of the clock, so a frame-by-frame video export shows exactly
// what a live viewer sees.

import { clamp } from '../core/math.js';

const LINGER = 1.4; // a finished line stays this long before the bubble closes
const REVEAL = 0.92; // all words are out at this fraction of the clip
// where the feet are inside the <yeoman-cat> box (its artwork: 240 x 230, base centre at x 110, feet at y 206)
const FOOT_X = 110 / 240;
const FOOT_Y = 206 / 230;

export function createGuide({ cat, dock, narration, text }) {
  let roaming = false;

  return {
    /** The latest cue at or before `local` in a chapter's cue list (sorted by time), or null. */
    cueAt(cues, local) {
      let cur = null;
      for (const c of cues || []) {
        if (c.t <= local + 1e-9) cur = c;
        else break;
      }
      return cur;
    },

    /**
     * The line to show `age` seconds into line `key`: {key, text, n} (n = characters out), or null. Paced by its clip,
     * or by its scheduled length (`scheduled`, s) in a language without a voice.
     */
    lineAt(key, age, scheduled) {
      if (!key || age < 0) return null;
      const dur = narration.duration(key) || scheduled || 3;
      if (age > dur + LINGER) return null;
      const t = text().sub[key] || '';
      const n = Math.ceil([...t].length * clamp(age / Math.max(0.3, dur * REVEAL), 0, 1));
      return { key, text: t, n };
    },

    say(line) {
      cat.showLine(line ? line.text : null, line ? line.n : 0);
    },

    /**
     * Stand at pos = {x, y, hop, tilt} (feet in viewport fractions, hop height as a fraction of the viewport
     * height, tilt in degrees), or go back to the docked corner (pos null, or a narrow screen). The page picks
     * the bubble side (`pos.side` while roaming).
     */
    place(pos, wide) {
      if (!pos || !wide) {
        if (roaming) {
          dock.classList.remove('roam');
          dock.style.transform = '';
          cat.style.setProperty('--tilt', '0deg');
          roaming = false;
        }
        return;
      }
      if (!roaming) {
        dock.classList.add('roam');
        roaming = true;
      }
      const w = cat.offsetWidth;
      const h = cat.offsetHeight;
      const x = pos.x * window.innerWidth - FOOT_X * w;
      const y = pos.y * window.innerHeight - FOOT_Y * h - (pos.hop || 0) * window.innerHeight;
      dock.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      cat.style.setProperty('--tilt', `${(pos.tilt || 0).toFixed(2)}deg`); // the figure leans, the bubble stays upright
    },
  };
}
