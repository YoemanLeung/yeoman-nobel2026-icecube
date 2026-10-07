// Reconstruction layer in 3D: the candidate track the viewer steers, the algorithm's track, the fan of
// bootstrap tracks (its uncertainty), and the back-projection towards the sky.

import * as THREE from 'three';
import { v3, clamp } from '../core/math.js';

function lineMesh(color, opacity) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  mesh.frustumCulled = false;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
function place(mesh, from, to, radius) {
  const a = new THREE.Vector3(...from);
  const d = new THREE.Vector3(...to).sub(a);
  const len = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(radius, len, radius);
}

function arrowHead(color) {
  const geo = new THREE.ConeGeometry(1, 2.6, 14);
  geo.translate(0, 1.3, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  mesh.frustumCulled = false;
  return mesh;
}

export function createRecoView(scene) {
  const group = new THREE.Group();
  const candidate = lineMesh(0x9be8ff, 0.85);
  const candArrow = arrowHead(0x9be8ff);
  const fit = lineMesh(0xffd166, 0.95);
  const fitArrow = arrowHead(0xffd166);
  const back = lineMesh(0xffd166, 0.6);
  const fanGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 6), 3));
  const fan = new THREE.LineSegments(fanGeo, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.22, depthWrite: false }));
  fan.frustumCulled = false;
  const anchorDot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.8 }));
  group.add(candidate, candArrow, fit, fitArrow, back, fan, anchorDot);
  scene.add(group);

  const HALF = 900;

  function drawTrack(mesh, arrow, anchor, dir, thick, opacity) {
    const a = v3.addScaled(anchor, dir, -HALF);
    const b = v3.addScaled(anchor, dir, HALF);
    place(mesh, a, b, thick);
    mesh.material.opacity = opacity;
    arrow.position.set(...b);
    arrow.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir));
    arrow.scale.setScalar(thick * 9);
    arrow.material.opacity = opacity;
  }

  return {
    group,
    /**
     * state: { candidate: {anchor, dir} | null, fit: {anchor, dir} | null, fan: [{dir}], fanAnchor,
     *          back: {from, dir, length} | null, opacity, camDist }
     */
    update(state) {
      const o = clamp(state.opacity ?? 1, 0, 1);
      group.visible = o > 0.001;
      if (!group.visible) return;
      const thick = clamp((state.camDist || 1500) * 0.0012, 0.05, 40);
      candidate.visible = candArrow.visible = anchorDot.visible = Boolean(state.candidate);
      if (state.candidate) {
        drawTrack(candidate, candArrow, state.candidate.anchor, state.candidate.dir, thick, 0.85 * o);
        anchorDot.position.set(...state.candidate.anchor);
        anchorDot.scale.setScalar(thick * 3.2);
        anchorDot.material.opacity = 0.8 * o;
      }
      fit.visible = fitArrow.visible = Boolean(state.fit);
      if (state.fit) drawTrack(fit, fitArrow, state.fit.anchor, state.fit.dir, thick * 1.1, 0.95 * o);
      const fanList = state.fan || [];
      fan.visible = fanList.length > 0;
      if (fan.visible) {
        const arr = fanGeo.attributes.position.array;
        fanList.slice(0, 80).forEach((r, i) => {
          arr.set(v3.addScaled(state.fanAnchor, r.dir, -HALF * 1.6), i * 6);
          arr.set(v3.addScaled(state.fanAnchor, r.dir, HALF * 1.6), i * 6 + 3);
        });
        fanGeo.attributes.position.needsUpdate = true;
        fanGeo.setDrawRange(0, Math.min(80, fanList.length) * 2);
        fan.material.opacity = 0.22 * o;
      }
      back.visible = Boolean(state.back);
      if (state.back) {
        const { from, dir, length } = state.back;
        place(back, from, v3.addScaled(from, dir, length), thick * 1.4);
        back.material.opacity = 0.65 * o;
      }
    },
  };
}
