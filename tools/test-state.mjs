// Round-6 unit checks: armour absorbs before health; district/street names.
// Pure modules only (state.js has no imports; city.js needs THREE for the
// city builder, so districtAt/streetAt are re-verified here via a stub).
import { createGameState, damagePlayer } from '../game/src/state.js';

let fails = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
  if (!ok) fails++;
}

// Armour absorbs first.
let s = createGameState();
s.health = 100; s.armor = 50;
damagePlayer(s, 30);
check('armor absorbs 30 of 50', { armor: s.armor, health: s.health }, { armor: 20, health: 100 });
damagePlayer(s, 40);
check('armor 20 then 20 to health', { armor: s.armor, health: s.health }, { armor: 0, health: 80 });
damagePlayer(s, 90);
check('lethal after armor gone', { armor: s.armor, health: s.health, end: s.endState }, { armor: 0, health: 0, end: 'wasted' });

// No armour: straight to health.
s = createGameState();
damagePlayer(s, 25);
check('no armor, health 75', { armor: s.armor, health: s.health }, { armor: 0, health: 75 });

// districtAt / streetAt: stub THREE so city.js can load (only the builder
// uses it; the name functions are pure).
globalThis.THREE = {
  CanvasTexture: class {},
  SRGBColorSpace: 1,
  PlaneGeometry: class {},
  MeshLambertMaterial: class {},
  Mesh: class {},
  Group: class { add() {} },
  CylinderGeometry: class {},
  MeshBasicMaterial: class {},
  CircleGeometry: class {},
  DoubleSide: 2,
  BoxGeometry: class {},
  Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  Color: class { constructor(h) { this.h = h; } },
  PCFSoftShadowMap: 1,
  ACESFilmicToneMapping: 1,
  Fog: class {},
  HemisphereLight: class {},
  DirectionalLight: class {},
  AmbientLight: class {},
  Scene: class { add() {} },
  PerspectiveCamera: class {},
  WebGLRenderer: class {},
};
const city = await import('../game/src/city.js');
check('pier 9', city.districtAt(-190, 238), 'Pier 9');
check('docks', city.districtAt(200, 0), 'The Docks');
check('beachfront', city.districtAt(0, 200), 'Beachfront');
check('uptown', city.districtAt(0, -200), 'Uptown');
check('downtown', city.districtAt(26, -26), 'Downtown');
check('palm drive', city.districtAt(-200, 0), 'Palm Drive');
check('old town', city.districtAt(-100, 100), 'Old Town');
check('bayfront ave', city.streetAt(0, 182), 'Bayfront Ave');
check('marina blvd', city.streetAt(-182, 0), 'Marina Blvd');
check('dockside rd', city.streetAt(182, 0), 'Dockside Rd');
check('uptown ave', city.streetAt(0, -182), 'Uptown Ave');
check('1st ave', city.streetAt(-234, 0), '1st Ave');
check('5th st', city.streetAt(0, -26), '5th St');

process.exit(fails ? 1 : 0);
