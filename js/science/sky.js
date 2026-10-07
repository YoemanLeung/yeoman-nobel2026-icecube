// Sky geometry for the last chapter.
//
// At the geographic South Pole the horizon IS the celestial equator, so the alt-az grid and the
// equatorial grid coincide: declination = zenith - 90 deg, and right ascension follows azimuth
// up to an offset that turns with the Earth (one sidereal day per turn). The teaching event fixes
// that offset so its true arrival direction falls on IceCube-170922A's best-fit position; the UI
// says so. Coordinates are J2000 degrees.

import { DEG } from '../core/math.js';

// IceCube-170922A best fit and 90% containment (IceCube et al. 2018, Science 361, eaat1378).
export const IC170922A = Object.freeze({
  name: 'IceCube-170922A',
  date: '2017-09-22',
  ra: 77.43,
  dec: 5.72,
  raMinus: 0.65,
  raPlus: 0.95,
  decMinus: 0.3,
  decPlus: 0.5,
});

// The blazar inside that region.
export const TXS0506 = Object.freeze({ name: 'TXS 0506+056', ra: 77.3582, dec: 5.6931, z: 0.3365 });

// Bright stars of Orion for orientation (J2000, rounded).
export const ORION = Object.freeze({
  stars: {
    betelgeuse: { ra: 88.793, dec: 7.407, mag: 0.5 },
    bellatrix: { ra: 81.283, dec: 6.35, mag: 1.6 },
    meissa: { ra: 83.784, dec: 9.934, mag: 3.4 },
    mintaka: { ra: 83.002, dec: -0.299, mag: 2.2 },
    alnilam: { ra: 84.053, dec: -1.202, mag: 1.7 },
    alnitak: { ra: 85.19, dec: -1.943, mag: 1.8 },
    saiph: { ra: 86.939, dec: -9.67, mag: 2.1 },
    rigel: { ra: 78.634, dec: -8.202, mag: 0.1 },
  },
  lines: [
    ['meissa', 'betelgeuse'],
    ['meissa', 'bellatrix'],
    ['betelgeuse', 'alnitak'],
    ['bellatrix', 'mintaka'],
    ['alnitak', 'alnilam'],
    ['alnilam', 'mintaka'],
    ['alnitak', 'saiph'],
    ['mintaka', 'rigel'],
  ],
});

/** A local <-> equatorial mapping for an observer at the South Pole with a fixed RA offset. */
export function makeSkyFrame(anchorZenith, anchorAzimuth, anchorRa) {
  const offset = anchorRa - anchorAzimuth / DEG;
  const wrap = (x) => ((x % 360) + 360) % 360;
  return {
    toEquatorial(zenith, azimuth) {
      return { ra: wrap(offset + azimuth / DEG), dec: zenith / DEG - 90 };
    },
    toLocal(ra, dec) {
      return { zenith: (dec + 90) * DEG, azimuth: wrap(ra - offset) * DEG };
    },
  };
}

/** Great-circle distance in degrees. */
export function skySeparation(a, b) {
  const d1 = a.dec * DEG;
  const d2 = b.dec * DEG;
  const dra = (a.ra - b.ra) * DEG;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}
