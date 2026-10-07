// Entry point: builds the science model, the scenes, the director and the UI, then runs one loop.
// Deep links for review and screenshots: #ch=4&t=20&start=0&lang=en&size=real&free&debug (#audiodebug: sound state)

import * as THREE from 'three';
import { buildArray } from './science/geometry.js';
import { simulateEvent, firstPulsePerDom, cleanPulses } from './science/event.js';
import { makeSkyFrame, IC170922A } from './science/sky.js';
import { DEPTH_TOP } from './science/constants.js';
import { v3, clamp, smoothstep } from './core/math.js';
import { Director } from './core/director.js';
import { buildChapters, catAt } from './content/chapters.js';
import { createWorld } from './app/world.js';
import { hdrSweep } from './app/hdrcheck.js';
import { installVirtualClock } from './app/exportclock.js';
import { createBookends } from './app/bookends.js';
import { createGuide } from './ui/guide.js';
import { createHud } from './ui/hud.js';
import { createLabelLayer } from './ui/labels.js';
import { createGame } from './ui/game.js';
import { createLab } from './ui/lab.js';
import { createAudio } from './ui/audio.js';
import { createNarration } from './ui/narration.js';
import { createMusic } from './ui/music.js';
import { createMixer } from './ui/mixer.js';
import { createVolumePanel } from './ui/volume.js';
import { createWakeLock } from './ui/wakelock.js';
import { createAudioDebug } from './ui/audiodebug.js';
import { createFlyLayer } from './ui/flylayer.js';
import { detectTier, savedChoice, saveChoice, createFpsGuard, ORDER } from './scene/quality.js';
import { timeColor } from './core/math.js';

const params = new URLSearchParams(location.hash.slice(1));
// #export: frame-by-frame video export driven by web/_tools/export_mp4.mjs (no RAF loop, virtual time)
const exportMode = params.has('export');
// film.html (data-mode="film"): the version for recording video: no controls or progress bar, chapter cards,
// a title card with a spoken intro and an end card with the outro. An export always uses it.
const filmMode = exportMode || document.documentElement.dataset.mode === 'film';
if (filmMode) document.documentElement.classList.add('film');
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function showFallback(hud, err) {
  const d = hud.t();
  const el = document.getElementById('fallback');
  const subs = Object.values(d.sub).map((s) => `<p>${s}</p>`).join('');
  el.innerHTML = `<article><h1>${d.meta.title}</h1><p>${d.fallback}</p><p class="fine">${err ? String(err.message || err) : ''}</p>${subs}</article>`;
  el.hidden = false;
}

function deriveContext(array, event) {
  const centerString = array.strings.find((s) => s.id === array.centerStringId);
  const closeDom = centerString.firstDom; // top DOM (1,450 m) of the central standard string
  const home = centerString;
  const neighbour = array.strings
    .filter((s) => !s.deepcore && s.id !== home.id)
    .reduce((best, s) => (Math.hypot(s.x - home.x, s.z - home.z) < Math.hypot(best.x - home.x, best.z - home.z) ? s : best));
  const signal = firstPulsePerDom(event.pulses.filter((p) => p.kind === 'signal'));
  const qs = signal.reduce((s, p) => s + p.q, 0);
  const cog = signal.reduce((acc, p) => v3.addScaled(acc, array.doms[p.dom].pos, p.q / qs), [0, 0, 0]);
  const deep = array.strings.filter((s) => s.deepcore);
  const deepX = deep.reduce((s, d) => s + d.x, 0) / deep.length;
  const deepZ = deep.reduce((s, d) => s + d.z, 0) / deep.length;
  return {
    closeDom,
    closeDomPos: array.doms[closeDom].pos,
    centerString: { x: centerString.x, z: centerString.z },
    neighbourMid: [(home.x + neighbour.x) / 2, 0, (home.z + neighbour.z) / 2],
    center: [0, -(DEPTH_TOP + 2450) / 2, 0],
    vertex: event.truth.vertex,
    dir: event.truth.dir,
    cog,
    eventEnd: event.timeRange[1],
    deepcoreAnchor: [deepX, -2105, deepZ],
    descentAxis: [centerString.x + 9, centerString.z + 6],
  };
}

function probeTier() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    return gl ? detectTier(gl) : 'low';
  } catch {
    return 'low';
  }
}

function boot() {
  const hud = createHud();
  const array = buildArray();
  let event = simulateEvent(array);
  const frame = makeSkyFrame(event.truth.zenith, event.truth.azimuth, IC170922A.ra);
  const ctx0 = deriveContext(array, event);

  const detected = probeTier();
  let qualityChoice = exportMode ? 'high' : savedChoice();
  const startTier = qualityChoice === 'auto' ? detected : qualityChoice;
  let world;
  try {
    world = createWorld(document.getElementById('gl'), { array, frame, closeDom: ctx0.closeDom, descentAxis: ctx0.descentAxis, tier: startTier });
  } catch (err) {
    showFallback(hud, err);
    return;
  }
  const { stage } = world;
  const jet = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(1.25, 0.2, 0.35)).toArray();
  const ctx = {
    ...ctx0,
    jetAxis: jet,
    cosmos: world.cosmosLayout,
    scaleAnchors: world.scaleView.anchors,
    cosmosAnchors: world.cosmos.anchors,
    celestialAnchors: world.celestial.anchors,
    dustAnchor: world.anchors.dust,
    bedrockAnchor: world.anchors.bedrock,
    rulerAnchor: world.anchors.ruler,
    schematicAnchor: world.anchors.schematic,
    ringAnchors: world.ice.ringAnchors,
  };
  const chapters = buildChapters(ctx);
  const director = new Director(chapters);
  const labels = createLabelLayer(document.getElementById('labels'));
  const audio = createAudio();
  const mixer = createMixer(); // the viewer's voice and music levels; the music dips under the voice
  const narration = createNarration({ base: 'audio', mixer });
  const fly = createFlyLayer(document.getElementById('flyRoot'));
  narration.useLanguage(hud.lang).then(() => updateButtons());
  if (exportMode) narration.setEnabled(false); // the exporter mixes the clips into the soundtrack itself
  const music = createMusic({ base: 'audio/bgm', mixer });
  if (!exportMode) music.load().then(() => updateButtons()); // the exporter mixes the score itself, too
  const wake = createWakeLock(); // phones: the screen stays on while the tour plays
  // a hidden page (another app, a locked screen) runs no frames: the sound stops with it, and the website's tour
  // pauses, as a video would; back on the page, the tap on play also restarts the sound on iOS
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!filmMode && started && !userMode && director.playing) director.pause();
    narration.pause();
    music.pause();
  });
  const cat = document.getElementById('cat');
  const narrow = window.matchMedia('(max-width: 760px)');
  const fitCat = () => cat.setAttribute('size', narrow.matches ? '84' : '150');
  fitCat();
  narrow.addEventListener('change', fitCat);
  const startEl = document.getElementById('startScreen');
  const endEl = document.getElementById('endScreen');
  // over a title or end card Yeoman stands at the far left and its bubble opens upward, narrow, beside the card's
  // centred text instead of across it
  const CARD_SPOT = { x: 0.075, y: 0.93, side: 'top-left' };
  const setBubble = (side, compact) => {
    if (cat.getAttribute('bubble') !== side) cat.setAttribute('bubble', side);
    cat.classList.toggle('on-card', compact);
  };
  const guide = createGuide({ cat, dock: document.getElementById('catDock'), narration, text: hud.t });
  const bookends = createBookends({ startTour: () => startTour(), duration: (k) => narration.duration(k) });
  const chapterCard = document.getElementById('chapterCard');
  const voiceLog = []; // export: when each spoken line starts, in video seconds
  let loggedKey = null;
  let exportFrameTime = 0;

  let record = world.setEvent(event);
  let userMode = false;
  let userEventTime = null;
  let layerOverride = { physics: null, record: null, reco: null };
  let reduced = reducedQuery.matches;
  let started = false;
  let lastChapter = -1;
  let viewShift = 0;
  let helloTimer = 0;
  let prevEventTime = -1e9;
  let labOpen = false;
  let labReco = null;
  let selected = null;
  let hoverDom = null;
  let preloadedChapter = -1;
  const fpsGuard = createFpsGuard(() => {
    if (qualityChoice !== 'auto') return;
    const i = ORDER.indexOf(world.stage.tier.name);
    if (i > 0) {
      world.setTier(ORDER[i - 1]);
      updateButtons();
    }
  });

  const game = createGame({
    array,
    event,
    frame,
    text: hud.t,
    root: document.getElementById('gamePanel'),
    onUserInput: () => enterUserMode(),
  });
  game.load(event);
  game.buildPanel();
  const precomputing = game.precompute();

  const lab = createLab({
    root: document.getElementById('labPanel'),
    text: hud.t,
    onChange: (p, st) => rerunEvent(p, st),
    onReco: (st) => {
      const pulses = st.clean ? cleanPulses(array, event.pulses) : event.pulses;
      game.load(event, pulses);
      game.buildPanel();
      enterUserMode();
      labReco = 'running';
      gameRunLive();
    },
  });

  function gameRunLive() {
    document.querySelector('#gamePanel [data-a="run"]').click();
  }

  hud.applyStatic(chapters, director);

  // ------------------------------------------------------------------ cat
  function applyCatCue(cueObj, speak) {
    if (!cueObj) return;
    if (cueObj.wear) cat.wear(cueObj.wear);
    if (cueObj.pose === 'point' && cueObj.point) cat.pointAt(cueObj.point[0], cueObj.point[1]);
    else if (cueObj.pose) cat.setPose(cueObj.pose);
    if (speak && cueObj.say) cat.say(hud.t().cat[cueObj.say]);
  }
  function syncCatToTime() {
    cat.quiet(); // a jump makes the last line stale
    const st = director.catStateAt();
    cat.wear(st.wear);
    applyCatCue(st.pose, false);
  }
  cat.addEventListener('yeoman-poke', (e) => {
    e.preventDefault();
    const lines = hud.t().cat.poke;
    cat.say(lines[Math.floor(Math.random() * lines.length)], { hold: 2600 });
    if (cat.pose === 'sleep') cat.setPose('idle');
  });

  // ------------------------------------------------------------------ modes
  function enterUserMode() {
    if (!userMode) {
      userMode = true;
      director.pause();
      narration.stop();
      cat.quiet();
    }
  }
  function resumeTour() {
    userMode = false;
    userEventTime = null;
    layerOverride = { physics: null, record: null, reco: null };
    game.setTourMode();
    if (labOpen) toggleLab(false);
    if (event.params.seed !== 170922 || event.params.kind !== 'track' || event.params.noise || event.params.atmMuon || event.params.scatteringLength !== 33.3) {
      event = simulateEvent(array);
      record = world.setEvent(event);
      game.load(event);
      game.buildPanel();
      game.precompute();
    }
    stage.resumeTour();
    director.play();
  }
  stage.onUserStart(() => enterUserMode());

  function startTour() {
    started = true;
    bookends.toTour();
    hud.leaveStart();
    director.seek(0);
    syncCatToTime();
    director.play();
  }
  function freeExplore() {
    started = true;
    hud.leaveStart();
    hud.showEnd(false);
    clearTimeout(helloTimer);
    director.seekChapter(1, 31.6);
    director.pause();
    userMode = true;
    userEventTime = event.timeRange[1];
    layerOverride = { physics: false, record: true, reco: false };
    syncCatToTime();
    cat.setPose('wave');
    cat.say(hud.t().cat.inspect);
  }

  function rerunEvent(p, st) {
    enterUserMode();
    event = simulateEvent(array, p);
    record = world.setEvent(event, { clean: st.clean });
    game.load(event);
    game.buildPanel();
    userEventTime = event.timeRange[1];
    labReco = null;
    lab.report(array, event, null);
    selectDom(null);
  }

  function toggleLab(force) {
    labOpen = force === undefined ? !labOpen : force;
    hud.els.lab.hidden = !labOpen;
    hud.els.btnLab.setAttribute('aria-pressed', String(labOpen));
    if (labOpen) {
      enterUserMode();
      if (director.locate().index < 3) {
        director.seekChapter(3, 40);
        stage.resumeTour(0.8);
        userMode = true;
      }
      userEventTime = event.timeRange[1];
      layerOverride = { physics: true, record: true, reco: false };
      lab.build();
      lab.report(array, event, null);
    }
  }

  // ------------------------------------------------------------------ selection
  function selectDom(id) {
    selected = id;
    world.arrayView.select(id);
    if (id === null) {
      hud.renderInspector(null);
      world.eventView.setFocus(null);
      return;
    }
    const pulse = record.find((p) => p.dom === id) || null;
    const pulseFull = pulse ? event.pulses.filter((p) => p.dom === id).sort((a, b) => a.t - b.t) : [];
    const times = pulseFull.flatMap((p) => p.times).sort((a, b) => a - b);
    hud.renderInspector({ dom: array.doms[id], pulse: pulse ? { ...pulse, times } : null, onClose: () => selectDom(null) });
    world.eventView.setFocus(pulse ? pulseFull.flatMap((p) => p.photons) : null);
    // show the sample light paths behind the record (they live in the physics layer)
    if (pulse && pulse.kind !== 'noise' && stage.mode === 'user') layerOverride = { ...layerOverride, physics: true };
  }

  const canvas = stage.renderer.domElement;
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6 || stage.sceneName !== 'world') return;
    const hitIds = record.map((p) => p.dom);
    const rect = canvas.getBoundingClientRect();
    const id = world.arrayView.pick(e.clientX - rect.left, e.clientY - rect.top, stage, hitIds, 16) ?? world.arrayView.pick(e.clientX - rect.left, e.clientY - rect.top, stage, null, 10);
    selectDom(id);
  });
  let hoverPending = false;
  canvas.addEventListener('pointermove', (e) => {
    if (hoverPending || e.buttons) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      if (stage.sceneName !== 'world') return;
      const rect = canvas.getBoundingClientRect();
      const id = world.arrayView.pick(e.clientX - rect.left, e.clientY - rect.top, stage, record.map((p) => p.dom), 12);
      world.arrayView.hover(id);
      hoverDom = id;
      canvas.style.cursor = id !== null ? 'pointer' : '';
    });
  });

  // ------------------------------------------------------------------ controls
  const els = hud.els;
  els.play.addEventListener('click', () => {
    if (!started) return startTour();
    if (userMode) return resumeTour();
    director.toggle();
  });
  els.resume.addEventListener('click', resumeTour);
  document.getElementById('btnStart').addEventListener('click', startTour);
  document.getElementById('btnExplore').addEventListener('click', freeExplore);
  document.getElementById('btnAgain').addEventListener('click', () => {
    hud.showEnd(false);
    resumeTour();
    director.seek(0);
    syncCatToTime();
  });
  document.getElementById('btnEndLab').addEventListener('click', () => {
    hud.showEnd(false);
    toggleLab(true);
  });
  document.getElementById('btnEndFree').addEventListener('click', freeExplore);
  document.getElementById('btnSources').addEventListener('click', () => els.dialog.showModal());
  els.btnLab.addEventListener('click', () => toggleLab());
  const setLang = () => {
    hud.setLang(hud.lang === 'zh' ? 'en' : 'zh', chapters, director);
    narration.useLanguage(hud.lang).then(() => updateButtons());
    game.buildPanel();
    if (labOpen) lab.build();
    if (selected !== null) selectDom(selected);
    updateButtons();
  };
  els.btnLang.addEventListener('click', setLang);
  els.btnLangStart.addEventListener('click', setLang);
  els.btnVoice.addEventListener('click', () => {
    narration.setEnabled(!narration.enabled);
    updateButtons();
  });
  createVolumePanel({ els, mixer }); // voice and music sliders, remembered per viewer
  els.btnQuality.addEventListener('click', () => {
    const cycle = ['auto', 'high', 'medium', 'low'];
    qualityChoice = cycle[(cycle.indexOf(qualityChoice) + 1) % cycle.length];
    saveChoice(qualityChoice);
    world.setTier(qualityChoice === 'auto' ? detected : qualityChoice);
    updateButtons();
  });
  els.btnSound.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    updateButtons();
  });
  els.btnSize.addEventListener('click', () => {
    world.setSizeMode(!world.sizeEnlarged);
    updateButtons();
    cat.say(world.sizeEnlarged ? hud.t().ui.sizeNote : hud.t().ui.realNote, { hold: 3600 });
  });
  function updateButtons() {
    const u = hud.t().ui;
    els.btnSound.textContent = audio.enabled ? u.soundOn : u.soundOff;
    els.btnSound.setAttribute('aria-pressed', String(audio.enabled));
    els.btnSize.textContent = world.sizeEnlarged ? u.enlarged : u.realSize;
    els.btnVoice.textContent = !narration.available ? u.voiceNone : narration.enabled ? u.voiceOn : u.voiceOff;
    els.btnVoice.setAttribute('aria-pressed', String(narration.available && narration.enabled));
    els.btnVolume.textContent = u.volume;
    const qName = { auto: u.qAuto, high: u.qHigh, medium: u.qMedium, low: u.qLow }[qualityChoice];
    els.btnQuality.textContent = `${u.qualityLabel}：${qName}${qualityChoice === 'auto' ? `（${{ high: u.qHigh, medium: u.qMedium, low: u.qLow }[world.stage.tier.name]}）` : ''}`;
    els.btnSize.setAttribute('aria-pressed', String(!world.sizeEnlarged));
  }
  updateButtons();

  els.layers.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.layer;
      const on = b.getAttribute('aria-pressed') === 'true';
      layerOverride = { ...layerOverride, [k]: !on };
    }),
  );
  els.physInput.addEventListener('input', () => {
    enterUserMode();
    userEventTime = Number(els.physInput.value);
  });
  document.querySelectorAll('#physTime .step').forEach((b) =>
    b.addEventListener('click', () => {
      enterUserMode();
      const cur = userEventTime ?? prevEventTime;
      userEventTime = clamp(cur + Number(b.dataset.step), event.timeRange[0], event.timeRange[1]);
    }),
  );

  // timeline scrubbing
  const scrub = (e) => {
    const r = els.timeline.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (userMode) {
      userMode = false;
      userEventTime = null;
      game.setTourMode();
      stage.resumeTour(0.5);
    }
    director.seek(f * director.total);
    syncCatToTime();
  };
  els.timeline.addEventListener('pointerdown', (e) => {
    if (!started) startTour();
    els.timeline.setPointerCapture(e.pointerId);
    scrub(e);
    const move = (ev) => scrub(ev);
    const up = () => {
      els.timeline.removeEventListener('pointermove', move);
      els.timeline.removeEventListener('pointerup', up);
    };
    els.timeline.addEventListener('pointermove', move);
    els.timeline.addEventListener('pointerup', up);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === ' ') {
      e.preventDefault();
      els.play.click();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const sign = e.key === 'ArrowRight' ? 1 : -1;
      if (!els.phys.hidden && (userMode || !director.playing)) {
        enterUserMode();
        userEventTime = clamp((userEventTime ?? prevEventTime) + sign * 100, event.timeRange[0], event.timeRange[1]);
      } else {
        director.seek(director.T + sign * 5);
        syncCatToTime();
      }
    } else if (/^[1-6]$/.test(e.key)) {
      if (!started) startTour();
      if (userMode) {
        userMode = false;
        game.setTourMode();
        stage.resumeTour(0.5);
      }
      director.seekChapter(Number(e.key) - 1);
      syncCatToTime();
    } else if (e.key === 'l' || e.key === 'L') {
      const order = [
        { physics: true, record: true, reco: false },
        { physics: false, record: true, reco: false },
        { physics: false, record: true, reco: true },
        { physics: true, record: false, reco: false },
      ];
      const i = order.findIndex((o) => o.physics === layerOverride.physics && o.record === layerOverride.record && o.reco === layerOverride.reco);
      layerOverride = order[(i + 1) % order.length];
    } else if (e.key === 'r' || e.key === 'R') {
      els.btnSize.click();
    } else if (e.key === 'Escape') {
      selectDom(null);
      if (labOpen) toggleLab(false);
    }
  });

  director.on((type) => {
    if (type === 'end') {
      hud.showEnd(true);
      bookends.ended(clock);
      cat.setPose('huff'); // the outro is a tsundere goodbye; it falls asleep once it is said
    } else if (type === 'seek' && started && director.T < director.total - 1e-3 && bookends.phase !== 'intro') {
      bookends.toTour();
    }
    if (type === 'seek') music.resync();
  });
  reducedQuery.addEventListener('change', (e) => (reduced = e.matches));

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  let clock = 0;
  let readyFlag = false;

  function effectiveLayers(state) {
    const pick = (k, v) => (layerOverride[k] === null ? v : layerOverride[k] ? Math.max(v, 1) : 0);
    const physics = pick('physics', state.event.physics);
    const recordL = pick('record', state.array.record);
    const reco = pick('reco', state.array.reco);
    const gameActive = Boolean(state.recoPhase) || (userMode && game.mode === 'user');
    return { physics, record: recordL, reco, recoGeom: gameActive ? (layerOverride.reco === false ? 0 : 1) : 0 };
  }

  /** One frame of work at time step dt (s). The RAF loop calls it; a frame-by-frame renderer can too. */
  function renderFrame(dt) {
    clock += dt;
    const crossed = started ? director.tick(dt) : [];
    crossed.forEach((c) => applyCatCue(c, true));
    const loc = director.locate();
    if (loc.index !== lastChapter) {
      lastChapter = loc.index;
      if (!userMode) layerOverride = { physics: null, record: null, reco: null };
    }
    const state = loc.chapter.apply(loc.local);
    const tourEventTime = state.event.physics > 0 ? state.event.time : state.array.time;
    const eventTime = userEventTime ?? tourEventTime;
    const layers = effectiveLayers(state);

    // reconstruction (tour phase or the viewer's own attempt)
    let recoGeomView = null;
    const phase = state.recoPhase;
    if (phase || (userMode && game.mode === 'user')) {
      game.setReveal(userMode ? 1 : state.hud.plotReveal ?? 1);
      const v = game.update(phase);
      if (v) {
        world.arrayView.setResidualColors(v.residualColors);
        recoGeomView = { candidate: v.candidate, fit: v.fit, fan: v.fan, fanAnchor: v.fanAnchor };
        if (phase && phase.phase === 'sky' && v.fit) {
          const from = v.fit.anchor;
          const s = v3.scale(v.fit.dir, -1);
          recoGeomView.back = { from, dir: s, length: world.celestial.radius + 2200 };
          world.celestial.setRegion(v.angles, v.r90 || 1, (v.fan || []).map((r) => ({ zenith: r.zenith, azimuth: r.azimuth })));
          if (state.hud.sky > 0.02 && v.eq) hud.renderSky({ fit: v.eq, r90: v.r90 || 1, show: state.hud.skyShow || { teach: true, real: true, txs: true } });
          if (state.celestial > 0.05) {
            state.labels.push({ id: 'recoDir', anchor: world.celestial.pointOn(v.angles.zenith, v.angles.azimuth), key: 'recoDir', o: state.celestial, cls: 'ref' });
          }
        }
        if (labReco === 'running' && v.step === 'result') {
          labReco = { err: v.err, r90: v.r90 };
          lab.report(array, event, labReco);
        }
      }
    }
    if (!recoGeomView) layers.recoGeom = 0;

    // keep the subject centred in the space left of a wide side panel (desktop only)
    const sidePanels = [hud.els.game, hud.els.lab, hud.els.sky].filter((el) => !el.hidden && Number(el.style.opacity || 1) > 0.3);
    const vw = window.innerWidth;
    const wantShift = vw > 760 && sidePanels.length ? Math.max(...sidePanels.map((el) => el.getBoundingClientRect().width)) / 2 / vw : 0;
    viewShift += (wantShift - viewShift) * (1 - Math.exp(-5 * dt));
    stage.setViewShift(viewShift);

    const { evAnchors } = world.apply(state, loc.local, { layers, game: recoGeomView, eventTime, clock, dt, reduced });

    // labels: static anchors + dynamic ones from the event view
    const items = state.labels
      .map((lb) => {
        const anchor = lb.dyn ? evAnchors[lb.dyn] : lb.anchor;
        if (!anchor || (lb.dyn && layers.physics < 0.05)) return null;
        const p = stage.project(anchor);
        if (!p.visible) return null;
        return { id: lb.id, x: p.x, y: p.y, text: lb.text || hud.t().labels[lb.key] || '', o: lb.o, cls: lb.cls };
      })
      .filter(Boolean);
    labels.render(items);

    // the guide: Yeoman says the line of the moment (a tour cue or a bookend) in its bubble, in step with the
    // voice, and stands at the chapter's spot
    const book = bookends.tick(clock);
    let voice = book;
    if (!voice && started && !userMode && !labOpen && director.T < director.total) {
      const cue = guide.cueAt(loc.chapter.cues, loc.local);
      if (cue) voice = { key: cue.key, age: loc.local - cue.t, d: cue.d - 0.3 }; // cue.d carries 0.3 s of tail room
    }
    const line = voice ? guide.lineAt(voice.key, voice.age, voice.d) : null;
    if ((started || book) && !userMode) guide.say(line);
    narration.sync(line ? { key: voice.key, t: 0 } : null, voice ? voice.age : 0, Boolean(book) || (director.playing && !userMode));
    if (exportMode && line && voice.key !== loggedKey) {
      voiceLog.push({ key: voice.key, at: exportFrameTime - voice.age });
      loggedKey = voice.key;
    }
    if (loc.index !== preloadedChapter) {
      preloadedChapter = loc.index;
      narration.preload([...(loc.chapter.cues || []).map((c) => c.key), 'intro', 'outro']);
    }
    const wide = !narrow.matches;
    const onCard = Boolean(book) || !endEl.hidden || (!startEl.hidden && !startEl.classList.contains('leaving'));
    const spot = book || bookends.phase === 'done' ? CARD_SPOT : started && !userMode ? catAt(loc.chapter.catSpots, loc.local) : null;
    guide.place(spot, wide);
    setBubble(spot && wide ? spot.side : wide && !onCard ? 'right' : 'top-left', wide && onCard);
    if (bookends.phase === 'done' && cat.pose !== 'sleep') cat.setPose('sleep');
    // the score: the title card's stem, the tour's in step with its clock, the end card's; it dips while Yeoman speaks
    const bookPhase = bookends.phase;
    const cardStem = bookPhase === 'intro' ? 'intro' : bookPhase === 'outro' || bookPhase === 'done' ? 'outro' : null;
    const want = cardStem
      ? { name: cardStem, time: clock - bookends.since, playing: true }
      : started && !userMode && director.T < director.total
        ? { name: 'tour', time: director.T, playing: director.playing }
        : null;
    music.sync(want, Boolean(line));
    wake.hold(!exportMode && (Boolean(book) || (started && !userMode && director.playing)));
    // film: the chapter's name comes up for a moment when it begins (no top bar in the film version), near the
    // top; a chapter whose opening shot needs that space sets `cardAt` (s) and `cardTop` (fraction of the height)
    if (filmMode && chapterCard) {
      const c0 = loc.chapter.cardAt ?? 0.15;
      const card = started && bookends.phase === 'tour' ? smoothstep(c0, c0 + 0.45, loc.local) * (1 - smoothstep(c0 + 2.25, c0 + 3.05, loc.local)) : 0;
      chapterCard.style.opacity = card.toFixed(3);
      if (card > 0) {
        chapterCard.textContent = `${loc.index + 1} · ${hud.t().chapters[loc.index]}`;
        chapterCard.style.top = `${((loc.chapter.cardTop ?? 0.09) * 100).toFixed(1)}%`;
      }
    }

    // the hand-off from picture to data: records fly into the scatter plot
    if (state.hud.fly >= 0 && state.hud.fly <= 1) {
      const targets = game.scatterTargets();
      if (targets) {
        const [t0, t1] = world.timeRange;
        const recT = new Map(record.map((p) => [p.dom, p.t]));
        const items2 = targets.map((tg) => ({
          from: stage.project(array.doms[tg.dom].pos),
          to: tg.to,
          rank: tg.rank,
          color: timeColor(clamp(((recT.get(tg.dom) ?? t0) - t0) / (t1 - t0), 0, 1)),
        }));
        fly.draw(items2, state.hud.fly);
      }
    } else {
      fly.clear();
    }

    // Yeoman watches the action: the neutrino marker, then the muon head; otherwise its own idle glances
    const focus = evAnchors.nu || evAnchors.mu;
    if (focus && layers.physics > 0.3 && stage.sceneName === 'world') {
      const p = stage.project(focus);
      const r = cat.getBoundingClientRect();
      const dx = (p.x - (r.left + r.width / 2)) / Math.max(window.innerWidth * 0.5, 1);
      const dy = (p.y - (r.top + r.height * 0.45)) / Math.max(window.innerHeight * 0.5, 1);
      if (cat.pose !== 'point') cat.lookAt(clamp(dx * 1.6, -1, 1), clamp(dy * 1.6, -1, 1));
    } else if (hoverDom !== null) {
      const p = stage.project(array.doms[hoverDom].pos);
      const r = cat.getBoundingClientRect();
      cat.lookAt(clamp((p.x - r.left) / window.innerWidth * 2, -1, 1), clamp((p.y - r.top) / window.innerHeight * 2, -1, 1));
    } else {
      cat.lookAt(null);
    }

    // sonification of records crossing the current time (forward playback only)
    if (audio.enabled && eventTime > prevEventTime && eventTime - prevEventTime < 2000 && layers.record > 0.5) {
      record.forEach((p) => {
        if (p.t > prevEventTime && p.t <= eventTime) audio.ping(array.doms[p.dom].depth, p.q);
      });
    }
    if (audio.enabled) audio.ambience(stage.sceneName === 'world' ? (stage.camera.position.y > 0 ? 'wind' : 'deep') : null);
    const rate = state.hud.physTime && director.playing && !userMode ? (eventTime - prevEventTime) / Math.max(dt, 1e-3) : 0;
    prevEventTime = eventTime;

    hud.frame({
      state,
      local: loc.local,
      chapter: loc.chapter,
      director,
      userMode,
      depth: -stage.camera.position.y,
      physTime: eventTime,
      rate,
      layers,
      eventRange: event.timeRange,
      quiet: labOpen,
    });

    // adaptive quality: in "auto", step the tier down if frames stay slow
    if ((director.playing || userMode) && !exportMode) fpsGuard(dt);
    if (!readyFlag) {
      readyFlag = true;
      document.documentElement.dataset.ready = '1';
      document.getElementById('app').classList.remove('booting');
    }
  }

  function loop(now) {
    // a frame advances the clock by at most 0.1 s, so after slow frames (the start of the tour is the slowest, and a
    // phone is slower still) the voice and the score run ahead: the clock catches up with them rather than pulling
    // them back, which sounded like a stutter or a gap. While a line is spoken it follows the voice alone (catching up
    // with the score then would leave the voice behind); between lines it catches up with the score.
    const lead = narration.speaking ? narration.lead : music.lead;
    const dt = Math.min(0.1, (now - last) / 1000) + Math.min(0.5, lead);
    last = now;
    renderFrame(dt);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ deep link
  if (params.has('lang') && params.get('lang') !== hud.lang) setLang();
  if (params.get('size') === 'real') world.setSizeMode(false);
  updateButtons();
  if (params.has('ch')) {
    started = true;
    bookends.toTour(); // a deep link lands inside the tour (the film version then shows its chapter cards too)
    hud.showStart(false);
    director.seekChapter(Number(params.get('ch')) - 1, Number(params.get('t') || 0));
    syncCatToTime();
    if (params.has('play')) director.play();
  } else if (params.get('start') === '0') {
    started = true;
    hud.showStart(false);
  } else {
    cat.setPose('wave');
    cat.wear(['beanie', 'scarf']);
    if (!filmMode) helloTimer = setTimeout(() => cat.say(hud.t().cat.hello, { hold: 5200 }), 900);
    else if (!exportMode) {
      // film preview: a click (which also lets the page play sound) starts the intro and then the film
      const begin = () => bookends.begin(clock);
      window.addEventListener('pointerdown', begin, { once: true });
      window.addEventListener('keydown', (e) => e.key === ' ' && begin(), { once: true });
    }
  }
  if (params.has('free')) freeExplore();
  if (params.has('debug') || exportMode) window.__ice = { array, director, world, game, chapters, renderFrame, narration, music, cat, hdrSweep: (o) => hdrSweep({ director, world, renderFrame }, o), get event() { return event; }, precomputing };
  if (exportMode) window.__ice.export = createExportHooks();
  if (params.has('audiodebug')) createAudioDebug({ mixer, narration, music, wake });
  stage.snapToTour();
  if (!exportMode) requestAnimationFrame(loop);

  /** Hooks for web/_tools/export_mp4.mjs: prepare (fonts, precompute, virtual time), step one frame, start the tour. */
  function createExportHooks() {
    let vclock = null;
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let frame = 0;
    return {
      async prepare() {
        await document.fonts.ready;
        await precomputing;
        vclock = installVirtualClock();
        document.documentElement.classList.add('exporting');
        bookends.begin(clock); // no click in an export: the title card and the intro start at once
        return { total: director.total, voice: narration.voice, lang: hud.lang };
      },
      /** Render the next frame; `done` once the end card has been held after the outro. */
      async step(dt) {
        exportFrameTime = frame * dt;
        frame += 1;
        vclock.advanceTimers(dt * 1000);
        renderFrame(dt);
        vclock.advanceAnimations(dt * 1000);
        await nextPaint();
        return { done: bookends.phase === 'done', T: director.T };
      },
      /** When each spoken line starts, in video seconds: [{key, at}]. */
      voiceLog() {
        return voiceLog.slice();
      },
      /** Stills (web/_tools/stills.mjs): jump into the tour, playing, at tour time T or chapter ch (1-based) + t s. */
      seek({ ch, t = 0, T }) {
        started = true;
        bookends.toTour();
        hud.showStart(false);
        if (T !== undefined) director.seek(T);
        else director.seekChapter(ch - 1, t);
        syncCatToTime();
        director.play();
        return { T: director.T, total: director.total };
      },
    };
  }
}

try {
  boot();
} catch (err) {
  const el = document.getElementById('fallback');
  el.innerHTML = `<article><h1>IceCube</h1><p>${String(err && err.message ? err.message : err)}</p></article>`;
  el.hidden = false;
  throw err;
}
