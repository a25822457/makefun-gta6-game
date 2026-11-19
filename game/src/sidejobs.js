// Sol Bay: street-cash side jobs. A few glowing cash bundles sit on the
// sidewalks around the city; walk or drive over one to pocket $50. They
// respawn elsewhere after a short delay, so free roam always has something
// to grab. Purely additive: no mission, no fail state, no interaction with
// the story chain — the playthrough bot can drive over one and only gains.
import { CONFIG } from './config.js';
import { addMoney } from './state.js';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BUNDLE_COUNT = 6;
const COLLECT_RADIUS = 3;
const REWARD = 50;

export class SideJobSystem {
  constructor(game) {
    this.game = game;
    this.bundles = [];
    this.group = new THREE.Group();
    this.group.name = 'sidejobs';
    if (game.scene) game.scene.add(this.group);

    this._boxGeo = new THREE.BoxGeometry(0.55, 0.28, 0.4);
    this._boxMat = new THREE.MeshStandardMaterial({ color: 0x2e9e5a, roughness: 0.6 });
    this._bandGeo = new THREE.BoxGeometry(0.57, 0.1, 0.14);
    this._bandMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    this._ringGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20, 1, true);
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });

    for (let i = 0; i < BUNDLE_COUNT; i += 1) {
      this._spawnBundle();
    }
  }

  /** A random sidewalk spot, from a road-graph edge (same trick as the peds). */
  _randomSpot() {
    const graph = this.game.city && this.game.city.roadGraph;
    const edges = (graph && graph.edges) || [];
    if (edges.length === 0) return { x: rand(-200, 200), z: rand(-200, 200) };
    const e = pick(edges);
    const t = Math.random();
    const dx = e.bx - e.ax;
    const dz = e.bz - e.az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = (CONFIG.city.roadWidth / 2 + 1.2) * side;
    return {
      x: e.ax + dx * t + nx * off,
      z: e.az + dz * t + nz * off,
    };
  }

  _makeBundleMesh() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this._boxGeo, this._boxMat);
    box.position.y = 0.32;
    box.castShadow = true;
    const band = new THREE.Mesh(this._bandGeo, this._bandMat);
    band.position.y = 0.32;
    const ring = new THREE.Mesh(this._ringGeo, this._ringMat);
    ring.position.y = 0.12;
    g.add(box, band, ring);
    return g;
  }

  _spawnBundle() {
    const spot = this._randomSpot();
    const mesh = this._makeBundleMesh();
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = rand(0, Math.PI * 2);
    this.group.add(mesh);
    this.bundles.push({ mesh, x: spot.x, z: spot.z, active: true, respawnAt: 0, bob: rand(0, Math.PI * 2) });
    return this.bundles[this.bundles.length - 1];
  }

  _collect(bundle) {
    bundle.active = false;
    bundle.respawnAt = (this.game.state ? this.game.state.time : 0) + rand(15, 25);
    this.group.remove(bundle.mesh);
    if (this.game.state) addMoney(this.game.state, REWARD);
    if (this.game.reputation) this.game.reputation.addPoints(5, 'sidejob');
    if (this.game.hud) this.game.hud.toast(`Side job: street cash +$${REWARD}`);
    if (this.game.audio && typeof this.game.audio.chime === 'function') {
      this.game.audio.chime();
    }
  }

  update(dt) {
    const state = this.game.state;
    if (!state || state.paused || state.endState) return;
    const p = this.game.player && this.game.player.position;
    if (!p) return;
    const now = state.time || 0;
    for (const b of this.bundles) {
      if (!b.active) {
        if (now >= b.respawnAt) {
          const spot = this._randomSpot();
          b.x = spot.x;
          b.z = spot.z;
          b.mesh.position.set(spot.x, 0, spot.z);
          b.mesh.rotation.y = rand(0, Math.PI * 2);
          b.active = true;
          this.group.add(b.mesh);
        }
        continue;
      }
      // Gentle bob so the bundle reads as a pickup, not litter.
      b.bob += dt * 2.5;
      b.mesh.position.y = Math.sin(b.bob) * 0.08;
      b.mesh.rotation.y += dt * 0.6;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      if (dx * dx + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        this._collect(b);
      }
    }
  }

  reset() {
    for (const b of this.bundles) this.group.remove(b.mesh);
    this.bundles = [];
    for (let i = 0; i < BUNDLE_COUNT; i += 1) {
      this._spawnBundle();
    }
  }
}
