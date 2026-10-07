// Builds the two scenes (world in metres, cosmos in arbitrary units) with every view, and applies a
// chapter state to them each frame.

import * as THREE from 'three';
import { createStage } from '../scene/stage.js';
import { createSurface } from '../scene/surface.js';
import { createIce } from '../scene/ice.js';
import { createArrayView } from '../scene/arrayView.js';
import { createEventView } from '../scene/eventView.js';
import { createRecoView } from '../scene/recoView.js';
import { createScaleView } from '../scene/scaleView.js';
import { createCelestial } from '../scene/celestial.js';
import { createCosmos, COSMOS_LAYOUT } from '../scene/cosmos.js';
import { buildIceTop } from '../science/geometry.js';
import { firstPulsePerDom, cleanPulses } from '../science/event.js';
import { DUST_LAYER, ICE_THICKNESS, DEPTH_BOTTOM } from '../science/constants.js';
import { timeColor, clamp, quantile, lerp } from '../core/math.js';
import { createStream } from '../core/rng.js';

function diagramStars() {
  const rng = createStream(9, 'diagram-stars');
  const n = 2600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set(rng.unitVector().map((x) => x * 38000), i * 3);
  const pts = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xbfd6ff, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  pts.frustumCulled = false;
  return pts;
}

export function createWorld(container, { array, frame, closeDom, descentAxis, tier }) {
  const stage = createStage(container, { tier });
  const world = new THREE.Scene();
  const surface = createSurface(world, { iceTop: buildIceTop(array), tier: stage.tier });
  const ice = createIce(world, array, { tier: stage.tier });
  const arrayView = createArrayView(world, array);
  const eventView = createEventView(world);
  const recoView = createRecoView(world);
  const scaleView = createScaleView(world, array, closeDom);
  const celestial = createCelestial(world, frame);
  const stars = diagramStars();
  world.add(stars);
  const cosmos = createCosmos();
  stage.addScene('world', world);
  stage.addScene('cosmos', cosmos.scene);
  ice.setAxis(descentAxis[0], descentAxis[1]);
  arrayView.setCloseup(closeDom);

  const fogUnder = new THREE.FogExp2(0x041322, 0.0003);
  let sizeMode = 1; // 1 = enlarged markers, 0 = true size (animated)
  let sizeTarget = 1;
  let timeRange = [0, 1];

  const anchors = {
    dust: [array.radius * 0.35, -(DUST_LAYER[0] + DUST_LAYER[1]) / 2, array.radius * 1.05], // across from the Shanghai Tower
    bedrock: [array.radius * 0.25, -ICE_THICKNESS + 30, array.radius * 1.1],
    ruler: ice.rulerAnchor,
    schematic: [array.radius * 0.55, -DEPTH_BOTTOM - 120, -array.radius * 0.7],
  };

  /** Load an event (and optional cleaning) into the record layer and the physics layer. */
  function setEvent(ev, { clean = false } = {}) {
    const pulses = clean ? cleanPulses(array, ev.pulses) : ev.pulses;
    const first = firstPulsePerDom(pulses);
    const sig = first.filter((p) => p.kind !== 'noise').map((p) => p.t).sort((a, b) => a - b);
    timeRange = sig.length ? [quantile(sig, 0.02), quantile(sig, 0.97)] : [0, 1];
    const [t0, t1] = timeRange;
    arrayView.setRecord(first, (pl) => timeColor(clamp((pl.t - t0) / (t1 - t0), 0, 1)));
    eventView.setEvent(ev);
    return first;
  }

  const resolution = () => [container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight];

  return {
    stage,
    world,
    surface,
    ice,
    arrayView,
    eventView,
    recoView,
    scaleView,
    celestial,
    cosmos,
    anchors,
    cosmosLayout: COSMOS_LAYOUT,
    setEvent,
    get timeRange() {
      return timeRange;
    },
    setSizeMode(enlarged) {
      sizeTarget = enlarged ? 1 : 0;
    },
    get sizeEnlarged() {
      return sizeTarget === 1;
    },
    setTier(name) {
      const t = stage.setTier(name);
      surface.setTier(t);
      return t;
    },
    /**
     * Apply a chapter state. `layers` = effective layer opacities, `game` = reco view or null,
     * `eventTime` = physical time to draw, `clock` = seconds since load (shimmer only).
     */
    apply(state, local, { layers, game, eventTime, clock, dt, reduced }) {
      stage.setScene(state.scene);
      if (state.keys) stage.setTourPose(stage.poseAt(state.keys, local));
      const cam = stage.camera;
      const dist = cam.position.distanceTo(stage.controls.target);
      const diagram = state.env.diagram;
      const res = resolution();
      const dpr = stage.renderer.getPixelRatio();
      stage.setBloom(state.scene === 'cosmos' ? 0.95 : 0.72);

      surface.update(cam, reduced ? 0 : clock, { aurora: state.env.aurora, dpr });
      if (diagram) {
        surface.group.visible = false;
        world.fog = null;
      }
      ice.update(cam, {
        strataBoost: state.env.strata,
        cutaway: clamp((dist - 500) / 1200, 0, 1),
        interior: 1 - clamp((dist - 900) / 1200, 0, 1),
        bubbles: reduced ? state.env.bubbles * 0.4 : state.env.bubbles,
        streak: reduced ? 0.6 : state.env.streak,
        rings: state.env.rings,
        upGlow: state.env.upGlow,
        burst: state.env.burst,
      });
      ice.group.visible = !diagram || cam.position.y < 0;
      if (diagram) ice.group.children[0].visible = false;
      if (cam.position.y <= 0 && !diagram) {
        fogUnder.density = 1 / (1.4 * (dist + 120));
        world.fog = fogUnder;
      }
      stars.visible = diagram;
      stage.renderer.setClearColor(diagram ? 0x02050b : 0x02070d, 1);

      sizeMode = lerp(sizeMode, sizeTarget, 1 - Math.exp(-6 * dt));
      const u = arrayView.uniforms;
      u.uTime.value = eventTime;
      u.uRecord.value = layers.record;
      u.uReco.value = layers.reco;
      u.uMode.value = sizeMode;
      u.uPixelScale.value = stage.pixelScale();
      u.uDpr.value = dpr;
      u.uIdleAlpha.value = state.array.idleAlpha * (0.55 + 0.45 * sizeMode);
      u.uFogDensity.value = world.fog === fogUnder ? fogUnder.density : 0.00002;
      arrayView.setModelVisible(state.array.model);
      arrayView.setRipples(state.array.ripples && layers.record > 0.5);
      const real = 1 - sizeMode;
      arrayView.setLines({
        width: lerp(state.array.lineWidth, 1.1, real),
        upperWidth: lerp(1.2, 0.9, real),
        opacity: state.array.lineAlpha,
        upperOpacity: state.array.upperAlpha ?? 0.45 + 0.25 * state.env.strata,
        w: res[0],
        h: res[1],
      });

      const evAnchors = eventView.update(eventTime, { physics: layers.physics, camDist: dist, showAngle: state.event.showAngle, resolution: res });

      recoView.update(
        game
          ? { candidate: game.candidate, fit: game.fit, fan: game.fan, fanAnchor: game.fanAnchor, back: game.back, opacity: layers.recoGeom, camDist: dist }
          : { opacity: 0 },
      );
      scaleView.update(state.scale || {});
      celestial.update(state.celestial);
      if (state.scene === 'cosmos') cosmos.update(clock, state.cosmos.vis, state.cosmos.nu, { warp: state.cosmos.warp, camera: cam, resolution: res, pixelScale: stage.pixelScale() });
      stage.frame(dt);
      return { evAnchors, dist };
    },
  };
}
