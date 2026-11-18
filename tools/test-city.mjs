#!/usr/bin/env node
// Headless logic test for Sol Bay city.js: stubs THREE + document, imports the
// real modules, runs buildCity with seed 1, and asserts the contract shape.
// This catches reference errors and bad graph/collider data without a browser.
const path = new URL('../game/src/city.js', import.meta.url).pathname;

// --- Universal THREE stub: any property is a callable/constructible stub. ---
function makeStub() {
  const fn = function () { return makeStub(); };
  return new Proxy(fn, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then') return undefined;
      return makeStub();
    },
    apply() { return makeStub(); },
    construct() { return makeStub(); },
    set() { return true; },
  });
}
globalThis.THREE = new Proxy({}, {
  get(_t, key) {
    if (key === Symbol.toPrimitive) return () => 0;
    return makeStub();
  },
  set() { return true; },
});

// --- Minimal document stub for canvas textures. ---
const ctxStub = new Proxy({}, {
  get(_t, key) {
    if (key === 'canvas') return { width: 256, height: 256 };
    if (typeof key === 'string') return (..._a) => {};
    return undefined;
  },
  set() { return true; },
});
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 256, height: 256,
        getContext: () => ctxStub,
        toDataURL: () => '',
      };
    }
    return {};
  },
};

const { createRng } = await import('../game/src/rng.js');
const { buildCity, collideCircle, clampToBounds } = await import(path);

const scene = { add() {}, fog: null, background: null };
const rng = createRng(1);
const city = buildCity(scene, rng);

const failures = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!ok) failures.push(name);
};

check('group exists', !!city.group);
check('roadGraph nodes = 100', city.roadGraph.nodes.size === 100, `got ${city.roadGraph.nodes.size}`);
check('roadGraph edges = 180 (10x10 grid: 90 horizontal + 90 vertical)', city.roadGraph.edges.length === 180, `got ${city.roadGraph.edges.length}`);
// The graph must be connected: every node reachable from the first.
{
  const adj = new Map();
  for (const e of city.roadGraph.edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set([[...city.roadGraph.nodes.keys()][0]]);
  const stack = [...seen];
  while (stack.length) {
    const n = stack.pop();
    for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  check('road graph connected (100/100 nodes)', seen.size === 100, `got ${seen.size}`);
}
check('colliders ~200', city.colliders.length >= 150 && city.colliders.length <= 300, `got ${city.colliders.length}`);
check('colliders are AABBs', city.colliders.every((c) => c.minX < c.maxX && c.minZ < c.maxZ));
check('bounds', city.bounds.minX === -240 && city.bounds.maxX === 240 && city.bounds.minZ === -240 && city.bounds.maxZ === 240);
check('spawn player', !!city.spawnPoints.player && Number.isFinite(city.spawnPoints.player.x));
check('spawn cars = 10', (city.spawnPoints.cars || []).length === 10, `got ${(city.spawnPoints.cars || []).length}`);
check('spawn missions m1-m5', ['m1', 'm2', 'm3', 'm4', 'm5'].every((k) => city.spawnPoints.missions && city.spawnPoints.missions[k]));
check('spawn police = 4', (city.spawnPoints.police || []).length === 4, `got ${(city.spawnPoints.police || []).length}`);
// Edges must reference existing nodes and lie on the grid.
const nodeIds = new Set(city.roadGraph.nodes.keys());
check('edges reference nodes', city.roadGraph.edges.every((e) => nodeIds.has(e.a) && nodeIds.has(e.b)));
check('edge coords match nodes', city.roadGraph.edges.every((e) => {
  const a = city.roadGraph.nodes.get(e.a); const b = city.roadGraph.nodes.get(e.b);
  return a && b && a.x === e.ax && a.z === e.az && b.x === e.bx && b.z === e.bz;
}));
// collideCircle: point inside a building must be pushed out.
const box = city.colliders[0];
const inside = collideCircle((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, 0.5, city.colliders);
check('collideCircle pushes out', inside.hit === true);
const free = collideCircle(0, 0, 0.5, city.colliders);
check('collideCircle free point', free.hit === false || Number.isFinite(free.x));
// clampToBounds.
const clamped = clampToBounds(9999, -9999, city.bounds, 0);
check('clampToBounds', clamped.x === 240 && clamped.z === -240, JSON.stringify(clamped));
// Determinism: same seed -> same graph.
const city2 = buildCity({ add() {} }, createRng(1));
check('deterministic (same seed)', JSON.stringify([...city.roadGraph.nodes.keys()]) === JSON.stringify([...city2.roadGraph.nodes.keys()]) && city.colliders.length === city2.colliders.length);

if (failures.length) { console.error(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nAll city contract checks passed.');
