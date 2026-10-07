// The volume panel: a voice slider and a music slider (0-100 %), remembered per viewer by the mixer. The chip opens
// it; a click elsewhere or Esc closes it.

export function createVolumePanel({ els, mixer }) {
  const sliders = [
    [els.volVoice, 'voice'],
    [els.volMusic, 'music'],
  ];
  const show = (on) => {
    els.volumePanel.hidden = !on;
    els.btnVolume.setAttribute('aria-expanded', String(on));
    if (!on) return;
    sliders.forEach(([input, bus]) => {
      input.value = String(Math.round(mixer.level(bus) * 100));
      input.nextElementSibling.textContent = `${input.value}%`;
    });
  };
  els.btnVolume.addEventListener('click', (e) => {
    e.stopPropagation();
    show(els.volumePanel.hidden);
  });
  sliders.forEach(([input, bus]) =>
    input.addEventListener('input', () => {
      mixer.setLevel(bus, Number(input.value) / 100);
      input.nextElementSibling.textContent = `${input.value}%`;
    }),
  );
  els.volumePanel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => show(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && show(false));
}
