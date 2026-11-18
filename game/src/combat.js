// Sol Bay: pistol combat and rival NPCs. The player fires a hitscan pistol
// (granted in mission 3, gated on game.state.player.armed) through the
// centre of the screen; hits spark a tracer and a muzzle flash, misses kick
// up an impact puff. Rival Breakers approach to range, strafe, and shoot
// back; they stagger when hit and fall when killed. Killing a rival raises
// the heat — killing a cop raises it more. Every shot is timestamped in
// lastShotAt / lastShotPos so pedestrians can run from the sound.
import { CONFIG } from './config.js';
import { addWanted, damagePlayer } from './state.js';

function rand(a, b) {
  return a + Math.random() * (b - a);
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

// Rival colours: rust-red jackets over dark trousers, clearly not the player.
const RIVAL_JACKET = 0x8a2f26;
const RIVAL_PANTS = 0x23262b;
const RIVAL_SKIN = 0xd9a06f;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.lastShotAt = -Infinity;
    this.lastShotPos = new THREE.Vector3();
    this._cooldown = 0;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = CONFIG.combat.pistolRange;
    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._tmpHit = new THREE.Vector3();

    this.group = new THREE.Group();
    this.group.name = 'combat';
    if (game.scene) game.scene.add(this.group);

    // One shared muzzle light, reused for every shot and faded out fast.
    this._muzzle = new THREE.PointLight(0xffc46a, 0, 18, 1.6);
    this._muzzle.position.set(0, -10, 0);
    if (game.scene) game.scene.add(this._muzzle);

    // A small pool of glowing tracers (thin stretched boxes) and impact
    // puffs (small fading spheres), reused so shooting allocates nothing.
    this._tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    this._tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._tracers = [];
    for (let i = 0; i < 6; i += 1) {
      const m = new THREE.Mesh(this._tracerGeo, this._tracerMat.clone());
      m.visible = false;
      this.group.add(m);
      this._tracers.push({ mesh: m, life: 0 });
    }
    this._puffGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this._puffMat = new THREE.MeshBasicMaterial({
      color: 0xd8cfc0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this._puffs = [];
    for (let i = 0; i < 6; i += 1) {
      const m = new THREE.Mesh(this._puffGeo, this._puffMat.clone());
      m.visible = false;
      this.group.add(m);
      this._puffs.push({ mesh: m, life: 0 });
    }

    // Shared rival parts.
    this._bodyGeo = new THREE.BoxGeometry(0.46, 0.9, 0.28);
    this._headGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this._legGeo = new THREE.BoxGeometry(0.17, 0.5, 0.17);
    this._armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
    this._gunGeo = new THREE.BoxGeometry(0.06, 0.08, 0.34);
    this._jacketMat = new THREE.MeshLambertMaterial({ color: RIVAL_JACKET });
    this._pantsMat = new THREE.MeshLambertMaterial({ color: RIVAL_PANTS });
    this._skinMat = new THREE.MeshLambertMaterial({ color: RIVAL_SKIN });
    this._gunMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  }

  // ---- player helpers ---------------------------------------------------

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

  _armed() {
    const s = this.game.state;
    return !!(s && s.player && s.player.armed);
  }

  // ---- shooting -----------------------------------------------------------

  shoot(origin, dir) {
    if (!this._armed()) return;
    if (this._cooldown > 0) return;
    if (!origin || !dir) return;
    this._cooldown = CONFIG.combat.pistolFireDelay;

    const state = this.game.state;
    const now = state ? state.time : 0;
    this.lastShotAt = now;
    this.lastShotPos.copy(origin);

    // Muzzle flash at the camera, fading over the next few frames.
    this._muzzle.position.copy(origin);
    this._muzzle.intensity = 14;

    this._raycaster.set(origin, dir);
    const targets = [];
    for (const e of this.enemies) {
      if (e.alive) targets.push(e.mesh);
    }
    // Raycast against whole enemy groups, then map the hit child back to
    // the enemy it belongs to.
    const hits = this._raycaster.intersectObjects(targets, true);
    let end = this._tmpHit.copy(origin).addScaledVector(dir, CONFIG.combat.pistolRange);
    let hitEnemy = null;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      hitEnemy = this._enemyForMesh(hit.object);
    }
    this._fireTracer(origin, end);
    if (this.game.audio && typeof this.game.audio.gunshot === 'function') {
      this.game.audio.gunshot();
    }

    if (hitEnemy) {
      this._damageEnemy(hitEnemy, CONFIG.combat.pistolDamage);
    } else {
      this._spawnPuff(end);
    }
  }

  _enemyForMesh(obj) {
    let node = obj;
    while (node) {
      if (node.userData && node.userData.enemy) return node.userData.enemy;
      node = node.parent;
    }
    return null;
  }

  _fireTracer(from, to) {
    const t = this._tracers.find((x) => x.life <= 0) || this._tracers[0];
    const d = this._tmpDir.copy(to).sub(from);
    const len = d.length();
    if (len < 0.1) return;
    t.mesh.visible = true;
    t.mesh.position.copy(from).addScaledVector(d, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.life = 0.09;
  }

  _spawnPuff(at) {
    const p = this._puffs.find((x) => x.life <= 0) || this._puffs[0];
    p.mesh.visible = true;
    p.mesh.position.copy(at);
    p.mesh.scale.setScalar(1);
    p.mesh.material.opacity = 0.7;
    p.life = 0.45;
  }

  // ---- enemies ------------------------------------------------------------

  _makeEnemyMesh() {
    const g = new THREE.Group();
    const bodyMat = this._jacketMat.clone();
    const body = new THREE.Mesh(this._bodyGeo, bodyMat);
    body.position.y = 0.98;
    body.name = 'body';
    const head = new THREE.Mesh(this._headGeo, this._skinMat);
    head.position.y = 1.6;
    const legL = new THREE.Mesh(this._legGeo, this._pantsMat);
    legL.position.set(-0.12, 0.25, 0);
    legL.name = 'legL';
    const legR = new THREE.Mesh(this._legGeo, this._pantsMat);
    legR.position.set(0.12, 0.25, 0);
    legR.name = 'legR';
    const armR = new THREE.Mesh(this._armGeo, this._skinMat);
    armR.position.set(0.3, 1.15, 0.18);
    armR.rotation.x = -1.2;
    armR.name = 'armR';
    const gun = new THREE.Mesh(this._gunGeo, this._gunMat);
    gun.position.set(0.3, 1.05, 0.42);
    g.add(body, head, legL, legR, armR, gun);
    return { group: g, bodyMat };
  }

  spawnSquad(x, z, count) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const { group, bodyMat } = this._makeEnemyMesh();
      const px = x + rand(-4, 4);
      const pz = z + rand(-4, 4);
      group.position.set(px, 0, pz);
      group.rotation.y = rand(0, Math.PI * 2);
      this.group.add(group);
      const enemy = {
        mesh: group,
        position: group.position,
        heading: group.rotation.y,
        health: CONFIG.combat.enemyHealth,
        alive: true,
        isCop: false,
        bodyMat,
        flashTimer: 0,
        staggerTimer: 0,
        fireTimer: rand(0.3, CONFIG.combat.enemyFireDelay),
        strafeDir: Math.random() < 0.5 ? 1 : -1,
        strafeTimer: rand(1, 2.5),
        deathTimer: 0,
        legPhase: rand(0, Math.PI * 2),
        speed: 0,
      };
      group.userData.enemy = enemy;
      this.enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  _damageEnemy(enemy, amount) {
    if (!enemy.alive) return;
    enemy.health -= amount;
    enemy.flashTimer = 0.12;
    enemy.staggerTimer = 0.35;
    enemy.bodyMat.emissive.setHex(0xaa2211);
    enemy.bodyMat.emissiveIntensity = 0.9;
    if (enemy.health <= 0) this._killEnemy(enemy);
  }

  _killEnemy(enemy) {
    enemy.alive = false;
    enemy.deathTimer = 1.6;
    // Fading needs a transparent material; enable it now, not at spawn.
    if (enemy.bodyMat) enemy.bodyMat.transparent = true;
    const state = this.game.state;
    if (state) {
      state.stats.kills += 1;
      if (enemy.isCop) {
        state.stats.copsKilled += 1;
        this._reportCrime(CONFIG.wanted.killCopCrime);
      } else {
        this._reportCrime(CONFIG.wanted.killCrime);
      }
    }
  }

  _reportCrime(stars) {
    if (this.game.police && typeof this.game.police.reportCrime === 'function') {
      this.game.police.reportCrime(stars);
    } else if (this.game.state) {
      addWanted(this.game.state, stars);
    }
  }

  _updateEnemy(enemy, dt, playerPos) {
    if (!enemy.alive) {
      // Fall: tip over, sink and fade, then leave the scene.
      enemy.deathTimer -= dt;
      const k = clamp(enemy.deathTimer / 1.6, 0, 1);
      enemy.mesh.rotation.x = -Math.PI / 2 * (1 - k);
      enemy.mesh.position.y = -0.4 * (1 - k);
      if (enemy.bodyMat) enemy.bodyMat.opacity = k;
      if (enemy.deathTimer <= 0) this._removeEnemy(enemy);
      return;
    }
    if (enemy.flashTimer > 0) {
      enemy.flashTimer -= dt;
      if (enemy.flashTimer <= 0 && enemy.bodyMat) {
        enemy.bodyMat.emissiveIntensity = 0;
      }
    }

    const dx = playerPos.x - enemy.position.x;
    const dz = playerPos.z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    enemy.heading += angleDiff(enemy.heading, want) * Math.min(1, 8 * dt);
    enemy.mesh.rotation.y = enemy.heading;

    if (enemy.staggerTimer > 0) {
      enemy.staggerTimer -= dt;
      enemy.speed = 0;
    } else if (dist > CONFIG.combat.enemyRange * 0.75) {
      // Close the distance at a brisk walk.
      enemy.speed = 3.4;
      enemy.position.x += Math.sin(enemy.heading) * enemy.speed * dt;
      enemy.position.z += Math.cos(enemy.heading) * enemy.speed * dt;
      enemy.legPhase += dt * 9;
    } else {
      // In range: strafe sideways instead of standing still.
      enemy.strafeTimer -= dt;
      if (enemy.strafeTimer <= 0) {
        enemy.strafeTimer = rand(0.8, 2.2);
        enemy.strafeDir *= -1;
      }
      enemy.speed = 1.6;
      const sx = Math.cos(enemy.heading) * enemy.strafeDir;
      const sz = -Math.sin(enemy.heading) * enemy.strafeDir;
      enemy.position.x += sx * enemy.speed * dt;
      enemy.position.z += sz * enemy.speed * dt;
      enemy.legPhase += dt * 7;
    }
    const legL = enemy.mesh.getObjectByName('legL');
    const legR = enemy.mesh.getObjectByName('legR');
    const swing = enemy.speed > 0 ? 0.5 : 0;
    if (legL) legL.rotation.x = Math.sin(enemy.legPhase) * swing;
    if (legR) legR.rotation.x = -Math.sin(enemy.legPhase) * swing;

    // Shoot back when the player is in range.
    enemy.fireTimer -= dt;
    if (enemy.fireTimer <= 0 && dist < CONFIG.combat.enemyRange) {
      enemy.fireTimer = CONFIG.combat.enemyFireDelay * rand(0.85, 1.25);
      this.lastShotAt = this.game.state ? this.game.state.time : 0;
      this.lastShotPos.copy(enemy.position);
      if (this.game.audio && typeof this.game.audio.gunshot === 'function') {
        this.game.audio.gunshot();
      }
      if (Math.random() < CONFIG.combat.enemyAccuracy) {
        const wasted = damagePlayer(this.game.state, CONFIG.combat.enemyDamage);
        if (this.game.hud && typeof this.game.hud.flashDamage === 'function') {
          this.game.hud.flashDamage();
        }
        if (wasted && this.game.menus && typeof this.game.menus.showEnd === 'function') {
          this.game.menus.showEnd('wasted');
        }
      }
    }
  }

  _removeEnemy(enemy) {
    this.group.remove(enemy.mesh);
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  // ---- melee ---------------------------------------------------------------

  punch() {
    const playerPos = this._playerPos(this._tmpPos);
    const p = this.game.player;
    const heading = p && typeof p.heading === 'number'
      ? p.heading
      : (this.game.state && this.game.state.player
        ? this.game.state.player.heading : 0);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const enemy of [...this.enemies]) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - playerPos.x;
      const dz = enemy.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > CONFIG.combat.punchRange) continue;
      // Must be roughly in front of the player.
      if (d > 0.01 && (dx * fx + dz * fz) / d < 0.3) continue;
      this._damageEnemy(enemy, CONFIG.combat.punchDamage);
      if (p && typeof p.shake === 'function') p.shake(0.25);
      return true;
    }
    return false;
  }

  // ---- main loop ------------------------------------------------------------

  update(dt) {
    const state = this.game.state;
    if (!state || state.paused || state.endState) return;
    if (this._cooldown > 0) this._cooldown -= dt;
    this._muzzle.intensity = Math.max(0, this._muzzle.intensity - dt * 120);

    for (const t of this._tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, (t.life / 0.09) * 0.9);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const p of this._puffs) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.material.opacity = Math.max(0, (p.life / 0.45) * 0.7);
        p.mesh.scale.addScalar(dt * 1.5);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }

    // Left mouse fires the pistol through the centre of the screen.
    const input = this.game.input;
    if (input && input.mouseDown && this._armed() && this.game.camera) {
      const dir = new THREE.Vector3();
      this.game.camera.getWorldDirection(dir);
      this.shoot(this.game.camera.position, dir);
    }
    if (input && typeof input.wasPressed === 'function') {
      if (input.wasPressed(CONFIG.keys.punch)) this.punch();
    }

    const playerPos = this._playerPos(new THREE.Vector3());
    for (const enemy of [...this.enemies]) {
      this._updateEnemy(enemy, dt, playerPos);
    }
  }

  reset() {
    for (const enemy of [...this.enemies]) this._removeEnemy(enemy);
    this.enemies = [];
    for (const t of this._tracers) {
      t.life = 0;
      t.mesh.visible = false;
    }
    for (const p of this._puffs) {
      p.life = 0;
      p.mesh.visible = false;
    }
    this._cooldown = 0;
    this.lastShotAt = -Infinity;
    this._muzzle.intensity = 0;
  }
}
