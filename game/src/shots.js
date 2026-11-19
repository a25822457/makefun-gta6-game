// Sol Bay: staged scenes behind ?shot=start|chase|mission|city&seed=1.
// Each scene builds the real world from the seed, plays it forward a fixed
// number of steps at a fixed dt, then freezes — so the same seed always gives
// the same frame. The main loop renders the frozen frame.
//
// These are directed shots, not candid gameplay: every frame is composed
// like a poster — a low close camera, the action filling the frame, and a
// line of dialogue or a toast that tells the story. The scenes are Sol
// Bay's own moments (the marina chase, Pier 9, the beachfront), staged
// with Sol Bay's own cars, characters and places.
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

/** A soft grey smoke puff, frozen in the frame (staging only). */
function addSmokePuff(game, x, y, z, scale, opacity) {
  if (!game.scene || typeof THREE === 'undefined') return null;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity, depthWrite: false }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(scale);
  game.scene.add(mesh);
  return mesh;
}

/** A frozen explosion: hot core, orange glow, smoke rising (staging only). */
function addFireball(game, x, y, z) {
  if (!game.scene || typeof THREE === 'undefined') return;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffdd66 }),
  );
  core.position.set(x, y + 1.2, z);
  game.scene.add(core);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.set(x, y + 1.2, z);
  game.scene.add(glow);
  addSmokePuff(game, x, y + 3.5, z, 2.2, 0.5);
  addSmokePuff(game, x + 1.2, y + 4.8, z + 0.5, 1.7, 0.4);
  addSmokePuff(game, x - 1, y + 5.8, z - 0.5, 1.4, 0.35);
}

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

/**
 * The cover camera: low, close, and tilted a touch. The default follow
 * camera sits high and far, which leaves the bottom two thirds of the frame
 * as empty black road. This one crouches behind the car — the car fills the
 * lower frame, the roadblock and the helicopter read above it — and rolls a
 * few degrees so the chase feels off-balance.
 */
function frameCoverCamera(game) {
  const p = game.player.position;
  const h = game.player.heading;
  const fx = -Math.sin(h), fz = -Math.cos(h); // forward
  const rx = Math.cos(h), rz = -Math.sin(h); // right
  const cam = game.camera;
  // Behind the car, low, slightly to the right so the car sits left of centre.
  cam.position.set(
    p.x - fx * 7.5 + rx * 2.2,
    2.3,
    p.z - fz * 7.5 + rz * 2.2,
  );
  cam.lookAt(p.x + fx * 10, 1.4, p.z + fz * 10);
  cam.rotateZ(0.06); // a slight Dutch tilt — the chase is off-balance
}

/**
 * Stage the named scene and return the screen to show over it. Any other name
 * is the start scene. Runs only in shot mode, before the loop freezes.
 */
export function stageShot(name, game) {
  const step = CONFIG.shotStep;
  const state = game.state;
  const missions = game.missions;
  const spawn = game.city.spawnPoints;

  if (name === 'chase') {
    // Cover: a police chase down the main avenue, HUD and minimap live.
    // The Bay Patrol helicopter is overhead, two cruisers are on the tail,
    // and a roadblock waits ahead — the whole bay is looking for Rook.
    state.started = true;
    game.menus.hide();
    const avenue = spawn.cars[0] || { x: 0, z: 0, heading: 0 };
    placePlayerInCar(game, 'sports', avenue.x, avenue.z, avenue.heading);
    clearTrafficNear(game, 35);
    clearCorridor(game, avenue.x, avenue.z, avenue.z - 170, 12);
    game.police.reportCrime(3);
    state.missionObjective = 'Lose the cops — reach the hideout';
    game.hud.setObjective('Lose the cops — reach the hideout');
    game.hud.toastSticky('BAY PATROL overhead — 3 stars and climbing!');
    game.hud.dialogueSticky('Delia', 'Rook, the whole bay is looking for you. Don\'t stop!');
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
    // The Bay Patrol chopper, at its natural scale, high and ahead so it
    // reads in the sky above the roadblock — not blown up, not the star.
    // Height 20, nearly over the road centre: at 16 and 14 m to the side it
    // sat behind the roadside towers and never read in the frame.
    if (game.helicopter) {
      const p = game.player.position;
      const h = game.player.heading;
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      game.helicopter.placeForShot(
        p.x + fx * 30 + rx * 4,
        p.z + fz * 30 + rz * 4,
        20,
      );
    }
    // Tire smoke off the rear wheels — the car is sliding, not cruising.
    // Small, faint wisps: the camera sits only ~5 m behind the car, so
    // full-size puffs read as a fog bank and swallow the car.
    {
      const p = game.player.position;
      const h = game.player.heading;
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      for (const side of [-1, 1]) {
        const bx = p.x - fx * 2.2 + rx * side * 0.9;
        const bz = p.z - fz * 2.2 + rz * side * 0.9;
        addSmokePuff(game, bx, 0.5, bz, 0.7, 0.3);
        addSmokePuff(game, bx - fx * 1.2, 0.8, bz - fz * 1.2, 0.9, 0.22);
      }
    }
    frameCoverCamera(game);
    return;
  }

  if (name === 'mission') {
    // On foot at Pier 9, mid-shootout — the finale (m8), six Breakers
    // holding the pier, a van going up in flames. The player and the
    // Breakers trade tracers; Delia talks Rook through it.
    state.started = true;
    game.menus.hide();
    const m8 = spawn.missions.m8 || spawn.missions.m3 || { x: 0, z: 0 };
    game.player.position.set(m8.x, 0, m8.z + 14);
    game.player.heading = 0;
    game.player.cameraYaw = 0;
    state.player.armed = true;
    missions.start('m8');
    game.hud.setObjective('Take back Pier 9 — clear the Breakers');
    game.hud.dialogueSticky('Delia', 'Take the pier back, Rook. All of it.');
    holdDrive(game, false);
    game.updateSteps(90, step); // 3 s of shootout
    // A Breaker van catches fire beside the warehouse — the explosion the
    // shootout builds to, frozen mid-blast.
    {
      const p = game.player.position;
      addFireball(game, p.x + 8, 0, p.z - 6);
    }
    // Reframe to a fixed three-quarter angle from the north: the follow
    // camera sits right behind the player staring at the marker beacon, so
    // the beacon fills the centre of the frame, and a camera south of the
    // player puts a big empty beach in the foreground. From the north the
    // player and the Breakers read clearly, the beacon sits off to one
    // side, and the pier and water are the backdrop. The sim is frozen
    // after this, so the camera stays where it is put.
    const p = game.player.position;
    game.camera.position.set(p.x - 6, 4.5, p.z - 11);
    game.camera.lookAt(p.x, 1.5, p.z + 1);
    return;
  }

  if (name === 'city') {
    // A low aerial over the beachfront at dusk: downtown in the foreground,
    // the beach and a blue band of water beyond it. Close enough that the
    // traffic, the pedestrians and a patrol cruiser read in the frame —
    // a city that is awake, not a beige grid from directly above.
    state.started = true;
    game.menus.hide();
    game.hud.setObjective('');
    game.hud.toastSticky('Sol Bay — the whole city is awake.');
    game.updateSteps(30, step); // let traffic settle for a moment
    // Put a patrol cruiser on the beachfront road so the frame has a
    // police presence, not just traffic.
    if (game.police) {
      game.police.reportCrime(1);
      game.updateSteps(30, step);
      const cruisers = game.police.cars || [];
      if (cruisers.length > 0) {
        placeCruiser(cruisers[0], 50, 154, Math.PI / 2);
      }
    }
    game.camera.position.set(-40, 70, -40);
    game.camera.lookAt(20, 0, 140);
    return;
  }

  // Default: the start scene — title screen over downtown at dusk.
  game.updateSteps(60, step); // 2 s of city life behind the title
  const half = game.city.bounds.maxX;
  game.camera.position.set(-half * 0.35, 55, half * 0.7);
  game.camera.lookAt(0, 10, 0);
  game.menus.showTitle(game.save.exists());
}
