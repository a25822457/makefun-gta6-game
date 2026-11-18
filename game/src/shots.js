// Sol Bay: staged scenes behind ?shot=start|chase|mission|city&seed=1.
// Each scene builds the real world from the seed, plays it forward a fixed
// number of steps at a fixed dt, then freezes — so the same seed always gives
// the same frame. The main loop renders the frozen frame.
import { CONFIG } from './config.js';

/** Hold W (drive forward) while the staging sim runs: the pilot for shots. */
function holdDrive(game, on) {
  const input = game.input;
  if (!input._shotDrive) {
    input._shotDrive = input.isDown.bind(input);
    input.isDown = (code) => (on && code === CONFIG.keys.forward) || input._shotDrive(code);
  }
  if (!on) input.isDown = input._shotDrive;
}

function placePlayerInCar(game, type, x, z, heading) {
  const car = game.vehicles.spawnCar(type, x, z, heading);
  car.driver = 'player';
  game.player.enterVehicle(car);
  return car;
}

/**
 * Stage the named scene and return the screen to show over it. Any other name
 * is the start scene. Runs only in shot mode, before the loop freezes.
 */
/** Remove traffic cars in the driving corridor ahead of (x, z0) down to z1. */
function clearCorridor(game, x, z0, z1, halfWidth) {
  const traffic = game.traffic;
  if (!traffic || !traffic.cars) return;
  const keep = [];
  for (const entry of traffic.cars) {
    const c = entry.car.position;
    const inLane = Math.abs(c.x - x) < halfWidth && c.z <= z0 + 10 && c.z >= z1;
    if (inLane) traffic._removeCarEntry(entry);
    else keep.push(entry);
  }
  traffic.cars = keep;
}

/** Remove traffic cars within `radius` m of the player (staging only). */
function clearTrafficNear(game, radius) {
  const traffic = game.traffic;
  if (!traffic || !traffic.cars) return;
  const p = game.player.position;
  const keep = [];
  for (const entry of traffic.cars) {
    const d = Math.hypot(entry.car.position.x - p.x, entry.car.position.z - p.z);
    if (d < radius) traffic._removeCarEntry(entry);
    else keep.push(entry);
  }
  traffic.cars = keep;
}

/** Teleport a police entry (car state + mesh) to a spot, facing `heading`. */
function placeCruiser(entry, x, z, heading) {
  const car = entry.car;
  car.position.set(x, 0, z);
  car.heading = heading;
  car.speed = 0;
  if (car.group) {
    car.group.position.set(x, 0, z);
    car.group.rotation.y = heading;
  }
  entry.targetNode = null;
  entry.speed = 0;
}

/**
 * Frame the chase for the cover: cruisers ahead and alongside, none glued
 * to the player (a cruiser ramming the player pins the car to ~7 km/h and
 * sits between the chase camera and the player). The frozen frame renders
 * right after, so the placed cruisers stay exactly where they are put.
 */
function frameChase(game) {
  const p = game.player.position;
  const h = game.player.heading;
  const fx = -Math.sin(h), fz = -Math.cos(h); // forward
  const rx = Math.cos(h), rz = -Math.sin(h); // right
  const cruisers = (game.police && game.police.cars) || [];
  const spots = [
    { dx: -rx * 4 + fx * 30, dz: -rz * 4 + fz * 30, face: 'player' }, // roadblock ahead
    { dx: rx * 5.5 + fx * 5, dz: rz * 5.5 + fz * 5, face: 'forward' }, // alongside, in pursuit
    { dx: fx * 60, dz: fz * 60, face: 'player' }, // distant roadblock
  ];
  cruisers.forEach((entry, i) => {
    const spot = spots[i % spots.length];
    const x = p.x + spot.dx;
    const z = p.z + spot.dz;
    const heading = spot.face === 'player'
      ? Math.atan2(-(p.x - x), -(p.z - z))
      : h;
    placeCruiser(entry, x, z, heading);
  });
}

export function stageShot(name, game) {
  const step = CONFIG.shotStep;
  const state = game.state;
  const missions = game.missions;
  const spawn = game.city.spawnPoints;

  if (name === 'chase') {
    // Cover: a police chase down the main avenue, HUD and minimap live.
    state.started = true;
    game.menus.hide();
    const avenue = spawn.cars[0] || { x: 0, z: 0, heading: 0 };
    placePlayerInCar(game, 'sports', avenue.x, avenue.z, avenue.heading);
    clearTrafficNear(game, 35);
    clearCorridor(game, avenue.x, avenue.z, avenue.z - 170, 12);
    game.police.reportCrime(3);
    state.missionObjective = 'Lose the cops — reach the hideout';
    game.hud.setObjective('Lose the cops — reach the hideout');
    game.hud.toast('3 stars — the whole bay is looking for you.');
    holdDrive(game, true);
    game.updateSteps(75, step); // 2.5 s of chase: fast, before cruisers catch up
    holdDrive(game, false);
    // Make sure the frame has its three cruisers even if the short sim
    // spawned fewer, then put them where the camera can see them.
    while (game.police.cars.length < 3) {
      if (!game.police._spawnPoliceCar(game.player.position)) break;
    }
    frameChase(game);
    clearTrafficNear(game, 20);
    return;
  }

  if (name === 'mission') {
    // On foot at Pier 9, mid-shootout, mission 3 active.
    state.started = true;
    game.menus.hide();
    const m3 = spawn.missions.m3 || { x: 0, z: 0 };
    game.player.position.set(m3.x, 0, m3.z + 14);
    game.player.heading = 0;
    game.player.cameraYaw = 0;
    state.player.armed = true;
    missions.start('m3');
    game.hud.setObjective('Clear the pier warehouse — grab the package');
    holdDrive(game, false);
    game.updateSteps(90, step); // 3 s of shootout
    return;
  }

  if (name === 'city') {
    // High aerial of downtown and the beach at sunset, HUD kept quiet.
    state.started = true;
    game.menus.hide();
    game.hud.setObjective('');
    game.updateSteps(30, step); // let traffic settle for a moment
    const half = game.city.bounds.maxX;
    game.camera.position.set(half * 0.5, 250, half * 0.6);
    game.camera.lookAt(0, 0, -half * 0.15);
    return;
  }

  // Default: the start scene — title screen over downtown at dusk.
  game.updateSteps(60, step); // 2 s of city life behind the title
  const half = game.city.bounds.maxX;
  game.camera.position.set(-half * 0.35, 55, half * 0.7);
  game.camera.lookAt(0, 10, 0);
  game.menus.showTitle(game.save.exists());
}
