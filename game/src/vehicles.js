// Sol Bay: car factory + arcade car physics + enter/exit/steal support.
// Cars are boxes and cylinders only. One system owns every car in the world:
// the player's car, traffic cars and police cars alike. Traffic and police
// drivers set car.speed / car.heading themselves; this system integrates
// motion, spins the wheels, resolves collisions and syncs the meshes.
import { CONFIG } from './config.js';
import { collideCircle, clampToBounds } from './city.js';

// Body dimensions per type: [width, bodyHeight, length, cabinHeight].
const BODY = {
  sedan: [1.9, 0.62, 4.5, 0.55],
  taxi: [1.9, 0.62, 4.5, 0.55],
  sports: [2.0, 0.5, 4.3, 0.42],
  van: [2.0, 1.05, 4.9, 0.75],
  truck: [2.2, 1.1, 6.2, 0.8],
  police: [1.9, 0.62, 4.5, 0.55],
};

const WHEEL_R = 0.36;
const CAR_RADIUS = 2.3; // circle used for car-vs-car push-apart

function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.35,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  m.castShadow = true;
  return m;
}

/**
 * Build a low-poly car mesh from boxes/cylinders.
 * Returns the root group; useful parts are stashed on group.userData:
 * wheels (4 cylinder meshes, spin around local X), lightBar {red, blue}
 * on police cars (police.js flashes them via emissiveIntensity).
 * The car's front is -Z, so group.rotation.y === car.heading.
 */
export function buildCarMesh(type) {
  const t = CONFIG.cars[type] || CONFIG.cars.sedan;
  const [w, bh, len, ch] = BODY[type] || BODY.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: t.color, roughness: 0.35, metalness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bh, len), paint);
  body.position.y = 0.55 + bh / 2;
  body.castShadow = true;
  group.add(body);

  // Cabin: glassy box set slightly back from the nose.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.82, ch, len * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.15, metalness: 0.6 }),
  );
  cabin.position.set(0, 0.55 + bh + ch / 2 - 0.02, len * 0.08);
  cabin.castShadow = true;
  group.add(cabin);

  // Front bumper / grille strip and rear bumper.
  group.add(box(w * 0.96, 0.18, 0.12, 0x22252a, { y: 0.45, z: -len / 2 - 0.02 }));
  group.add(box(w * 0.96, 0.18, 0.12, 0x22252a, { y: 0.45, z: len / 2 + 0.02 }));

  // Headlights (white, emissive) and taillights (red, emissive).
  const lamp = (x, z, color) =>
    box(0.34, 0.14, 0.06, 0x111111, {
      x, y: 0.78, z, emissive: color, emissiveIntensity: 1.6,
    });
  group.add(lamp(-w / 2 + 0.32, -len / 2 - 0.04, 0xfff2c0));
  group.add(lamp(w / 2 - 0.32, -len / 2 - 0.04, 0xfff2c0));
  group.add(lamp(-w / 2 + 0.32, len / 2 + 0.04, 0xff2a22));
  group.add(lamp(w / 2 - 0.32, len / 2 + 0.04, 0xff2a22));

  // Taxi sign.
  if (type === 'taxi') {
    group.add(box(0.6, 0.16, 0.3, 0xf8f8f8, {
      y: 0.55 + bh + ch + 0.08, z: len * 0.05,
      emissive: 0xffd76a, emissiveIntensity: 0.7,
    }));
  }

  // Police light bar: red left, blue right. police.js flashes them.
  let lightBar = null;
  if (type === 'police') {
    const red = box(0.34, 0.12, 0.2, 0x330000, {
      x: -0.22, y: 0.55 + bh + ch + 0.06, z: len * 0.05,
      emissive: 0xff2020, emissiveIntensity: 0.2,
    });
    const blue = box(0.34, 0.12, 0.2, 0x000033, {
      x: 0.22, y: 0.55 + bh + ch + 0.06, z: len * 0.05,
      emissive: 0x2040ff, emissiveIntensity: 0.2,
    });
    group.add(red, blue);
    lightBar = { red, blue };
  }

  // Truck cargo bed instead of a cabin roofline already added: add side walls.
  if (type === 'truck') {
    group.add(box(w, 0.7, len * 0.45, t.color, { y: 0.55 + bh + 0.35, z: len * 0.22 }));
  }

  // Four wheels: cylinders spun 90 deg so the axle is along X.
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.28, 10);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.7 });
  const wheels = [];
  const wx = w / 2 - 0.05;
  const wz = len / 2 - 0.85;
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(tyre, hub);
    wheel.position.set(x, WHEEL_R, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  group.userData = { type, wheels, lightBar, wheelRadius: WHEEL_R };
  return group;
}

export class VehicleSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.cars = [];
    this._nextId = 1;
  }

  spawnCar(type, x, z, heading = 0) {
    const tuning = CONFIG.cars[type] || CONFIG.cars.sedan;
    const group = buildCarMesh(type);
    const car = {
      id: this._nextId++,
      type,
      mesh: group,
      group,
      position: new THREE.Vector3(x, 0, z),
      heading,
      speed: 0,
      steering: 0,
      driver: null,
      color: tuning.color,
      tuning,
    };
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    this.cars.push(car);
    return car;
  }

  nearestCar(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const dx = car.position.x - pos.x;
      const dz = car.position.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.group);
    car.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  /** Drive the player car from input; traffic/police cars just integrate. */
  update(dt) {
    const input = this.game.input;
    const keys = this.game.config ? this.game.config.keys : CONFIG.keys;
    const colliders = this.game.city ? this.game.city.colliders : [];
    const bounds = this.game.city ? this.game.city.bounds : null;
    let playerCar = null;

    for (const car of this.cars) {
      if (car.driver === 'player') {
        playerCar = car;
        this._drivePlayerCar(car, dt, input, keys);
      } else {
        // Traffic / police: drag gently, keep rolling along the heading.
        car.speed -= car.speed * 0.4 * dt;
        if (Math.abs(car.speed) < 0.05) car.speed = 0;
      }

      // Integrate motion. Heading 0 faces -Z (north).
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      car.position.x += fx * car.speed * dt;
      car.position.z += fz * car.speed * dt;

      // Building collision: circle vs AABB, then clamp to the city.
      if (colliders.length) {
        const preSpeed = car.speed;
        const hit = collideCircle(car.position.x, car.position.z, 1.3, colliders);
        if (hit.hit) {
          car.position.x = hit.x;
          car.position.z = hit.z;
          car.speed *= 0.45; // scrub speed off a wall scrape
          if (this.game.audio && Math.abs(preSpeed) > 8) this.game.audio.crash();
        }
      }
      if (bounds) {
        const c = clampToBounds(car.position.x, car.position.z, bounds, 2);
        car.position.x = c.x;
        car.position.z = c.z;
      }

      // Spin the wheels and sync the mesh.
      const spin = (car.speed * dt) / WHEEL_R;
      for (const wheel of car.group.userData.wheels) wheel.rotation.x += spin;
      car.group.position.copy(car.position);
      car.group.rotation.y = car.heading;
    }

    // Car-vs-car: simple circle push-apart + speed loss.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        const min = CAR_RADIUS * 2;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
          a.speed *= 0.8;
          b.speed *= 0.8;
        }
      }
    }

    // Engine audio follows the player's car only.
    if (this.game.audio) {
      if (playerCar) {
        const top = (playerCar.tuning.topSpeed / 3.6) || 1;
        this.game.audio.setEngine(
          Math.min(1, Math.abs(playerCar.speed) / top),
          Math.abs(playerCar.speed) > 0.5,
        );
      } else {
        this.game.audio.setEngine(0, false);
      }
    }
  }

  _drivePlayerCar(car, dt, input, keys) {
    const t = car.tuning;
    const top = t.topSpeed / 3.6; // km/h -> m/s
    const rev = t.reverseSpeed / 3.6;
    const handbrake = input.isDown(keys.handbrake);

    // Steering: target angle eases toward the input, scaled by speed so a
    // parked car cannot turn on the spot.
    const steerInput = (input.isDown(keys.left) ? 1 : 0) - (input.isDown(keys.right) ? 1 : 0);
    const speedFactor = Math.min(1, Math.abs(car.speed) / 8);
    const steerTarget = steerInput * t.steer * speedFactor;
    car.steering += (steerTarget - car.steering) * Math.min(1, 10 * dt);
    // Handbrake loosens the rear: sharper turn, less grip.
    const grip = handbrake ? t.grip * 0.45 : t.grip;
    car.heading += car.steering * (car.speed / 6) * grip * dt * 2.2;

    // Longitudinal: W accelerates, S brakes then reverses.
    if (input.isDown(keys.forward)) {
      car.speed += t.accel * dt;
    } else if (input.isDown(keys.back)) {
      if (car.speed > 0.5) car.speed -= t.accel * 1.6 * dt; // brake
      else car.speed -= t.accel * 0.7 * dt; // reverse
    } else {
      // Coast / rolling drag, stronger with the handbrake.
      const drag = handbrake ? 6 : 1.2;
      car.speed -= car.speed * drag * dt * 0.35;
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    if (handbrake) car.speed -= car.speed * 2.5 * dt;

    // Clamp to top / reverse speed.
    if (car.speed > top) car.speed = top;
    if (car.speed < -rev) car.speed = -rev;
  }

  reset() {
    for (const car of [...this.cars]) this.removeCar(car);
    this._nextId = 1;
  }
}
