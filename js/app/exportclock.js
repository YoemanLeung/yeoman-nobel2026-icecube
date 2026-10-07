// Virtual time for frame-by-frame video export (#export). A capture runs slower than real time, so anything
// that reads the wall clock would play too fast in the video: the mascot's typing and speech-bubble timers,
// the messenger animation (performance.now), CSS transitions and animations. Once installed, timers fire and
// performance.now() advances only when the exporter steps the clock, and every Web Animation (CSS transitions
// and keyframe animations, shadow DOM included) is paused and advanced by the same step.
// The tour itself needs none of this: its state is a pure function of the director clock.

export function installVirtualClock() {
  let now = 0; // ms since install
  let seq = 0;
  const timers = new Map(); // id -> { due, fn, args, every }
  const origin = performance.now();
  const realClearTimeout = window.clearTimeout.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  const seen = new WeakSet();

  const add = (fn, ms, args, every) => {
    seq += 1;
    const id = 1e7 + seq; // never collides with the browser's own ids
    timers.set(id, { due: now + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  performance.now = () => origin + now;
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  // a timer created before the install is still a real one: clear it the real way
  window.clearTimeout = (id) => (timers.delete(id) ? undefined : realClearTimeout(id));
  window.clearInterval = (id) => (timers.delete(id) ? undefined : realClearInterval(id));

  /** Fire every timer due within the next `ms`, in due order. */
  function advanceTimers(ms) {
    const target = now + ms;
    for (;;) {
      let nextId = 0;
      let next = null;
      timers.forEach((t, id) => {
        if (t.due <= target && (!next || t.due < next.due)) {
          next = t;
          nextId = id;
        }
      });
      if (!next) break;
      now = Math.max(now, next.due);
      if (next.every) next.due += next.every;
      else timers.delete(nextId);
      try {
        if (typeof next.fn === 'function') next.fn(...next.args);
      } catch (err) {
        console.error(err);
      }
    }
    now = target;
  }

  /** New animations are frozen where they start; known ones advance by `ms`; finished ones are retired. */
  function advanceAnimations(ms) {
    document.getAnimations().forEach((a) => {
      if (!seen.has(a)) {
        seen.add(a);
        a.pause();
        return;
      }
      const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      const t = (a.currentTime ?? 0) + ms;
      if (Number.isFinite(end) && t >= end) a.finish();
      else a.currentTime = t;
    });
  }

  return {
    get now() {
      return now;
    },
    advanceTimers,
    advanceAnimations,
  };
}
