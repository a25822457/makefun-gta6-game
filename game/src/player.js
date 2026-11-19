// Sol Bay: on-foot third-person controller + character mesh.
// Owns cameraYaw / cameraPitch (mouse orbits the camera when pointer
// locked); main.js positions the actual camera from these values. On foot
// the player walks, runs and jumps; in a car the mesh hides and the player
// tracks the car. E enters / steals / exits cars and starts missions.
import { CONFIG } from './config.js';
import { addWanted, healPlayer } from './state.js';
import { collideCircle, clampToBounds } from './city.js';

const GRAVITY = 22;
const MOUSE_SENS = 0.0025;
const TURN_RATE = 12; // rad/s the character turns toward its move direction

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Low-poly stylised figure. Front is -Z, so group.rotation.y === heading. */
function buildCharacterMesh() {
  const group = new THREE.Group();
  // Legs pivot at the hip (y = 0.62) so they swing while walking.
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.62, 0);
  legL.add(box(0.17, 0.62, 0.19, 0x2e3a4d, 0, -0.31, 0));
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.62, 0);
  legR.add(box(0.17, 0.62, 0.19, 0x2e3a4d, 0, -0.31, 0));
  // Arms pivot at the shoulder (y = 1.28).
  const armL = new THREE.Group();
  armL.position.set(-0.32, 1.28, 0);
  armL.add(box(0.14, 0.56, 0.16, 0x8a5a2e, 0, -0.28, 0));
  const armR = new THREE.Group();
  armR.position.set(0.32, 1.28, 0);
  armR.add(box(0.14, 0.56, 0.16, 0x8a5a2e, 0, -0.28, 0));
  // Torso: open jacket over a tee. Head with dark hair cap.
  const torso = box(0.52, 0.62, 0.3, 0x3d6b4f, 0, 0.95, 0);
  const tee = box(0.3, 0.5, 0.06, 0xe8e2d4, 0, 0.95, -0.16);
  const head = box(0.32, 0.34, 0.3, 0xd9a986, 0, 1.48, 0);
  const hair = box(0.34, 0.12, 0.32, 0x241a12, 0, 1.68, 0.01);
  const cap = box(0.36, 0.08, 0.36, 0xc22727, 0, 1.66, 0);
  group.add(legL, legR, armL, armR, torso, tee, head, hair, cap);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.state = game.state;

    const spawn = game.city && game.city.spawnPoints
      ? game.city.spawnPoints.player
      : null;
    this.position = new THREE.Vector3(
      spawn ? spawn.x : 0, 0, spawn ? spawn.z : 0,
    );
    this.heading = spawn ? spawn.heading || 0 : 0;
    this.speed = 0;
    this.onFoot = true;
    this.vehicle = null;
    this.cameraYaw = this.heading;
    this.cameraPitch = 0.25;

    this._vy = 0;
    this._grounded = true;
    this._walkPhase = 0;
    this._punchTimer = 0;

    this.mesh = buildCharacterMesh();
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    this.scene.add(this.mesh);
    this._syncState();
  }

  update(dt) {
    if (this.state && this.state.paused) return;
    const input = this.game.input;
    const keys = CONFIG.keys;

    // Mouse orbits the camera whenever the pointer is locked.
    if (input.pointerLocked) {
      this.cameraYaw -= input.mouseDX * MOUSE_SENS;
      this.cameraPitch -= input.mouseDY * MOUSE_SENS;
      this.cameraPitch = Math.max(-1.1, Math.min(1.1, this.cameraPitch));
    }

    // Health regen: after regenDelay seconds without taking damage, health
    // recovers at regenRate per second (configured in config.js; the values
    // were there but nothing ever used them, so m3 was a one-way drain).
    if (this.state && this.state.health > 0 && this.state.health < 100
      && this.state.time - (this.state.lastDamageAt ?? -Infinity) >= CONFIG.player.regenDelay) {
      healPlayer(this.state, CONFIG.player.regenRate * dt);
    }

    if (this.onFoot) this._updateOnFoot(dt, input, keys);
    else this._updateDriving(dt, input, keys);

    // Radio: R cycles the Sol Bay stations, M toggles the radio on/off.
    // Works on foot and in the car.
    if (input.wasPressed(keys.radio) && this.game.audio) {
      this.game.audio.nextStation();
    }
    if (input.wasPressed(keys.mute) && this.game.audio) {
      this.game.audio.toggleMusic();
    }

    this._syncState();
  }

  _updateOnFoot(dt, input, keys) {
    // Move relative to the camera yaw. Heading 0 faces -Z (north).
    const fx = -Math.sin(this.cameraYaw);
    const fz = -Math.cos(this.cameraYaw);
    const rx = Math.cos(this.cameraYaw);
    const rz = -Math.sin(this.cameraYaw);
    const fwd = (input.isDown(keys.forward) ? 1 : 0) - (input.isDown(keys.back) ? 1 : 0);
    const strafe = (input.isDown(keys.right) ? 1 : 0) - (input.isDown(keys.left) ? 1 : 0);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0) {
      mx /= mLen;
      mz /= mLen;
    }

    const running = input.isDown(keys.run) || input.isDown('ShiftRight');
    const targetSpeed = mLen > 0
      ? (running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed)
      : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, 10 * dt);

    // Face the move direction, turning smoothly.
    if (mLen > 0) {
      const targetHeading = Math.atan2(-mx, -mz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const step = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
      this.heading += step;
    }

    this.position.x += mx * this.speed * dt;
    this.position.z += mz * this.speed * dt;

    // Jump: simple vertical velocity + gravity, land back on y = 0.
    if (input.wasPressed(keys.jump) && this._grounded) {
      this._vy = CONFIG.player.jumpSpeed;
      this._grounded = false;
    }
    if (!this._grounded) {
      this._vy -= GRAVITY * dt;
      this.position.y += this._vy * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this._vy = 0;
        this._grounded = true;
      }
    }

    // Building collision + city bounds, as a small circle.
    if (this.game.city) {
      const hit = collideCircle(
        this.position.x, this.position.z,
        CONFIG.player.radius, this.game.city.colliders,
      );
      if (hit.hit) {
        this.position.x = hit.x;
        this.position.z = hit.z;
      }
      if (this.game.city.bounds) {
        const c = clampToBounds(
          this.position.x, this.position.z, this.game.city.bounds, 1,
        );
        this.position.x = c.x;
        this.position.z = c.z;
      }
    }

    // Punch.
    if (input.wasPressed(keys.punch)) {
      this._punchTimer = 0.28;
      if (this.game.combat && typeof this.game.combat.punch === 'function') {
        this.game.combat.punch();
      }
    }
    if (this._punchTimer > 0) this._punchTimer -= dt;

    // Interact: a shop beats a mission marker beats a car. The gun shop is
    // the most specific thing here — if E preferred the car, a parked car
    // next to Harbor Arms would block the shop. A mission marker beats a car
    // for the same reason: the car you arrive in parks right next to the
    // marker, so if E preferred the car you could never start the mission.
    if (input.wasPressed(keys.interact)) {
      let started = false;
      if (this.game.shops && typeof this.game.shops.openGunShop === 'function') {
        started = this.game.shops.openGunShop();
      }
      if (!started && this.game.missions && typeof this.game.missions.tryStartAt === 'function') {
        started = this.game.missions.tryStartAt(this.position);
      }
      if (!started) {
        const car = this.game.vehicles
          ? this.game.vehicles.nearestCar(this.position, 3)
          : null;
        if (car) this.enterVehicle(car);
      }
    }

    // Walk / run animation: swinging limbs + bob.
    const parts = this.mesh.userData;
    const stride = this.speed > 0.5 ? this.speed / CONFIG.player.runSpeed : 0;
    this._walkPhase += dt * (4 + this.speed * 1.4);
    const swing = Math.sin(this._walkPhase) * 0.65 * stride;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8;
    parts.armR.rotation.x = swing * 0.8;
    if (this._punchTimer > 0) parts.armR.rotation.x = -1.5; // punch: right arm out
    const bob = Math.abs(Math.sin(this._walkPhase)) * 0.05 * stride;
    this.mesh.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
  }

  _updateDriving(dt, input, keys) {
    const car = this.vehicle;
    if (!car) {
      this.onFoot = true;
      return;
    }
    // The car system owns the driving physics; the player just rides along.
    this.position.copy(car.position);
    this.heading = car.heading;
    this.speed = Math.abs(car.speed);
    // Camera follows the car's heading when the mouse is idle; the player
    // can still orbit freely with the mouse while driving.
    this.mesh.visible = false;
    this.mesh.position.copy(this.position);

    if (input.wasPressed(keys.interact)) this.exitVehicle();
    // Rook's Garage: G opens the garage menu when parked near it.
    if (this.game.shops && typeof this.game.shops.openGarage === 'function') {
      const gk = (CONFIG.keys || {}).garage;
      if (gk && input.wasPressed(gk)) this.game.shops.openGarage();
    }
    if (input.wasPressed(keys.punch) && this.game.combat
      && typeof this.game.combat.punch === 'function') {
      this.game.combat.punch();
    }
  }

  enterVehicle(car) {
    if (!car || this.vehicle === car) return;
    // Stealing a crewed car is a crime; a parked (driverless) car is free.
    if (car.driver === 'traffic' || car.driver === 'police') {
      if (this.game.police && typeof this.game.police.reportCrime === 'function') {
        this.game.police.reportCrime(CONFIG.wanted.stealCrime);
      } else if (this.state) {
        addWanted(this.state, CONFIG.wanted.stealCrime);
      }
      if (this.state) this.state.stats.carsStolen += 1;
      if (this.game.hud) this.game.hud.toast('Car stolen — the cops noticed');
    }
    car.driver = 'player';
    this.vehicle = car;
    this.onFoot = false;
    this.position.copy(car.position);
    this.heading = car.heading;
    this.mesh.visible = false;
    this._syncState();
  }

  exitVehicle() {
    const car = this.vehicle;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    // Step out to the car's right side, clear of the body.
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    this.position.set(car.position.x + rx * 2, 0, car.position.z + rz * 2);
    this.heading = car.heading;
    this.vehicle = null;
    this.onFoot = true;
    this.speed = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    this._syncState();
  }

  _syncState() {
    if (!this.state) return;
    this.state.player.position = [this.position.x, this.position.y, this.position.z];
    this.state.player.heading = this.heading;
    this.state.player.onFoot = this.onFoot;
    this.state.player.vehicleId = this.vehicle ? this.vehicle.id : null;
    this.state.player.speed = this.speed;
  }

  reset() {
    if (this.vehicle) this.exitVehicle();
    const spawn = this.game.city && this.game.city.spawnPoints
      ? this.game.city.spawnPoints.player
      : null;
    this.position.set(spawn ? spawn.x : 0, 0, spawn ? spawn.z : 0);
    this.heading = spawn ? spawn.heading || 0 : 0;
    this.cameraYaw = this.heading;
    this.cameraPitch = 0.25;
    this.speed = 0;
    this._vy = 0;
    this._grounded = true;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    this._syncState();
  }
}
