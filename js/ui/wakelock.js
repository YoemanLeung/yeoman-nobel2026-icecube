// Keep a phone's screen on while the tour plays, as a video player does: the tour is six minutes of watching
// without touching, longer than a phone's auto-lock, and a locked screen stops the page and its sound.
// Uses the Screen Wake Lock API where it exists (Safari 16.4+, Chrome); the browser drops the lock whenever the
// page is hidden, so it is asked for again on the way back, and a refused request is retried on the next tap.
// Without the API the screen simply may sleep.

export function createWakeLock() {
  let wanted = false;
  let sentinel = null;
  let asking = false;

  async function acquire() {
    if (!wanted || sentinel || asking || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    asking = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
      sentinel = s;
      if (!wanted) release(); // the tour stopped while the request was pending
    } catch {
      /* refused (battery saver, a policy): the screen may sleep */
    } finally {
      asking = false;
    }
  }

  function release() {
    const s = sentinel;
    sentinel = null;
    if (s) s.release().catch(() => {});
  }

  document.addEventListener('visibilitychange', acquire);
  ['click', 'touchend'].forEach((type) => window.addEventListener(type, acquire, { capture: true, passive: true }));

  return {
    get held() {
      return Boolean(sentinel);
    },
    /** Call every frame with whether the tour is playing; asks for or releases the lock when that changes. */
    hold(on) {
      if (on === wanted) return;
      wanted = on;
      if (on) acquire();
      else release();
    },
  };
}
