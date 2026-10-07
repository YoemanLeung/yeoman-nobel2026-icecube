// The director: one tour clock over consecutive chapters.
// Each chapter is a pure function of its local time (apply), so play, pause, rewind, chapter jumps
// and fixed-time screenshots all land on exactly the same frame. Cue lists (subtitles, the cat) are
// evaluated from the same clock; the cat's speech fires only when a cue is crossed while playing.

import { clamp } from './math.js';

export class Director {
  constructor(chapters) {
    this.chapters = chapters;
    this.starts = [];
    let acc = 0;
    chapters.forEach((c) => {
      this.starts.push(acc);
      acc += c.duration;
    });
    this.total = acc;
    this.T = 0;
    this.playing = false;
    this.rate = 1;
    this.listeners = new Set();
    this.lastCatCue = null;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, payload = {}) {
    this.listeners.forEach((fn) => fn(type, payload));
  }

  locate(T = this.T) {
    const t = clamp(T, 0, this.total);
    let i = this.chapters.length - 1;
    while (i > 0 && t < this.starts[i]) i -= 1;
    return { index: i, chapter: this.chapters[i], local: t - this.starts[i] };
  }

  play() {
    if (this.T >= this.total - 1e-6) this.seek(0);
    this.playing = true;
    this.emit('play');
  }

  pause() {
    this.playing = false;
    this.emit('pause');
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(T) {
    this.T = clamp(T, 0, this.total);
    this.emit('seek', this.locate());
  }

  seekChapter(index, local = 0) {
    const i = clamp(index, 0, this.chapters.length - 1);
    this.seek(this.starts[i] + local);
  }

  /** Advance the clock; returns the cues crossed during this step (for one-shot effects). */
  tick(dt) {
    if (!this.playing) return [];
    const before = this.locate();
    const T1 = Math.min(this.total, this.T + dt * this.rate);
    const crossed = [];
    // collect cat cues crossed in (T, T1], possibly across a chapter boundary
    this.chapters.forEach((c, i) => {
      const s = this.starts[i];
      (c.cat || []).forEach((cue) => {
        const at = s + cue.t;
        if (at > this.T && at <= T1) crossed.push({ ...cue, chapter: i });
      });
    });
    this.T = T1;
    const after = this.locate();
    if (after.index !== before.index) this.emit('chapter', after);
    if (this.T >= this.total) {
      this.playing = false;
      this.emit('end');
    }
    return crossed;
  }

  /** The latest cat cue at or before the current time (pose and accessories on seek). */
  catStateAt(T = this.T) {
    const { index, local } = this.locate(T);
    const cues = this.chapters[index].cat || [];
    let pose = null;
    let wear = null;
    cues.forEach((cue) => {
      if (cue.t <= local) {
        if (cue.pose) pose = cue;
        if (cue.wear) wear = cue.wear;
      }
    });
    return { pose, wear: wear || this.chapters[index].wear || [] };
  }
}
