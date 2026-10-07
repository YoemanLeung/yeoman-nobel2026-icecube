// Scale references for the "how big is a cubic kilometre" chapter. They exist only for comparison:
// each fades in for its zoom level and fades out again. The cube is a reference frame, not a wall.

import * as THREE from 'three';
import { catOutlineTexture, humanOutlineTexture } from './textures.js';
import { DEPTH_TOP, DEPTH_BOTTOM } from '../science/constants.js';

function billboard(texture, heightM, aspect = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  s.scale.set(heightM * aspect, heightM, 1);
  s.center.set(0.5, 0);
  return s;
}

// The Shanghai Tower (632 m, ledger F35), as a scale reference everyone can picture: its outer skin is a rounded
// triangle with a notch at one corner that turns about 120 degrees from base to top while it shrinks to about
// 55 % of its base width, in nine zones, under a sloping crown. Base width ~84 m (read off photographs).
const ST = { height: 632, baseR: 42, topScale: 0.55, twist: (120 * Math.PI) / 180, zones: 9, crown: 24 };
const ST_SEG = 72; // points round a floor plan

/** Radius of the floor plan at angle phi: a rounded triangle with a narrow notch at phi = 0. */
function stRadius(phi) {
  const notch = Math.exp(-((Math.atan2(Math.sin(phi), Math.cos(phi)) / 0.07) ** 2));
  return 1 + 0.085 * Math.cos(3 * phi) - 0.11 * notch;
}

/** A point of the skin at height h (m) and plan angle phi; the crown's top edge slopes towards phi = pi. */
function stPoint(h, phi) {
  const f = h / ST.height;
  const r = ST.baseR * ST.topScale ** f * stRadius(phi);
  const a = phi + ST.twist * f;
  return [r * Math.cos(a), h, r * Math.sin(a)];
}

const crownTop = (phi) => ST.height - ST.crown * 0.5 * (1 + Math.cos(phi));

function shanghaiTower() {
  const v = [];
  const ring = (hAt) => {
    for (let i = 0; i < ST_SEG; i++) {
      const p0 = (i / ST_SEG) * Math.PI * 2;
      const p1 = ((i + 1) / ST_SEG) * Math.PI * 2;
      v.push(...stPoint(hAt(p0), p0), ...stPoint(hAt(p1), p1));
    }
  };
  // zone floors, the base and the crown's sloping top edge
  for (let k = 0; k < ST.zones; k++) ring(() => (ST.height - ST.crown) * (k / ST.zones));
  ring(() => ST.height - ST.crown);
  ring(crownTop);
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: 0xffd666, dashSize: 12, gapSize: 7, transparent: true }));
  lines.computeLineDistances();
  // the corners (and both lips of the notch) running up the twist, solid so the turn reads at a distance
  const e = [];
  [0.09, -0.09, (2 * Math.PI) / 3, (4 * Math.PI) / 3].forEach((phi) => {
    const top = crownTop(phi);
    for (let j = 0; j < 40; j++) e.push(...stPoint((top * j) / 40, phi), ...stPoint((top * (j + 1)) / 40, phi));
  });
  const edges = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(e, 3)),
    new THREE.LineBasicMaterial({ color: 0xffd666, transparent: true }),
  );

  // a faint glassy skin so the silhouette reads as a building
  const rows = 48;
  const pos = [];
  const index = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= ST_SEG; i++) {
      const phi = (i / ST_SEG) * Math.PI * 2;
      pos.push(...stPoint((crownTop(phi) * j) / rows, phi));
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < ST_SEG; i++) {
      const a = j * (ST_SEG + 1) + i;
      const b = a + ST_SEG + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const skinGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skinGeo.setIndex(index);
  const skin = new THREE.Mesh(
    skinGeo,
    new THREE.MeshBasicMaterial({ color: 0xffd666, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  return { lines, edges, skin };
}

function bracket(a, b, tick) {
  const geo = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...a, ...b, ...a, a[0], a[1] + tick, a[2], ...b, b[0], b[1] + tick, b[2]], 3),
  );
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd666, transparent: true }));
}

export function createScaleView(scene, array, closeDom) {
  const group = new THREE.Group();
  const dom = array.doms[closeDom];
  const [x, y, z] = dom.pos;

  const cat = billboard(catOutlineTexture(), 0.3);
  cat.position.set(x - 0.48, y - 0.17, z + 0.05);
  const human = billboard(humanOutlineTexture(), 1.75, 0.5);
  human.position.set(x - 2.6, y - 1.2, z + 0.4);

  // vertical spacing bracket between two DOMs on the close string (~17 m)
  const below = array.doms[closeDom + 1];
  const vBracket = bracket([x + 3, y, z], [x + 3, below.pos[1], z], 0);
  vBracket.geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x + 3, y, z, x + 3, below.pos[1], z, x + 1.6, y, z, x + 4.4, y, z, x + 1.6, below.pos[1], z, x + 4.4, below.pos[1], z], 3),
  );

  // horizontal bracket to the nearest standard neighbour string (~125 m)
  const home = array.strings.find((s) => s.id === dom.string);
  const neighbour = array.strings
    .filter((s) => !s.deepcore && s.id !== home.id)
    .reduce((best, s) => (Math.hypot(s.x - home.x, s.z - home.z) < Math.hypot(best.x - home.x, best.z - home.z) ? s : best));
  const hy = y - 40;
  const hBracket = bracket([home.x, hy, home.z], [neighbour.x, hy, neighbour.z], 12);

  // 100 m bar, the Shanghai Tower standing beside the array, the 1 km reference cube
  const barY = -DEPTH_BOTTOM - 40;
  const barX = -array.radius;
  const bar = bracket([barX, barY, array.radius * 0.7], [barX + 100, barY, array.radius * 0.7], 18);
  // on the far side from where the pull-back starts, so it stays on the right of the frame, clear of Yeoman
  const towerAt = [-0.72 * (array.radius + 200), -DEPTH_BOTTOM, -0.7 * (array.radius + 200)];
  const { lines: tower, edges: towerEdges, skin: towerSkin } = shanghaiTower();
  [tower, towerEdges, towerSkin].forEach((o) => o.position.set(...towerAt));
  const cube = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1000, 1000, 1000)),
    new THREE.LineDashedMaterial({ color: 0xffd666, dashSize: 30, gapSize: 22, transparent: true }),
  );
  cube.computeLineDistances();
  cube.position.set(0, -(DEPTH_TOP + DEPTH_BOTTOM) / 2, 0);

  group.add(cat, human, vBracket, hBracket, bar, tower, towerEdges, towerSkin, cube);
  scene.add(group);

  const items = { cat, human, vBracket, hBracket, bar, tower, cube };
  const setOpacity = (obj, a) => {
    obj.visible = a > 0.01;
    obj.material.opacity = a;
  };

  return {
    group,
    anchors: {
      cat: [x - 0.48, y + 0.2, z + 0.05],
      human: [x - 2.6, y + 0.7, z + 0.4],
      vBracket: [x + 4.6, (y + below.pos[1]) / 2, z],
      hBracket: [(home.x + neighbour.x) / 2, hy + 18, (home.z + neighbour.z) / 2],
      bar: [barX + 50, barY - 30, array.radius * 0.7],
      tower: [towerAt[0], towerAt[1] + ST.height + 60, towerAt[2]],
      cube: [500, -DEPTH_TOP + 40, 500],
    },
    /** opacities: {cat, human, vBracket, hBracket, bar, tower, cube} in [0, 1] */
    update(opacities) {
      Object.entries(items).forEach(([k, obj]) => setOpacity(obj, opacities[k] || 0));
      setOpacity(towerEdges, opacities.tower || 0);
      setOpacity(towerSkin, 0.16 * (opacities.tower || 0));
    },
  };
}
