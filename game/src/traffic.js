// Sol Bay: ambient traffic — cars on the road graph and pedestrians on the
// sidewalks. Traffic cars are ordinary city drivers: they follow roads, yield
// briefly at intersections, slow for whatever is ahead, and respawn near the
// player when they drift too far away. Pedestrians walk the sidewalks, cross
// at intersections now and then, and run from gunfire or a car bearing down
// on them. All motion reads the shared road graph from game.city.
import { CONFIG } from './config.js';

const TRAFFIC_TYPES = ['sedan', 'taxi', 'van'];
const PED_COLORS = [0xc96a4a, 0x4a7a9e, 0x7a9e5a, 0xd9b24a, 0x8a5a9e, 0x9e4a5a, 0x5a8a8a, 0xb08968];
const SKIN_TONES = [0xe8c39e, 0xc98e5f, 0x8a5a3a, 0xf0d0b0];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Angle helper: shortest signed turn from `from` to `to`, in (-PI, PI].
function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export class TrafficSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.pedestrians = [];
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    if (game.scene) game.scene.add(this.group);

    // Shared pedestrian parts, built once and reused by every walker.
    this._pedBodyGeo = new THREE.BoxGeometry(0.42, 0.85, 0.26);
    this._pedHeadGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this._pedLegGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
    this._pedMats = PED_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    this._pedSkinMats = SKIN_TONES.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    this._pedLegMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });

    this._graph = null;
    this._nodes = [];
    this._adjacency = new Map();
    this._rebuildGraph();
    this._spawnInitial();
  }

  // ---- road graph -------------------------------------------------------

  _rebuildGraph() {
    const graph = this.game.city && this.game.city.roadGraph;
    if (!graph || !graph.nodes || graph.nodes.size === 0) {
      this._graph = null;
      this._nodes = [];
      this._adjacency = new Map();
      return;
    }
    this._graph = graph;
    // Nodes arrive as Map id -> {x, z}; keep the id alongside the position
    // because routes and adjacency are keyed by it.
    this._nodes = [...graph.nodes.entries()].map(([id, n]) => ({ id, x: n.x, z: n.z }));
    this._adjacency = new Map();
    const add = (a, b) => {
      if (!this._adjacency.has(a)) this._adjacency.set(a, []);
      this._adjacency.get(a).push(b);
    };
    for (const e of graph.edges || []) {
      add(e.a, e.b);
      add(e.b, e.a);
    }
  }

  _randomNode() {
    if (this._nodes.length === 0) return null;
    return pick(this._nodes);
  }

  // A route is a short random walk across the graph, as node positions.
  _randomRoute(fromNode, length = 6) {
    const route = [];
    let current = fromNode;
    let prevId = null;
    for (let i = 0; i < length; i += 1) {
      const next = this._adjacency.get(current.id) || [];
      if (next.length === 0) break;
      // Prefer not to immediately double back down the road we came from.
      const forward = next.filter((id) => id !== prevId);
      const chosen = pick(forward.length > 0 ? forward : next);
      const node = this._nodes.find((n) => n.id === chosen);
      if (!node) break;
      route.push(node);
      prevId = current.id;
      current = node;
    }
    return route;
  }

  _nearestNode(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const n of this._nodes) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  // ---- player position --------------------------------------------------

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

  // ---- traffic cars -----------------------------------------------------

  _spawnCar() {
    const node = this._randomNode();
    if (!node) return null;
    const type = pick(TRAFFIC_TYPES);
    const heading = rand(0, Math.PI * 2);
    let car = null;
    if (this.game.vehicles && typeof this.game.vehicles.spawnCar === 'function') {
      car = this.game.vehicles.spawnCar(type, node.x, node.z, heading);
      if (car) car.driver = 'traffic';
    }
    if (!car) {
      // Fallback: a plain box car so traffic still works if the vehicle
      // system is not wired up yet.
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.6, 4.2),
        new THREE.MeshLambertMaterial({ color: 0x4a6fa5 }),
      );
      mesh.position.set(node.x, 0.5, node.z);
      this.group.add(mesh);
      car = { type, mesh, group: mesh, position: mesh.position, heading, speed: 0, driver: 'traffic' };
    }
    const entry = {
      car,
      route: this._randomRoute(node),
      targetIndex: 0,
      yieldTimer: 0,
      speed: 0,
      cruise: CONFIG.traffic.carSpeed * rand(0.85, 1.1),
    };
    this.cars.push(entry);
    return entry;
  }

  _respawnCar(entry) {
    const p = this._playerPos(new THREE.Vector3());
    // Drop the car on a node 60-140 m from the player, so traffic is always
    // around but never pops in on top of them.
    let node = null;
    for (let tries = 0; tries < 12; tries += 1) {
      const cand = this._randomNode();
      if (!cand) break;
      const d = Math.hypot(cand.x - p.x, cand.z - p.z);
      if (d > 60 && d < 160) {
        node = cand;
        break;
      }
      node = cand;
    }
    if (!node) return;
    entry.car.position.set(node.x, entry.car.position.y || 0, node.z);
    entry.car.heading = rand(0, Math.PI * 2);
    if (entry.car.mesh) {
      entry.car.mesh.position.copy(entry.car.position);
      entry.car.mesh.rotation.y = entry.car.heading;
    }
    entry.route = this._randomRoute(node);
    entry.targetIndex = 0;
    entry.yieldTimer = 0;
    entry.speed = 0;
  }

  _removeCarEntry(entry) {
    if (this.game.vehicles && typeof this.game.vehicles.removeCar === 'function') {
      this.game.vehicles.removeCar(entry.car);
    } else if (entry.car.mesh) {
      this.group.remove(entry.car.mesh);
    }
  }

  _updateCar(entry, dt, playerPos) {
    const car = entry.car;
    if (!car || !car.position) return;
    if (entry.yieldTimer > 0) {
      entry.yieldTimer -= dt;
      entry.speed = Math.max(0, entry.speed - 30 * dt);
      car.speed = entry.speed;
      return;
    }
    if (!entry.route || entry.targetIndex >= entry.route.length) {
      const node = this._nearestNode(car.position.x, car.position.z);
      entry.route = node ? this._randomRoute(node) : [];
      entry.targetIndex = 0;
      if (!entry.route || entry.route.length === 0) return;
    }
    const target = entry.route[entry.targetIndex];
    const dx = target.x - car.position.x;
    const dz = target.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      entry.targetIndex += 1;
      // Brief yield at intersections, some of the time.
      if (Math.random() < 0.35) entry.yieldTimer = rand(0.4, 1.4);
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    // Smooth turn toward the next node, capped so cars swing naturally.
    const turn = clamp(angleDiff(car.heading, wantHeading), -1, 1);
    car.heading += turn * Math.min(1, 2.2 * dt);

    // Slow down if something is close ahead: another traffic car, a police
    // car, or the player's car / the player on foot.
    let wantSpeed = entry.cruise;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const ahead = (ox, oz, range, width) => {
      const rx = ox - car.position.x;
      const rz = oz - car.position.z;
      const along = rx * fx + rz * fz;
      const side = Math.abs(rx * fz - rz * fx);
      return along > 0 && along < range && side < width;
    };
    for (const other of this.cars) {
      if (other === entry || !other.car.position) continue;
      if (ahead(other.car.position.x, other.car.position.z, 10, 2.2)) {
        wantSpeed = Math.min(wantSpeed, Math.max(0, other.speed - 1));
      }
    }
    if (this.game.vehicles && this.game.vehicles.cars) {
      for (const v of this.game.vehicles.cars) {
        if (v === car || v.driver === 'traffic') continue;
        if (v.position && ahead(v.position.x, v.position.z, 12, 2.4)) wantSpeed = 0;
      }
    }
    if (ahead(playerPos.x, playerPos.z, 9, 2.2)) wantSpeed = 0;

    const accel = wantSpeed > entry.speed ? 6 : 14;
    entry.speed += clamp(wantSpeed - entry.speed, -accel * dt, accel * dt);
    car.speed = entry.speed;
    car.position.x += Math.sin(car.heading) * entry.speed * dt;
    car.position.z += Math.cos(car.heading) * entry.speed * dt;
    if (car.mesh) {
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.heading;
    }
    // Keep cars inside the city.
    const b = this.game.city && this.game.city.bounds;
    if (b) {
      car.position.x = clamp(car.position.x, b.minX, b.maxX);
      car.position.z = clamp(car.position.z, b.minZ, b.maxZ);
    }
  }

  // ---- pedestrians ------------------------------------------------------

  _makePedestrian() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this._pedBodyGeo, pick(this._pedMats));
    body.position.y = 0.95;
    body.name = 'body';
    const head = new THREE.Mesh(this._pedHeadGeo, pick(this._pedSkinMats));
    head.position.y = 1.58;
    head.name = 'head';
    const legL = new THREE.Mesh(this._pedLegGeo, this._pedLegMat);
    legL.position.set(-0.11, 0.25, 0);
    legL.name = 'legL';
    const legR = new THREE.Mesh(this._pedLegGeo, this._pedLegMat);
    legR.position.set(0.11, 0.25, 0);
    legR.name = 'legR';
    g.add(body, head, legL, legR);
    return g;
  }

  _spawnPedestrian() {
    const edges = (this._graph && this._graph.edges) || [];
    if (edges.length === 0) return null;
    const edge = pick(edges);
    const mesh = this._makePedestrian();
    this.group.add(mesh);
    const ped = {
      mesh,
      position: mesh.position,
      heading: 0,
      speed: 0,
      state: 'walk',
      fleeTimer: 0,
      walkTimer: rand(2, 6),
      edge,
      t: Math.random(),
      dir: Math.random() < 0.5 ? 1 : -1,
      side: Math.random() < 0.5 ? 1 : -1,
      legPhase: rand(0, Math.PI * 2),
    };
    this._placePedOnSidewalk(ped);
    this.pedestrians.push(ped);
    return ped;
  }

  // Sidewalk position: along the road edge, offset to one side by half the
  // road width plus a step onto the pavement.
  _placePedOnSidewalk(ped) {
    const e = ped.edge;
    const dx = e.bx - e.ax;
    const dz = e.bz - e.az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const off = (CONFIG.city.roadWidth / 2 + 1.2) * ped.side;
    ped.position.set(
      e.ax + dx * ped.t + nx * off,
      0,
      e.az + dz * ped.t + nz * off,
    );
    ped.heading = Math.atan2(dx * ped.dir, dz * ped.dir);
    ped.mesh.rotation.y = ped.heading;
  }

  _fleeThreat(ped) {
    // Gunfire: combat records the last shot (see combat.js). A nearby car
    // closing in also spooks pedestrians.
    const combat = this.game.combat;
    if (combat && combat.lastShotPos && combat.lastShotAt !== undefined) {
      const age = this.game.state ? this.game.state.time - combat.lastShotAt : 99;
      if (age < 3) {
        const d = Math.hypot(
          ped.position.x - combat.lastShotPos.x,
          ped.position.z - combat.lastShotPos.z,
        );
        if (d < 45) return combat.lastShotPos;
      }
    }
    // Fallback flag (documented in the module contract): game.events.shotAt
    // set by any system that fires without a combat system present.
    const ev = this.game.events;
    if (ev && ev.shotAt && ev.shotPos) {
      const d = Math.hypot(ped.position.x - ev.shotPos.x, ped.position.z - ev.shotPos.z);
      if (d < 45) return ev.shotPos;
    }
    if (this.game.vehicles && this.game.vehicles.cars) {
      for (const v of this.game.vehicles.cars) {
        if (!v.position) continue;
        const d = Math.hypot(ped.position.x - v.position.x, ped.position.z - v.position.z);
        const speed = Math.abs(v.speed || 0);
        if (d < 5 && speed > 3) return v.position;
      }
    }
    return null;
  }

  _updatePedestrian(ped, dt) {
    const threat = this._fleeThreat(ped);
    if (threat) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
    } else if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }

    // Flee only while a threat is actually present: the flee timer can
    // outlast the threat (car drove off / gunfire stopped), and threat is
    // null then — falling through to the stroll below is the safe path.
    if (ped.state === 'flee' && threat) {
      const dx = ped.position.x - threat.x;
      const dz = ped.position.z - threat.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx / d, dz / d);
      ped.heading += angleDiff(ped.heading, want) * Math.min(1, 6 * dt);
      ped.speed = 3.6;
      ped.position.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.position.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.mesh.rotation.y = ped.heading;
      this._animateLegs(ped, dt, true);
      return;
    }

    // Stroll: walk along the current edge's sidewalk.
    ped.walkTimer -= dt;
    if (ped.walkTimer <= 0) {
      ped.walkTimer = rand(2, 7);
      // Occasionally cross at the intersection: swap to the other sidewalk.
      if (Math.random() < 0.3) ped.side = -ped.side;
    }
    const e = ped.edge;
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az) || 1;
    const step = (CONFIG.traffic.pedSpeed * dt) / len;
    ped.t += step * ped.dir;
    if (ped.t >= 1 || ped.t <= 0) {
      // Reached an intersection: pick a new edge that starts here.
      const atEnd = ped.t >= 1;
      const nodeId = atEnd ? e.b : e.a;
      const outgoing = (this._graph.edges || []).filter(
        (ed) => ed.a === nodeId || ed.b === nodeId,
      );
      if (outgoing.length > 0) {
        const next = pick(outgoing);
        ped.edge = next;
        if (next.a === nodeId) {
          ped.t = 0;
          ped.dir = 1;
        } else {
          ped.t = 1;
          ped.dir = -1;
        }
      } else {
        ped.dir *= -1;
        ped.t = clamp(ped.t, 0, 1);
      }
    }
    this._placePedOnSidewalk(ped);
    ped.speed = CONFIG.traffic.pedSpeed;
    this._animateLegs(ped, dt, false);
  }

  _animateLegs(ped, dt, running) {
    ped.legPhase += dt * (running ? 11 : 6);
    const swing = running ? 0.6 : 0.35;
    const legL = ped.mesh.getObjectByName('legL');
    const legR = ped.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = Math.sin(ped.legPhase) * swing;
    if (legR) legR.rotation.x = -Math.sin(ped.legPhase) * swing;
  }

  // ---- lifecycle --------------------------------------------------------

  _spawnInitial() {
    const wantCars = CONFIG.traffic.cars;
    for (let i = 0; i < wantCars; i += 1) this._spawnCar();
    const wantPeds = CONFIG.traffic.pedestrians;
    for (let i = 0; i < wantPeds; i += 1) this._spawnPedestrian();
  }

  update(dt) {
    if (!this.game.state || this.game.state.paused) return;
    if (!this._graph) {
      this._rebuildGraph();
      if (this._graph) this._spawnInitial();
      return;
    }
    const playerPos = this._playerPos(new THREE.Vector3());

    // Top the car count back up and respawn anything that wandered far away.
    while (this.cars.length < CONFIG.traffic.cars) {
      if (!this._spawnCar()) break;
    }
    for (const entry of this.cars) {
      const d = Math.hypot(
        entry.car.position.x - playerPos.x,
        entry.car.position.z - playerPos.z,
      );
      if (d > 240) this._respawnCar(entry);
      this._updateCar(entry, dt, playerPos);
    }

    while (this.pedestrians.length < CONFIG.traffic.pedestrians) {
      if (!this._spawnPedestrian()) break;
    }
    for (const ped of this.pedestrians) {
      const d = Math.hypot(ped.position.x - playerPos.x, ped.position.z - playerPos.z);
      if (d > 200) {
        // Teleport the walker to a sidewalk near the player.
        const edges = this._graph.edges || [];
        if (edges.length > 0) {
          ped.edge = pick(edges);
          ped.t = Math.random();
          ped.side = Math.random() < 0.5 ? 1 : -1;
          this._placePedOnSidewalk(ped);
        }
      }
      this._updatePedestrian(ped, dt);
    }
  }

  reset() {
    for (const entry of this.cars) this._removeCarEntry(entry);
    this.cars = [];
    for (const ped of this.pedestrians) this.group.remove(ped.mesh);
    this.pedestrians = [];
    this._rebuildGraph();
    this._spawnInitial();
  }
}
