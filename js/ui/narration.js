// Narration player. Every subtitle line has a clip (audio/<set>/<key>.m4a, listed in a manifest);
// the player keeps the clip of the active line playing in sync with the tour clock: it starts at the
// right offset after a seek or resume, pauses with the tour, and stops between lines.
// Voice sets per language come from audio/index.json; a recorded human set ("own") wins over TTS.
// If no clips can be loaded the narration simply stays silent (subtitles carry everything).
// Clips are fetched into blob URLs: a blob is always seekable, while media from a server without HTTP range
// support cannot seek (Chrome resets currentTime to 0), which would break starting a line mid-way.
// One media element plays every line in turn: iOS lets an element play outside a tap only after a tap has
// unlocked it (see mixer.js), and phones limit how many media players a page may keep.

export function createNarration({ base = 'audio', mixer = null } = {}) {
  let index = null;
  let manifest = null;
  let setId = null;
  let enabled = true;
  let current = null; // { key, clip, started, settled, drift }
  const clips = new Map(); // key -> { url, file, failed }: url is the blob URL (or the file itself) once fetched
  const el = new Audio();
  el.preload = 'auto';
  if (mixer) mixer.connect(el, 'voice'); // the viewer's voice level (works on iOS too)
  // a page whose security policy refuses blob: media falls back to the file itself; a file that fails too is skipped
  el.addEventListener('error', () => {
    const c = current && current.clip;
    if (!c || el.getAttribute('src') !== c.url) return;
    if (c.url === c.file) {
      c.failed = true;
      return;
    }
    URL.revokeObjectURL(c.url);
    c.url = c.file;
    current.started = false; // restart at the right offset
  });

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

  function clearClips() {
    stop();
    el.removeAttribute('src');
    el.load(); // let go of the old clip
    clips.forEach((c) => c.url && c.url !== c.file && URL.revokeObjectURL(c.url));
    clips.clear();
  }

  async function useLanguage(next) {
    clearClips();
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
    if (!clips.has(key)) {
      const file = `${base}/${setId}/${manifest.clips[key].file}`;
      const c = { url: null, file, failed: false };
      clips.set(key, c);
      fetch(file)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((blob) => {
          if (clips.get(key) === c) c.url = URL.createObjectURL(blob); // unless the language switched meanwhile
        })
        .catch(() => {
          if (clips.get(key) === c) c.url = file; // stream instead (plays, but may not seek on such a server)
        });
    }
    return clips.get(key);
  }

  function seek(t) {
    try {
      el.currentTime = t;
    } catch {
      /* not seekable yet: the start settles it once the clip's metadata is in */
    }
  }

  function stop() {
    if (current) {
      el.pause();
      current = null;
    }
  }

  function begin(offset) {
    if (el.getAttribute('src') !== current.clip.url) el.src = current.clip.url;
    if (mixer) mixer.resume();
    seek(offset);
    el.play().catch(() => {
      /* not allowed until the viewer's first tap: retried on a later frame */
    });
    current.started = true;
    current.settled = false;
    current.drift = 0;
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
      return current ? { key: current.key, time: el.currentTime, paused: el.paused } : null;
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
        if (current && !playing) el.pause();
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
        const c = clip(cue.key);
        if (!c) return;
        current = { key: cue.key, clip: c, started: false, settled: false, drift: 0 };
      }
      if (!current.clip.url || current.clip.failed) return; // still loading (starts on a later frame) or unplayable
      if (!current.started) {
        begin(offset);
        return;
      }
      current.drift = el.currentTime - offset;
      // a start made before the clip's metadata arrived may have missed its offset: settle it once, when it can seek
      if (!current.settled && el.readyState >= 1) {
        current.settled = true;
        if (Math.abs(current.drift) > 0.25) {
          seek(offset);
          current.drift = 0;
        }
      }
      // same clip: resume if paused, and re-seek if the clock drifted far (e.g. after a scrub); a small lead of the
      // voice is reported instead (`lead`), and the page's clock catches up with it
      const reseek = el.paused ? Math.abs(current.drift) > 0.25 : Math.abs(current.drift) > 1.5;
      if (reseek) {
        seek(offset);
        current.drift = 0; // nothing for the clock to catch up after a re-seek
      }
      if (el.paused) {
        if (mixer) mixer.resume();
        el.play().catch(() => {});
      }
    },
    /** A line's clip is playing (the page's clock then follows the voice alone). */
    get speaking() {
      return Boolean(current && current.started && !el.paused);
    },
    /** Seconds the playing clip is ahead of the tour clock (0 when none plays): the page adds it to its next frame. */
    get lead() {
      return current && current.started && !el.paused && current.drift > 0 ? current.drift : 0;
    },
    /** Pause the clip at once, e.g. when the page is hidden (no frames run then); the next sync resumes it. */
    pause() {
      el.pause();
    },
    stop,
  };
}
