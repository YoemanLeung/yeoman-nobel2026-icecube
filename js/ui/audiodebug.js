// #audiodebug: a corner readout of the sound's state, for checking playback on a phone, where there is no console.

export function createAudioDebug({ mixer, narration, music, wake }) {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:6px;top:6px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,monospace;' +
    'background:rgba(0,0,0,.75);color:#b6f5b0;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  const player = (c, name) => (c ? `${c[name]} ${c.paused ? 'paused' : 'playing'} ${c.time.toFixed(2)}s` : '-');
  setInterval(() => {
    box.textContent = [
      `audio context ${mixer.state}`,
      `voice ${player(narration.current, 'key')}  lead ${narration.lead.toFixed(2)}`,
      `music ${player(music.current, 'name')}  lead ${music.lead.toFixed(2)}`,
      `page ${document.visibilityState}  screen lock ${wake.held ? 'held' : 'off'}`,
    ].join('\n');
  }, 250);
}
