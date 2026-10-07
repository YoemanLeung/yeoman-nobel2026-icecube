// Quality tiers: pick a starting tier from the device, step down at runtime if frames are slow, and
// let the viewer override (自动 / 高 / 中 / 省电). Every tier draws the same picture; higher tiers add
// resolution, bloom, shadows and particle density.

export const TIERS = Object.freeze({
  high: { name: 'high', pixelCap: 2, bloom: 'full', shadows: true, particles: 1 },
  medium: { name: 'medium', pixelCap: 1.5, bloom: 'half', shadows: false, particles: 0.7 },
  low: { name: 'low', pixelCap: 1, bloom: 'off', shadows: false, particles: 0.45 },
});
export const ORDER = ['low', 'medium', 'high'];
const KEY = 'icecube-quality';

export function savedChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'high' || v === 'medium' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveChoice(choice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

/** Starting tier from what the browser reveals: phones start low, Apple base chips medium, discrete GPUs high. */
export function detectTier(gl) {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  if (mobile) return 'low';
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    gpu = '';
  }
  if (/NVIDIA|GeForce|RTX|Radeon(?!.*Vega 8)|AMD Radeon Pro/i.test(gpu)) return 'high';
  if (/Apple M\d+ (Pro|Max|Ultra)/i.test(gpu)) return 'high';
  if (/Apple M\d+|Apple GPU/i.test(gpu)) return 'medium';
  if (/Intel/i.test(gpu)) return (navigator.deviceMemory || 8) >= 8 ? 'medium' : 'low';
  return 'medium';
}

/** Runtime guard: if a tier keeps missing frames, step down once per window; never step up on its own. */
export function createFpsGuard(onStepDown) {
  let acc = 0;
  let frames = 0;
  let cooldown = 3;
  return (dt) => {
    acc += dt;
    frames += 1;
    cooldown -= dt;
    if (acc < 2.5) return;
    const fps = frames / acc;
    acc = 0;
    frames = 0;
    if (fps < 38 && cooldown <= 0) {
      cooldown = 6;
      onStepDown(fps);
    }
  };
}
