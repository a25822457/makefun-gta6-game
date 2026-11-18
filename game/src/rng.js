// Sol Bay: seeded random numbers. Every bit of world building draws from
// one of these generators, so the same seed always builds the same city.
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, a, b) {
  return a + rng() * (b - a);
}

export function pick(rng, arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

export function chance(rng, p) {
  return rng() < p;
}

/** Integer in [a, b] inclusive, drawn from the seeded generator. */
export function int(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}
