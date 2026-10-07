// Narration player. Every subtitle line has a clip (audio/<set>/<key>.m4a, listed in a manifest);
// the player keeps the clip of the active line playing in sync with the tour clock: it starts at the
// right offset after a seek or resume, pauses with the tour, and stops between lines.
// Voice sets per language come from audio/index.json; a recorded human set ("own") wins over TTS.
// If no clips can be loaded the narration simply stays silent (subtitles carry everything).
// Clips are fetched into blob URLs: a blob is always seekable, while media from a server without HTTP range
// support cannot seek (Chrome resets currentTime to 0), which would break starting a line mid-way.

export function createNarration({ base = 'audio', mixer = null } = {}) {
  let index = null;
  let manifest = null;
  let setId = null;
  let lang = null;
  let enabled = true;
  let current = null; // { key, el, entry, started }
  const cache = new Map(); // key -> { el, ready, blobUrl }

  async function loadIndex() {
    if (index) return index;
    try {
      const res = await fetch(`${base}/index.json`, { cache: 'no-cache' });
      index = res.ok ? await res.json() : {};
    } catch {
      index = {};
    }
    return index;
  }

  function clearCache() {
    cache.forEach((entry) => {
      entry.el.removeAttribute('src');
      if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    });
    cache.clear();
  }

  async function useLanguage(next) {
    lang = next;
    stop();
    clearCache();
    manifest = null;
    const idx = await loadIndex();
    for (const id of idx[next] || []) {
      try {
        const res = await fetch(`${base}/${id}/manifest.json`, { cache: 'no-cache' });
        if (!res.ok) continue;
        manifest = await res.json();
        setId = id;
        break;
      } catch {
        /* try the next set */
      }
    }
    return Boolean(manifest);
  }

  function clip(key) {
    if (!manifest || !manifest.clips[key]) return null;
    if (!cache.has(key)) {
      const url = `${base}/${setId}/${manifest.clips[key].file}`;
      const entry = { el: new Audio(), ready: false, blobUrl: null };
      entry.el.preload = 'auto';
      if (mixer) mixer.connect(entry.el, 'voice'); // the viewer's voice level (works on iOS too)
      // a page whose security policy refuses blob: media falls back to the file itself
      entry.el.addEventListener('error', () => {
        if (!entry.blobUrl || entry.el.src !== entry.blobUrl) return;
        URL.revokeObjectURL(entry.blobUrl);
        entry.blobUrl = null;
        entry.el.src = url;
        if (current && current.entry === entry) current.started = false; // restart at the right offset
      });
      cache.set(key, entry);
      fetch(url)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((blob) => {
          if (cache.get(key) !== entry) return; // language switched meanwhile
          entry.blobUrl = URL.createObjectURL(blob);
          entry.el.src = entry.blobUrl;
          entry.ready = true;
        })
        .catch(() => {
          if (cache.get(key) !== entry) return;
          entry.el.src = url; // stream instead (plays, but may not seek on such a server)
          entry.ready = true;
        });
    }
    return cache.get(key);
  }

  function stop() {
    if (current) {
      current.el.pause();
      current = null;
    }
  }

  function begin(c, offset) {
    if (mixer) mixer.resume();
    try {
      c.el.currentTime = offset;
    } catch {
      /* not seekable yet: plays from the start */
    }
    c.el.play().catch(() => {
      /* autoplay blocked until the viewer interacts */
    });
    c.started = true;
  }

  return {
    useLanguage,
    get available() {
      return Boolean(manifest);
    },
    get voice() {
      return manifest ? manifest.voice : null;
    },
    /** The clip now playing (for inspection): {key, time, paused} or null. */
    get current() {
      return current ? { key: current.key, time: current.el.currentTime, paused: current.el.paused } : null;
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) stop();
    },
    /** Warm the next clips so the first syllable is not cut. */
    preload(keys) {
      keys.forEach((k) => clip(k));
    },
    duration(key) {
      return manifest && manifest.clips[key] ? manifest.clips[key].dur : null;
    },
    /**
     * Call every frame: cue = {key, t} active at local time (or null); playing = tour clock running.
     * Keeps exactly the right clip playing at the right offset.
     */
    sync(cue, local, playing) {
      if (!enabled || !manifest) {
        stop();
        return;
      }
      if (!cue || !playing) {
        if (current && !playing) current.el.pause();
        if (!cue) stop();
        if (!playing) return;
      }
      if (!cue) return;
      const offset = local - cue.t;
      const dur = this.duration(cue.key) || 0;
      if (offset < 0 || offset > dur - 0.05) {
        if (current && current.key === cue.key) stop();
        return;
      }
      if (!current || current.key !== cue.key) {
        stop();
        const entry = clip(cue.key);
        if (!entry) return;
        current = { key: cue.key, el: entry.el, entry, started: false };
      }
      if (!current.entry.ready) return; // still loading: starts on a later frame, at the right offset
      if (!current.started) {
        begin(current, offset);
        return;
      }
      // same clip: resume if paused, and re-seek if the clock drifted far (e.g. after a scrub); a small lead of the
      // voice is reported instead (`lead`), and the page's clock catches up with it
      current.drift = current.el.currentTime - offset;
      const reseek = current.el.paused ? Math.abs(current.drift) > 0.25 : Math.abs(current.drift) > 1.5;
      if (reseek) {
        current.el.currentTime = offset;
        current.drift = 0; // nothing for the clock to catch up after a re-seek
      }
      if (current.el.paused) {
        if (mixer) mixer.resume();
        current.el.play().catch(() => {});
      }
    },
    /** Seconds the playing clip is ahead of the tour clock (0 when none plays): the page adds it to its next frame. */
    get lead() {
      return current && current.started && !current.el.paused && current.drift > 0 ? current.drift : 0;
    },
    stop,
  };
}
