// Procedural textures drawn on canvases (no image files to license or load).

import * as THREE from 'three';

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial dot for photons, glows and stars. */
export const softDot = (inner = 0.0, outer = 1.0) =>
  canvasTexture(64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, (s / 2) * inner, s / 2, s / 2, (s / 2) * outer);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });

/** A text label texture (for in-scene signage that must scale with the world, e.g. the scale bar). */
export function labelTexture(text, { font = '600 44px "PingFang SC", "Noto Sans SC", sans-serif', color = '#dff4ff', pad = 18 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w;
  c.height = 72;
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, pad, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { aspect: w / 72 };
  return tex;
}

/** Subtle snow surface: gentle sastrugi ridges plus grain. */
export const snowTexture = () =>
  canvasTexture(512, (g, s) => {
    g.fillStyle = '#c9d6e6';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const l = 190 + Math.random() * 60;
      g.fillStyle = `rgba(${l},${l + 8},${l + 20},${0.08 + Math.random() * 0.12})`;
      g.fillRect(x, y, 1 + Math.random() * 6, 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 70; i++) {
      g.beginPath();
      const y0 = Math.random() * s;
      g.moveTo(0, y0);
      g.bezierCurveTo(s * 0.3, y0 + 10 * Math.random(), s * 0.6, y0 - 12 * Math.random(), s, y0 + 4);
      g.lineWidth = 1 + Math.random() * 3;
      g.stroke();
    }
  });

/** Outline of Yeoman (dashed) used as a 30 cm scale reference next to a DOM. */
export const catOutlineTexture = () =>
  canvasTexture(256, (g, s) => {
    const k = s / 240;
    g.setTransform(k, 0, 0, k, 0, 6);
    const body = new Path2D(
      'M 110 60 C 144 60 172 68 181 92 C 189 112 188 136 179 152 C 172 166 172 184 165 202 L 55 202 C 48 184 48 166 41 152 C 32 136 31 112 39 92 C 48 68 76 60 110 60 Z',
    );
    const earL = new Path2D('M 41 96 C 42 76 46 52 52 36 C 55 30 61 29 65 33 C 76 44 88 54 100 61');
    const earR = new Path2D('M 179 96 C 178 76 174 52 168 36 C 165 30 159 29 155 33 C 144 44 132 54 120 61');
    g.lineWidth = 6;
    g.setLineDash([14, 10]);
    g.strokeStyle = 'rgba(255, 214, 102, 0.95)';
    g.lineCap = 'round';
    [body, earL, earR].forEach((p) => g.stroke(p));
    g.setLineDash([]);
    g.fillStyle = 'rgba(255, 214, 102, 0.95)';
    g.beginPath();
    g.ellipse(84, 124, 5, 6, 0, 0, Math.PI * 2);
    g.ellipse(136, 124, 5, 6, 0, 0, Math.PI * 2);
    g.fill();
  });

/** Human silhouette outline for the scale chapter (1.7 m reference). */
export const humanOutlineTexture = () =>
  canvasTexture(256, (g, s) => {
    g.strokeStyle = 'rgba(255, 214, 102, 0.95)';
    g.fillStyle = 'rgba(255, 214, 102, 0.18)';
    g.lineWidth = 5;
    g.setLineDash([12, 8]);
    const cx = s / 2;
    g.beginPath();
    g.arc(cx, 34, 22, 0, Math.PI * 2);
    g.moveTo(cx - 30, 70);
    g.lineTo(cx + 30, 70);
    g.lineTo(cx + 40, 150);
    g.lineTo(cx + 22, 152);
    g.lineTo(cx + 18, 248);
    g.lineTo(cx + 2, 248);
    g.lineTo(cx, 168);
    g.lineTo(cx - 2, 248);
    g.lineTo(cx - 18, 248);
    g.lineTo(cx - 22, 152);
    g.lineTo(cx - 40, 150);
    g.closePath();
    g.fill();
    g.stroke();
  });

/** Normal map for corrugated metal siding (vertical ribs). */
export function corrugationNormal(ribs = 16) {
  const tex = canvasTexture(256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let x = 0; x < s; x++) {
      const nx = Math.sin((x / s) * ribs * Math.PI * 2) * 0.55;
      const r = Math.round((nx * 0.5 + 0.5) * 255);
      for (let y = 0; y < s; y++) {
        const i = (y * s + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = 128;
        img.data[i + 2] = 230;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Normal map for wind-carved snow (sastrugi): long soft ridges plus fine grain. */
export function snowNormal() {
  const s = 256;
  const h = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s;
      const v = y / s;
      h[y * s + x] =
        Math.sin((u * 3 + v * 11) * Math.PI * 2) * 0.5 +
        Math.sin((u * 7 - v * 23 + Math.sin(u * 9) * 0.3) * Math.PI * 2) * 0.25 +
        (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * 0.06;
    }
  }
  const tex = canvasTexture(s, (g) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = h[y * s + ((x + 1) % s)] - h[y * s + ((x - 1 + s) % s)];
        const dy = h[((y + 1) % s) * s + x] - h[((y - 1 + s) % s) * s + x];
        const i = (y * s + x) * 4;
        img.data[i] = Math.round((0.5 - dx * 0.35) * 255);
        img.data[i + 1] = Math.round((0.5 - dy * 0.35) * 255);
        img.data[i + 2] = 240;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Small flag texture for route markers. */
export const flagTexture = (color) =>
  canvasTexture(64, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 4; i++) g.fillRect(0, (i * s) / 4 + 6, s, 3);
  });
