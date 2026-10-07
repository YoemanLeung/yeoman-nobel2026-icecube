// Physical constants and detector parameters used by the teaching model.
// Detector numbers describe the ORIGINAL 86-string IceCube in-ice array (completed 2010);
// the IceCube Upgrade strings installed in the 2025/26 season are not drawn.
// Sources are listed in ../../README.md (Science notes) and in the piece's facts ledger.

import { DEG } from '../core/math.js';

export const C_VACUUM = 0.299792458; // m / ns

// Optics of deep South Pole ice near 400 nm (teaching values).
export const N_PHASE = 1.319; // sets the Cherenkov angle (SPICE-Mie, 400 nm)
export const N_GROUP = 1.356; // sets how fast a light pulse travels (SPICE-Mie / JINST 2017)
export const THETA_C = Math.acos(1 / N_PHASE); // ~40.7 deg
export const C_ICE = C_VACUUM / N_GROUP; // ~0.221 m / ns

// Pandel time-residual model (AMANDA; Ahrens et al. 2004, NIM A 524, 169): the delay of a
// scattered photon after travelling distance d is Gamma(shape = d / lambda, rate = 1/tau + c_ice/lambdaA).
export const PANDEL = { lambda: 33.3, tau: 557, lambdaA: 98 };

// Original in-ice array (IceCube quick facts / detector pages).
export const N_STRINGS = 86;
export const DOMS_PER_STRING = 60;
export const N_DOMS = N_STRINGS * DOMS_PER_STRING; // 5,160
export const DEPTH_TOP = 1450; // m below the ice surface
export const DEPTH_BOTTOM = 2450;
export const STRING_SPACING = 125; // m, standard strings
export const DOM_SPACING = 17; // m, standard strings (1000 m / 59 gaps)
export const DOM_DIAMETER = 0.33; // m (13-inch glass sphere)
export const ICE_THICKNESS = 2820; // m at the South Pole, rounded
export const DUST_LAYER = [2000, 2100]; // m, main dust layer (higher scattering and absorption)

// DeepCore: denser strings in the clearest ice near the bottom centre.
export const DEEPCORE = {
  strings: 8,
  ringRadius: STRING_SPACING / Math.sqrt(3), // ~72 m, centroids of the lattice triangles
  innerRadius: 42,
  upper: { from: 1760, step: 10, count: 10 }, // above the dust layer
  lower: { from: 2107, step: 7, count: 50 }, // clear ice below the dust layer
};

export const DOM_NOISE_RATE_HZ = 560; // standard-DOM noise rate (JINST 12, P03012)

// The teaching event borrows the arrival direction of IceCube-170922A / TXS 0506+056:
// declination +5.7 deg, which at the South Pole is a zenith angle of 95.7 deg (5.7 deg below the horizon).
export const TEACHING_ZENITH = 95.69 * DEG;
export const TEACHING_AZIMUTH = 182 * DEG;
