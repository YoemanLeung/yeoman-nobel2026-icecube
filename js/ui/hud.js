// The 2D layer: language, subtitles, timeline, readouts, legend, overlays, panels and the start /
// end screens. It only renders what main.js hands it; it owns no story logic.

import zh from '../content/text.zh.js';
import en from '../content/text.en.js';
import { renderProcess, renderMessengers } from './origin.js';
import { createSkyMap } from './skymap.js';
import { rampCss, drawPulse } from './plots.js';
import { clamp } from '../core/math.js';

const DICTS = { zh, en };
const $ = (s, root = document) => root.querySelector(s);
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

export function createHud() {
  let lang = 'zh';
  try {
    const saved = localStorage.getItem('icecube-lang');
    if (saved === 'en' || saved === 'zh') lang = saved;
  } catch {
    /* storage unavailable: keep default */
  }
  const t = () => DICTS[lang];
  const els = {
    app: $('#app'),
    subtitles: $('#subtitles'),
    fade: $('#fade'),
    flash: $('#flash'),
    btnVoice: $('#btnVoice'),
    btnVolume: $('#btnVolume'),
    volumePanel: $('#volumePanel'),
    volVoice: $('#volVoice'),
    volMusic: $('#volMusic'),
    btnQuality: $('#btnQuality'),
    scaleLabel: $('#scaleLabel'),
    depth: $('#depthGauge'),
    depthNow: $('#depthGauge .dg-now'),
    depthVal: $('#depthGauge .dg-value'),
    brandChapter: $('.brand-chapter'),
    play: $('#btnPlay'),
    timeline: $('#timeline'),
    segs: $('#timeline .tl-segs'),
    fill: $('#timeline .tl-fill'),
    knob: $('#timeline .tl-knob'),
    clock: $('#clock'),
    resume: $('#btnResume'),
    layers: $('#layers'),
    legend: $('#legend'),
    phys: $('#physTime'),
    physInput: $('#physTime input'),
    physVal: $('#physTime .pt-value'),
    physRate: $('#physTime .pt-rate'),
    process: $('#overlayProcess'),
    messengers: $('#overlayMessengers'),
    sky: $('#overlaySky'),
    inspector: $('#inspector'),
    game: $('#gamePanel'),
    lab: $('#labPanel'),
    start: $('#startScreen'),
    end: $('#endScreen'),
    dialog: $('#sourcesDialog'),
    btnSize: $('#btnSize'),
    btnLab: $('#btnLab'),
    btnSound: $('#btnSound'),
    btnLang: $('#btnLang'),
    btnLangStart: $('#btnLangStart'),
  };
  let skymap = null;
  let messengers = null;
  let lastSub = '';
  let lastLegend = '';
  let chapterTitles = [];
  let lastSkyKey = '';

  function applyStatic(chapters, director) {
    const d = t();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = d.meta.title;
    // {min} is the tour's length, which follows the narration (a slower voice makes a longer film)
    const minutes = String(director ? Math.max(1, Math.round(director.total / 60)) : 5);
    document.querySelectorAll('[data-t]').forEach((el) => {
      const v = get(d, el.dataset.t);
      if (typeof v === 'string') el.textContent = v.replace('{min}', minutes);
    });
    $('.nobel-text').textContent = d.meta.nobel;
    const link = $('.nobel-link');
    link.textContent = `${d.meta.nobelLink} ↗`;
    link.href = 'https://www.nobelprize.org/prizes/physics/2026/press-release/';
    $('.nobel-end').textContent = d.meta.nobel;
    $('.end-lines').innerHTML = d.end.lines.map((x) => `<li>${x}</li>`).join('');
    els.btnLab.textContent = d.ui.lab;
    els.btnLang.textContent = d.ui.lang;
    els.btnLangStart.textContent = d.ui.lang;
    els.resume.textContent = d.ui.resume;
    els.layers.querySelector('.hud-title').textContent = d.ui.layers;
    els.layers.querySelector('[data-layer="physics"]').textContent = d.ui.layerPhysics;
    els.layers.querySelector('[data-layer="record"]').textContent = d.ui.layerRecord;
    els.layers.querySelector('[data-layer="reco"]').textContent = d.ui.layerReco;
    $('#physTime [data-step="-100"]').setAttribute('aria-label', d.ui.stepBack);
    $('#physTime [data-step="100"]').setAttribute('aria-label', d.ui.stepFwd);
    chapterTitles = d.chapters;
    els.segs.innerHTML = chapters
      .map((c, i) => `<span style="flex:${c.duration}"><b>${i + 1} · ${chapterTitles[i]}</b></span>`)
      .join('');
    renderProcess(els.process, d);
    messengers = renderMessengers(els.messengers, d);
    els.sky.querySelector('.overlay-head').textContent = d.sky.title;
    els.sky.querySelector('.overlay-note').textContent = `${d.sky.facts} ${d.sky.note}`;
    skymap = createSkyMap(els.sky.querySelector('.skymap-host'));
    lastSkyKey = '';
    lastSub = '';
    lastLegend = '';
    renderSources();
    if (director) updateTimeline(director);
  }

  function renderSources() {
    const d = t().sources;
    els.dialog.querySelector('.dialog-body').innerHTML = `
      <h3>${d.about}</h3><p>${d.aboutBody}</p>
      <h3>${d.title}</h3>
      <ol>${d.list.map(([name, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${name}</a></li>`).join('')}</ol>
      <p>${d.credit}</p>`;
  }

  function updateTimeline(director) {
    const f = director.T / director.total;
    els.fill.style.width = `${f * 100}%`;
    els.knob.style.left = `${f * 100}%`;
    els.timeline.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    els.clock.textContent = `${fmtClock(director.T)} / ${fmtClock(director.total)}`;
    const { index } = director.locate();
    [...els.segs.children].forEach((s, i) => s.classList.toggle('now', i === index));
    els.brandChapter.textContent = `${index + 1} · ${chapterTitles[index] || ''}`;
    els.play.classList.toggle('playing', director.playing);
    els.play.setAttribute('aria-label', director.playing ? t().ui.pause : t().ui.play);
  }

  function setSubtitle(key) {
    if (key === lastSub) return;
    lastSub = key;
    els.subtitles.innerHTML = key ? `<span class="line">${t().sub[key] || ''}</span>` : '';
  }

  function setLegend(kind) {
    if (kind === lastLegend) return;
    lastLegend = kind || '';
    if (!kind) {
      els.legend.hidden = true;
      return;
    }
    const u = t().ui;
    els.legend.hidden = false;
    els.legend.innerHTML =
      kind === 'resid'
        ? `<div>${u.legendResid}</div><div class="ramp" style="background:${rampCss('resid')}"></div>
           <div class="ends"><span>${u.residEarly}</span><span>${u.residOk}</span><span>${u.residLate}</span></div>`
        : `<div>${u.legendTime}</div><div class="ramp" style="background:${rampCss('time')}"></div>
           <div class="ends"><span>${u.early}</span><span>${u.late}</span></div><p>${u.legendSize}</p><p>${u.legendRecord}</p>`;
  }

  function overlay(el, a) {
    const on = a > 0.02;
    if (el.hidden === on) el.hidden = !on;
    el.style.opacity = String(clamp(a, 0, 1));
  }

  return {
    t,
    get lang() {
      return lang;
    },
    setLang(next, chapters, director) {
      lang = next;
      try {
        localStorage.setItem('icecube-lang', lang);
      } catch {
        /* ignore */
      }
      applyStatic(chapters, director);
    },
    applyStatic,
    els,
    updateTimeline,
    setSubtitle,
    setLegend,
    frame({ state, local, chapter, director, userMode, depth, physTime, rate, layers, eventRange, quiet }) {
      // no subtitles: Yeoman says the narration in its speech bubble (ui/guide.js)
      els.fade.style.opacity = String(state.fade || 0);
      els.flash.style.opacity = String(state.flash || 0);
      // scale label
      const sl = state.hud.scaleLabel;
      els.scaleLabel.classList.toggle('show', Boolean(sl));
      if (sl) els.scaleLabel.textContent = t().labels[sl];
      // depth gauge
      const showDepth = state.hud.depth === 'camera';
      els.depth.hidden = !showDepth;
      if (showDepth) {
        const dpos = clamp(depth / 2820, 0, 1);
        els.depthNow.style.top = `${dpos * 100}%`;
        els.depthVal.textContent = `${t().ui.depth} ${Math.round(Math.max(0, depth)).toLocaleString('en-US')} ${t().ui.meters}`;
      }
      // the legend follows what is actually drawn, not only the chapter's intent
      const legend = layers.reco > 0.5 && layers.recoGeom > 0 ? 'resid' : layers.record > 0.5 && (state.hud.legend || userMode) ? 'time' : null;
      setLegend(state.scene === 'world' ? legend : null);
      const explore = userMode && state.scene === 'world';
      els.layers.hidden = !(state.hud.layers || explore);
      if (!els.layers.hidden) {
        ['physics', 'record', 'reco'].forEach((k) =>
          els.layers.querySelector(`[data-layer="${k}"]`).setAttribute('aria-pressed', String(layers[k] > 0.5)),
        );
      }
      // physical time
      const showPhys = state.hud.physTime || explore;
      els.phys.hidden = !showPhys;
      document.body.classList.toggle('has-phys', showPhys);
      if (showPhys) {
        els.physInput.min = String(Math.round(eventRange[0]));
        els.physInput.max = String(Math.round(eventRange[1]));
        if (document.activeElement !== els.physInput) els.physInput.value = String(Math.round(physTime));
        const us = physTime / 1000;
        els.physVal.textContent = `${t().ui.physTime} ${us >= 0 ? ' ' : ''}${us.toFixed(3)} μs`;
        els.physRate.textContent = rate ? `${t().ui.slowmo}: 1 s ≈ ${rate >= 1000 ? `${(rate / 1000).toFixed(2)} μs` : `${Math.round(rate)} ns`}` : '';
      }
      overlay(els.process, state.hud.process);
      overlay(els.messengers, state.hud.messengers);
      if (state.hud.messengers > 0.02 && !els.messengers.dataset.played) {
        els.messengers.dataset.played = '1';
        messengers && messengers.replay();
      }
      if (state.hud.messengers <= 0.02) delete els.messengers.dataset.played;
      overlay(els.sky, state.hud.sky);
      els.game.hidden = !state.hud.game;
      els.resume.hidden = !userMode;
      const rightPanel = !els.game.hidden || !els.lab.hidden || !els.inspector.hidden || state.hud.sky > 0.02 || state.hud.process > 0.02;
      document.body.classList.toggle('has-panel', rightPanel);
      document.body.classList.toggle('has-sheet', !els.game.hidden || !els.lab.hidden || !els.inspector.hidden);
      updateTimeline(director);
    },
    renderSky(args) {
      if (!skymap) return;
      const sh = args.show || {};
      const key = `${sh.teach}|${sh.real}|${sh.txs}|${args.fit ? args.fit.ra.toFixed(2) : ''}|${args.r90.toFixed(2)}`;
      if (key === lastSkyKey) return;
      lastSkyKey = key;
      const s = t().sky;
      skymap.render({ ...args, step: { labels: { ra: s.ra, dec: s.dec, orion: s.orion, teach: s.teach, ic: s.ic, txs: s.txs } } });
    },
    renderInspector(info) {
      const d = t().inspector;
      if (!info) {
        els.inspector.hidden = true;
        return;
      }
      els.inspector.hidden = false;
      const { dom, pulse } = info;
      const rows = [
        [d.string, `${dom.string}${dom.deepcore ? ' · DeepCore' : ''}`],
        [d.index, `${dom.index} / 60`],
        [d.depth, `${dom.depth.toFixed(0)} m`],
        [d.pos, `${dom.pos[0].toFixed(0)}, ${dom.pos[2].toFixed(0)} m`],
      ];
      if (pulse) {
        rows.push([d.first, `${(pulse.t / 1000).toFixed(3)} μs`]);
        rows.push([d.charge, `${pulse.q} ${d.pe}`]);
      }
      els.inspector.innerHTML = `
        <button class="close-x" aria-label="${t().ui.close}">×</button>
        <h3>${d.title} · #${dom.id + 1}</h3>
        <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        ${pulse ? `<div class="hint">${d.pulse}</div><canvas class="plot short"></canvas>` : `<p class="note">${d.none}</p>`}
        ${pulse && pulse.kind === 'noise' ? `<p class="note">${d.noise}</p>` : ''}
        ${pulse && pulse.kind !== 'noise' ? `<p class="note">${d.path}</p>` : ''}`;
      if (pulse) drawPulse(els.inspector.querySelector('canvas'), pulse.times, { label: 'ns' });
      els.inspector.querySelector('.close-x').addEventListener('click', () => info.onClose && info.onClose());
    },
    showStart(on) {
      els.start.hidden = !on;
      els.start.classList.remove('leaving');
    },
    leaveStart() {
      els.start.classList.add('leaving');
      setTimeout(() => (els.start.hidden = true), 800);
    },
    showEnd(on) {
      els.end.hidden = !on;
    },
  };
}
