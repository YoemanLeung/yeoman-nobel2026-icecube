// The celestial sphere seen from the South Pole (last chapter).
// At the pole the horizon coincides with the celestial equator, so declination circles are horizontal
// rings (dec > 0, the northern sky, lies BELOW the horizon) and RA meridians run through the zenith.

import * as THREE from 'three';
import { arrivalVector, v3, DEG } from '../core/math.js';

const R = 7000; // metres; a diagram sphere centred on the surface above the array

function ring(points, color, opacity) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  line.frustumCulled = false;
  return line;
}

export function createCelestial(scene, frame) {
  const group = new THREE.Group();
  const lines = [];
  for (let dec = -75; dec <= 75; dec += 15) {
    const y = -R * Math.sin(dec * DEG);
    const r = R * Math.cos(dec * DEG);
    const pts = Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2;
      return [r * Math.cos(a), y, -r * Math.sin(a)];
    });
    const l = ring(pts, dec === 0 ? 0xffd666 : 0x7fb6dc, dec === 0 ? 0.9 : 0.16);
    lines.push(l);
    group.add(l);
  }
  for (let ra = 0; ra < 360; ra += 30) {
    const { azimuth } = frame.toLocal(ra, 0);
    const pts = Array.from({ length: 97 }, (_, i) => {
      const zen = (i / 96) * Math.PI;
      return v3.scale(arrivalVector(zen, azimuth), R);
    });
    const l = ring(pts, 0x7fb6dc, 0.13);
    lines.push(l);
    group.add(l);
  }

  // the ground: a translucent disc at the horizon; below it the sky is seen "through the Earth"
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(R, 96),
    new THREE.MeshBasicMaterial({ color: 0x5d7894, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  const below = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.995, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3a2a20, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.BackSide }),
  );
  group.add(ground, below);

  // region and bootstrap dots on the sphere
  const region = ring(Array.from({ length: 65 }, () => [0, 0, 0]), 0xffd166, 0.95);
  const dots = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3)),
    new THREE.PointsMaterial({ color: 0xffe2a0, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false }),
  );
  dots.frustumCulled = false;
  group.add(region, dots);
  scene.add(group);

  let opacity = 1;
  const pointOn = (zenith, azimuth) => v3.scale(arrivalVector(zenith, azimuth), R);

  return {
    group,
    radius: R,
    pointOn,
    anchors: {
      equator: [R * 0.72, 120, -R * 0.69],
      north: [0, -R * 0.62, R * 0.25],
      south: [0, R * 0.68, R * 0.2],
    },
    /** fit: {zenith, azimuth}; radiusDeg: containment radius; reps: [{zenith, azimuth}] */
    setRegion(fit, radiusDeg, reps = []) {
      const s = arrivalVector(fit.zenith, fit.azimuth);
      const helper = Math.abs(s[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = v3.norm(v3.cross(s, helper));
      const w = v3.cross(s, u);
      const rr = radiusDeg * DEG;
      const pts = region.geometry.attributes.position.array;
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const d = v3.norm(v3.add(v3.scale(s, Math.cos(rr)), v3.add(v3.scale(u, Math.sin(rr) * Math.cos(a)), v3.scale(w, Math.sin(rr) * Math.sin(a)))));
        pts.set(v3.scale(d, R), i * 3);
      }
      region.geometry.attributes.position.needsUpdate = true;
      const dp = dots.geometry.attributes.position.array;
      reps.slice(0, 120).forEach((r, i) => dp.set(pointOn(r.zenith, r.azimuth), i * 3));
      dots.geometry.setDrawRange(0, Math.min(120, reps.length));
      dots.geometry.attributes.position.needsUpdate = true;
    },
    update(a) {
      opacity = a;
      group.visible = a > 0.001;
      lines.forEach((l, i) => (l.material.opacity = (i === 5 ? 0.9 : i < 11 ? 0.16 : 0.13) * a));
      ground.material.opacity = 0.22 * a;
      below.material.opacity = 0.16 * a;
      region.material.opacity = 0.95 * a;
      dots.material.opacity = 0.9 * a;
    },
    get opacity() {
      return opacity;
    },
  };
}
