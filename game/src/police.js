// Sol Bay: the wanted system — police pursuit, busts, and wanted decay.
// Stars live in game.state.wanted. Police cars spawn near the player by star
// count, chase the player (on foot or in a car), and flash their light bars.
// A foot cop steps out when a cruiser gets close, and the player is busted
// when a cop reaches a slow player on foot. When no police can see the player
// for a while, the heat cools off one star at a time.
import { CONFIG } from './config.js';
import { addWanted } from './state.js';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

const COP_SHIRT = 0x1d3a5f;
const COP_PANTS = 0x14181d;
const COP_SKIN = 0xc98e5f;

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.cops = [];
    this._decayTimer = 0;
    this._flashPhase = 0;
    this._sirenOn = false;
    this.group = new THREE.Group();
    this.group.name = 'police';
    if (game.scene) game.scene.add(this.group);

    // Shared foot-cop parts.
    this._copBodyGeo = new THREE.BoxGeometry(0.46, 0.9, 0.28);
    this._copHeadGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this._copLegGeo = new THREE.BoxGeometry(0.17, 0.5, 0.17);
    this._copHatGeo = new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10);
    this._copBodyMat = new THREE.MeshLambertMaterial({ color: COP_SHIRT });
    this._copPantsMat = new THREE.MeshLambertMaterial({ color: COP_PANTS });
    this._copSkinMat = new THREE.MeshLambertMaterial({ color: COP_SKIN });
  }

  // ---- helpers ----------------------------------------------------------

  _playerPos(out) {
    const p = this.game.player;
    if (p && p.position && typeof p.position.x === 'number') {
      out.set(p.position.x, p.position.y || 0, p.position.z);
      return out;
    }
    const s = this.game.state && this.game.state.player && this.game.state.player.position;
    if (s) {
      out.set(s[0], s[1] || 0, s[2]);
      return out;
    }
    out.set(0, 0, 0);
    return out;
  }

  _playerSpeed() {
    const p = this.game.player;
    if (p && typeof p.speed === 'number') return Math.abs(p.speed);
    const v = p && p.vehicle;
    if (v && typeof v.speed === 'number') return Math.abs(v.speed);
    const s = this.game.state && this.game.state.player;
    return s ? Math.abs(s.speed || 0) : 0;
  }

  _playerOnFoot() {
    const p = this.game.player;
    if (p && typeof p.onFoot === 'boolean') return p.onFoot;
    const s = this.game.state && this.game.state.player;
    return s ? s.onFoot !== false : true;
  }

  _roadNodes() {
    const graph = this.game.city && this.game.city.roadGraph;
    if (!graph || !graph.nodes) return [];
    return [...graph.nodes.entries()].map(([id, n]) => ({ id, x: n.x, z: n.z }));
  }

  _nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const n of this._roadNodes()) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  // ---- wanted -----------------------------------------------------------

  reportCrime(stars) {
    if (!this.game.state) return;
    addWanted(this.game.state, stars);
    this.game.state.quietSeconds = 0;
    this._decayTimer = 0;
  }

  // ---- spawning ---------------------------------------------------------

  _spawnPoliceCar(playerPos) {
    const nodes = this._roadNodes();
    let node = null;
    for (let tries = 0; tries < 10; tries += 1) {
      const cand = pick(nodes);
      if (!cand) break;
      const d = Math.hypot(cand.x - playerPos.x, cand.z - playerPos.z);
      if (d > 25 && d < 120) {
        node = cand;
        break;
      }
      node = cand;
    }
    if (!node) node = this._nearestNode(playerPos.x + 40, playerPos.z);
    if (!node) return null;

    const heading = Math.atan2(playerPos.x - node.x, playerPos.z - node.z);
    let car = null;
    if (this.game.vehicles && typeof this.game.vehicles.spawnCar === 'function') {
      car = this.game.vehicles.spawnCar('police', node.x, node.z, heading);
      if (car) car.driver = 'police';
    }
    if (!car) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.6, 4.2),
        new THREE.MeshLambertMaterial({ color: 0x1c1e22 }),
      );
      mesh.position.set(node.x, 0.5, node.z);
      this.group.add(mesh);
      car = { type: 'police', mesh, group: mesh, position: mesh.position, heading, speed: 0, driver: 'police' };
    }
    const entry = {
      car,
      speed: 0,
      targetNode: null,
      repathTimer: 0,
      lightBars: this._findLightBars(car),
      flash: Math.random() < 0.5,
    };
    this.cars.push(entry);
    return entry;
  }

  // Light-bar meshes are the emissive red/blue strips on a cruiser. The
  // vehicle factory may name them; otherwise any small emissive mesh on the
  // car body is treated as a light and flashed.
  _findLightBars(car) {
    const bars = [];
    const mesh = car.mesh || car.group;
    if (!mesh || typeof mesh.traverse !== 'function') return bars;
    mesh.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.emissive) return;
      const name = (child.name || '').toLowerCase();
      if (name.includes('light') || name.includes('bar') || name.includes('siren')) {
        bars.push(child);
        if (!child.material.emissiveIntensity) child.material.emissiveIntensity = 1;
      }
    });
    return bars;
  }

  _removePoliceCar(entry) {
    if (this.game.vehicles && typeof this.game.vehicles.removeCar === 'function') {
      this.game.vehicles.removeCar(entry.car);
    } else if (entry.car.mesh) {
      this.group.remove(entry.car.mesh);
    }
  }

  // ---- foot cops ----------------------------------------------------------

  _makeCopMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this._copBodyGeo, this._copBodyMat);
    body.position.y = 0.98;
    const head = new THREE.Mesh(this._copHeadGeo, this._copSkinMat);
    head.position.y = 1.6;
    const hat = new THREE.Mesh(this._copHatGeo, this._copPantsMat);
    hat.position.y = 1.74;
    const legL = new THREE.Mesh(this._copLegGeo, this._copPantsMat);
    legL.position.set(-0.12, 0.25, 0);
    legL.name = 'legL';
    const legR = new THREE.Mesh(this._copLegGeo, this._copPantsMat);
    legR.position.set(0.12, 0.25, 0);
    legR.name = 'legR';
    g.add(body, head, hat, legL, legR);
    return g;
  }

  _spawnFootCop(fromCar) {
    const mesh = this._makeCopMesh();
    mesh.position.copy(fromCar.position);
    mesh.position.y = 0;
    this.group.add(mesh);
    const cop = {
      mesh,
      position: mesh.position,
      heading: fromCar.heading || 0,
      speed: 0,
      legPhase: 0,
      car: fromCar,
    };
    this.cops.push(cop);
    return cop;
  }

  _removeCop(cop) {
    this.group.remove(cop.mesh);
    const i = this.cops.indexOf(cop);
    if (i >= 0) this.cops.splice(i, 1);
  }

  // ---- pursuit ------------------------------------------------------------

  _updatePoliceCar(entry, dt, playerPos) {
    const car = entry.car;
    if (!car || !car.position) return;
    entry.repathTimer -= dt;
    const dx = playerPos.x - car.position.x;
    const dz = playerPos.z - car.position.z;
    const dist = Math.hypot(dx, dz);

    // Chase the player's current spot directly when close; otherwise steer
    // through the nearest road node so cruisers stay on the streets.
    let tx = playerPos.x;
    let tz = playerPos.z;
    if (dist > 30) {
      if (entry.repathTimer <= 0 || !entry.targetNode) {
        entry.targetNode = this._nearestNode(playerPos.x, playerPos.z);
        entry.repathTimer = 1.5;
      }
      if (entry.targetNode) {
        tx = entry.targetNode.x;
        tz = entry.targetNode.z;
      }
    }
    const wantHeading = Math.atan2(tx - car.position.x, tz - car.position.z);
    const turn = clamp(angleDiff(car.heading, wantHeading), -1, 1);
    car.heading += turn * Math.min(1, 2.6 * dt);

    const tuning = (CONFIG.cars && CONFIG.cars.police) || { topSpeed: 175, accel: 13 };
    const topMs = (tuning.topSpeed * 1000) / 3600;
    const wantSpeed = dist > 4 ? topMs * 0.92 : 0;
    const accel = wantSpeed > entry.speed ? tuning.accel : 20;
    entry.speed += clamp(wantSpeed - entry.speed, -accel * dt, accel * dt);
    car.speed = entry.speed;
    car.position.x += Math.sin(car.heading) * entry.speed * dt;
    car.position.z += Math.cos(car.heading) * entry.speed * dt;
    if (car.mesh) {
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.heading;
    }

    // Ram: bump into the player's car and knock speed off both.
    const pv = this.game.player && this.game.player.vehicle;
    if (pv && pv.position) {
      const pd = Math.hypot(pv.position.x - car.position.x, pv.position.z - car.position.z);
      if (pd < 3.4 && Math.abs(pv.speed || 0) > 0.5) {
        pv.speed = (pv.speed || 0) * 0.45;
        entry.speed *= 0.5;
        car.speed = entry.speed;
        if (this.game.audio && typeof this.game.audio.crash === 'function') {
          this.game.audio.crash();
        }
      }
    }
  }

  _updateFootCop(cop, dt, playerPos) {
    const dx = playerPos.x - cop.position.x;
    const dz = playerPos.z - cop.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) return;
    const want = Math.atan2(dx, dz);
    cop.heading += angleDiff(cop.heading, want) * Math.min(1, 6 * dt);
    cop.speed = 5.2;
    cop.position.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.position.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.mesh.rotation.y = cop.heading;
    cop.legPhase += dt * 11;
    const legL = cop.mesh.getObjectByName('legL');
    const legR = cop.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = Math.sin(cop.legPhase) * 0.55;
    if (legR) legR.rotation.x = -Math.sin(cop.legPhase) * 0.55;
  }

  _bustPlayer() {
    const state = this.game.state;
    if (!state || state.endState) return;
    state.endState = 'busted';
    state.stats.timesBusted += 1;
    if (this.game.menus && typeof this.game.menus.showEnd === 'function') {
      this.game.menus.showEnd('busted');
    }
    if (this.game.audio && typeof this.game.audio.siren === 'function') {
      this.game.audio.siren(false);
    }
  }

  // ---- line of sight ------------------------------------------------------

  _anyPoliceSees(playerPos) {
    const range = CONFIG.wanted.sightRange;
    for (const entry of this.cars) {
      const car = entry.car;
      if (!car || !car.position) continue;
      const dx = playerPos.x - car.position.x;
      const dz = playerPos.z - car.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      // Very close always counts; further away the cruiser must be facing
      // roughly toward the player to spot them.
      if (d < 18) return true;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      if ((dx * fx + dz * fz) / d > 0.25) return true;
    }
    for (const cop of this.cops) {
      const d = Math.hypot(playerPos.x - cop.position.x, playerPos.z - cop.position.z);
      if (d < 30) return true;
    }
    return false;
  }

  // ---- main loop ----------------------------------------------------------

  update(dt) {
    const state = this.game.state;
    if (!state || state.paused || state.endState) {
      this._setSiren(false);
      return;
    }
    const wanted = clamp(state.wanted || 0, 0, 5);
    const byStars = CONFIG.wanted.policeByStars || [0, 1, 2, 3, 4, 5];
    const wantCars = byStars[wanted] || 0;
    const playerPos = this._playerPos(new THREE.Vector3());

    // Match the active cruiser count to the wanted level.
    while (this.cars.length < wantCars) {
      if (!this._spawnPoliceCar(playerPos)) break;
    }
    while (this.cars.length > wantCars) {
      this._removePoliceCar(this.cars[this.cars.length - 1]);
      this.cars.pop();
    }
    this._setSiren(this.cars.length > 0);

    // Flash the light bars: alternating red/blue, twice a second.
    this._flashPhase += dt;
    const on = Math.floor(this._flashPhase * 4) % 2 === 0;
    for (const entry of this.cars) {
      entry.lightBars.forEach((bar, idx) => {
        if (!bar.material) return;
        // Two bars on a car alternate; a single bar blinks on its own phase.
        const lit = entry.lightBars.length > 1
          ? on === (idx % 2 === 0)
          : on === entry.flash;
        bar.material.emissiveIntensity = lit ? 2.2 : 0.15;
      });
    }

    for (const entry of this.cars) this._updatePoliceCar(entry, dt, playerPos);

    // A foot cop steps out when a cruiser pulls up close to a player on foot.
    const onFoot = this._playerOnFoot();
    if (onFoot && wanted > 0) {
      for (const entry of this.cars) {
        const car = entry.car;
        if (!car || !car.position) continue;
        const d = Math.hypot(car.position.x - playerPos.x, car.position.z - playerPos.z);
        if (d < 14 && this.cops.length < 2 && !this.cops.some((c) => c.car === car)) {
          this._spawnFootCop(car);
        }
      }
    }
    // Foot cops give up and get back in their car when the heat is off.
    if (wanted === 0) {
      while (this.cops.length > 0) this._removeCop(this.cops[0]);
    }
    for (const cop of [...this.cops]) {
      this._updateFootCop(cop, dt, playerPos);
      const d = Math.hypot(cop.position.x - playerPos.x, cop.position.z - playerPos.z);
      if (
        onFoot &&
        d < CONFIG.wanted.bustDistance &&
        this._playerSpeed() < CONFIG.wanted.bustPlayerSpeed
      ) {
        this._bustPlayer();
        return;
      }
      // A cop that falls far behind despawns back to its cruiser.
      if (d > 60) this._removeCop(cop);
    }

    // Wanted decay: quiet time only accrues while nobody sees the player.
    if (wanted > 0) {
      if (this._anyPoliceSees(playerPos)) {
        state.quietSeconds = 0;
        this._decayTimer = 0;
      } else {
        state.quietSeconds += dt;
        if (state.quietSeconds >= CONFIG.wanted.decayQuietSeconds) {
          this._decayTimer += dt;
          if (this._decayTimer >= CONFIG.wanted.decaySecondsPerStar) {
            this._decayTimer = 0;
            state.wanted = Math.max(0, state.wanted - 1);
            state.quietSeconds = CONFIG.wanted.decayQuietSeconds;
          }
        }
      }
    } else {
      state.quietSeconds = 0;
      this._decayTimer = 0;
    }
  }

  _setSiren(on) {
    if (on === this._sirenOn) return;
    this._sirenOn = on;
    if (this.game.audio && typeof this.game.audio.siren === 'function') {
      this.game.audio.siren(on);
    }
  }

  reset() {
    while (this.cars.length > 0) {
      this._removePoliceCar(this.cars[this.cars.length - 1]);
      this.cars.pop();
    }
    while (this.cops.length > 0) this._removeCop(this.cops[0]);
    this._decayTimer = 0;
    this._flashPhase = 0;
    this._setSiren(false);
  }
}
