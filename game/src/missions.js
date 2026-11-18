// Sol Bay: the five-mission story chain for Jax "Rook" Marlowe.
// All names, places and dialogue are original to this game.
import { addMoney, addWanted } from './state.js';

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function playerPos(game) {
  if (game.player && game.player.position) return game.player.position;
  const p = game.state && game.state.player ? game.state.player.position : [0, 0, 0];
  return { x: p[0], y: p[1] || 0, z: p[2] };
}

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.list = this._buildList();
    this.current = null;
    this.objectiveIndex = 0;
    this.timer = 0;
    this._failedId = null;
    this._stolenCar = null;
    this._vaultTruck = null;
    this._truckHits = 0;
    this._truckStopped = false;
    this._lootTaken = false;
    this._marker = null;
    this._markerRing = null;
    this._markerIcon = null;
    this._package = null;
    this._pulse = 0;
    this._lastTimerShown = -1;
  }

  _buildList() {
    const S = (id) => this._startPos(id);
    return [
      {
        id: 'm1',
        title: 'Welcome Back',
        briefing: 'Delia: "Rook. You\'re back in Sol Bay at last. Take my courier van from the marina and run it to the drop-off uptown. Drive clean, and don\'t keep the client waiting."',
        reward: 400,
        start: S('m1'),
        objectives: [
          { type: 'goto', target: S('m1'), text: 'Get in Delia\'s courier van at the marina' },
          { type: 'drive', target: { x: -180, z: -180 }, text: 'Drive the van to the drop-off uptown' },
        ],
      },
      {
        id: 'm2',
        title: 'Borrowed Wheels',
        briefing: 'Delia: "A client wants a sports car, no questions asked. There\'s one parked at the docks. Take it — and if the harbour patrol spots you, lose them before you call me."',
        reward: 600,
        start: S('m2'),
        objectives: [
          { type: 'steal', target: S('m2'), text: 'Steal the sports car at the docks' },
          { type: 'escape', target: null, text: 'Lose the tail — get your wanted level down to zero' },
        ],
      },
      {
        id: 'm3',
        title: 'Payback at Pier 9',
        briefing: 'Delia: "The Breakers took a package of mine at Pier 9. They think the pier is theirs now. Take the pistol, clear the warehouse, and bring my package home."',
        reward: 900,
        start: S('m3'),
        objectives: [
          { type: 'kill', target: S('m3'), count: 4, text: 'Clear the 4 Breakers at the pier warehouse' },
          { type: 'goto', target: { x: S('m3').x + 6, z: S('m3').z + 4 }, text: 'Grab the package in the warehouse' },
        ],
      },
      {
        id: 'm4',
        title: 'The Long Way Home',
        briefing: 'Delia: "That package is hot, Rook — the whole bay wants it. You\'ve got 150 seconds to get it across town, and the patrol is already on you. Don\'t stop for anything."',
        reward: 1200,
        start: S('m4'),
        objectives: [
          { type: 'timed', target: { x: -200, z: 180 }, text: 'Deliver the package across town — 150 seconds, 3-star chase' },
        ],
      },
      {
        id: 'm5',
        title: 'King of the Bay',
        briefing: 'Delia: "One last job, Rook. A vault truck is rolling through downtown with the Breakers\' whole season in it. Stop that truck, take the loot, shake the chase, and bring it to me. Do this, and the bay is yours."',
        reward: 2500,
        start: S('m5'),
        objectives: [
          { type: 'goto', target: S('m5'), text: 'Stop the vault truck downtown (ram it, or press E beside it)' },
          { type: 'goto', target: S('m5'), text: 'Grab the loot from the vault truck' },
          { type: 'escape', target: null, text: 'Escape the 4-star chase' },
          { type: 'deliver', target: S('m1'), text: 'Deliver the loot to Delia at the marina' },
        ],
      },
    ];
  }

  _startPos(id) {
    const game = this.game;
    const sp = game.city && game.city.spawnPoints;
    if (sp && sp.missions && sp.missions[id]) {
      const p = sp.missions[id];
      return { x: p.x, z: p.z };
    }
    const fallback = {
      m1: { x: 0, z: 205 },
      m2: { x: 190, z: 150 },
      m3: { x: 200, z: -110 },
      m4: { x: 200, z: -110 },
      m5: { x: 0, z: -40 },
    };
    return fallback[id] || { x: 0, z: 0 };
  }

  _def(id) {
    return this.list.find((m) => m.id === id) || null;
  }

  _nextAvailable() {
    const done = this.game.state.missionsDone || [];
    return this.list.find((m) => !done.includes(m.id)) || null;
  }

  _showMarker(target) {
    this._clearMarker();
    if (!target || !this.game.scene || typeof THREE === 'undefined') return;
    const group = new THREE.Group();
    const ringGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.25, 24, 1, true);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    group.add(ring);
    const discGeo = new THREE.CircleGeometry(3.0, 24);
    const discMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.35;
    group.add(disc);
    const iconGeo = new THREE.ConeGeometry(0.7, 1.6, 4);
    const iconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.y = 4.2;
    icon.rotation.y = Math.PI / 4;
    group.add(icon);
    group.position.set(target.x, 0, target.z);
    this.game.scene.add(group);
    this._marker = group;
    this._markerRing = ring;
    this._markerIcon = icon;
  }

  _clearMarker() {
    if (this._marker && this.game.scene) this.game.scene.remove(this._marker);
    this._marker = null;
    this._markerRing = null;
    this._markerIcon = null;
  }

  _spawnPackage(x, z) {
    this._clearPackage();
    if (!this.game.scene || typeof THREE === 'undefined') return;
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.8, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 })
    );
    box.position.y = 0.6;
    group.add(box);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 })
    );
    glow.position.y = 0.15;
    group.add(glow);
    group.position.set(x, 0, z);
    this.game.scene.add(group);
    this._package = group;
  }

  _clearPackage() {
    if (this._package && this.game.scene) this.game.scene.remove(this._package);
    this._package = null;
  }

  _setObjectiveText() {
    if (!this.current) return;
    const obj = this.current.objectives[this.objectiveIndex];
    if (!obj) return;
    let text = obj.text;
    if (obj.type === 'timed' && this.timer > 0) {
      text = `${obj.text} — ${Math.ceil(this.timer)}s left`;
    }
    this.game.state.missionObjective = text;
    if (this.game.hud) this.game.hud.setObjective(text, this.current.title);
  }

  _currentTarget() {
    if (!this.current) return null;
    const obj = this.current.objectives[this.objectiveIndex];
    if (!obj) return null;
    if (this.current.id === 'm5' && this.objectiveIndex <= 1 && this._vaultTruck) {
      const p = this._vaultTruck.position;
      return { x: p.x, z: p.z };
    }
    return obj.target || null;
  }

  _syncCurrentTarget() {
    if (!this.current) return;
    const t = this._currentTarget();
    this.current.target = t;
    if (t && this._marker) {
      this._marker.position.set(t.x, 0, t.z);
    }
  }

  tryStartAt(position) {
    if (this.current) return false;
    const next = this._nextAvailable();
    if (!next) return false;
    const px = position.x !== undefined ? position.x : position[0];
    const pz = position.z !== undefined ? position.z : position[2];
    if (dist2d(px, pz, next.start.x, next.start.z) <= 7) {
      return this.start(next.id);
    }
    return false;
  }

  // Re-read spawn points at start time, so a programmatic start (e.g. from
  // shots.js staging) still lands on the real city markers even if the
  // mission list was built before the city existed.
  _refreshTargets(def) {
    def.start = this._startPos(def.id);
    if (def.id === 'm1') def.objectives[0].target = def.start;
    if (def.id === 'm2') def.objectives[0].target = def.start;
    if (def.id === 'm3') {
      def.objectives[0].target = def.start;
      def.objectives[1].target = { x: def.start.x + 6, z: def.start.z + 4 };
    }
    if (def.id === 'm5') {
      def.objectives[0].target = def.start;
      def.objectives[1].target = def.start;
      def.objectives[3].target = this._startPos('m1');
    }
  }

  start(id) {
    const def = this._def(id);
    if (!def) return false;
    const done = this.game.state.missionsDone || [];
    if (done.includes(id)) return false;
    // Programmatic starts (shots.js / main.js) may call any mission id
    // directly, out of story order — e.g. start('m3') must grant the pistol
    // and spawn the pier squad even when m1/m2 are not done yet. The
    // in-order unlock is enforced only at the world markers, in
    // tryStartAt(), which always picks the next unfinished mission.
    if (this.current) return false;
    this._refreshTargets(def);
    this.current = {
      id: def.id,
      title: def.title,
      briefing: def.briefing,
      reward: def.reward,
      objectives: def.objectives,
      target: def.objectives[0].target || null,
    };
    this.objectiveIndex = 0;
    this.timer = 0;
    this._failedId = null;
    this._stolenCar = null;
    this._vaultTruck = null;
    this._truckHits = 0;
    this._truckStopped = false;
    this._lootTaken = false;
    this.game.state.currentMission = id;
    if (this.game.hud) {
      this.game.hud.toast(`${def.title} — ${def.briefing}`);
      this.game.hud.setObjective(def.objectives[0].text, def.title);
    }
    if (id === 'm1' && this.game.vehicles && this.game.vehicles.spawnCar) {
      this.game.vehicles.spawnCar('van', def.start.x + 4, def.start.z, 0);
      if (this.game.hud) this.game.hud.showPrompt('Press E to get in the courier van');
    }
    if (id === 'm2' && this.game.vehicles && this.game.vehicles.spawnCar) {
      const car = this.game.vehicles.spawnCar('sports', def.start.x, def.start.z, 0);
      this._stolenCar = car || null;
    }
    if (id === 'm3') {
      this.game.state.player.armed = true;
      if (this.game.combat && this.game.combat.spawnSquad) {
        this.game.combat.spawnSquad(def.start.x, def.start.z, 4);
      }
      this._spawnPackage(def.start.x + 6, def.start.z + 4);
    }
    if (id === 'm4') {
      this.timer = 150;
      this._lastTimerShown = -1;
      addWanted(this.game.state, 3);
      if (this.game.hud) this.game.hud.toast('3-star chase — go, go, go!');
    }
    if (id === 'm5' && this.game.vehicles && this.game.vehicles.spawnCar) {
      const truck = this.game.vehicles.spawnCar('truck', def.start.x, def.start.z, Math.PI / 2);
      this._vaultTruck = truck || null;
    }
    this._setObjectiveText();
    this._showMarker(this._currentTarget());
    if (this.game.audio) this.game.audio.chime();
    return true;
  }

  _advance() {
    this.objectiveIndex += 1;
    if (this.objectiveIndex >= this.current.objectives.length) {
      this.complete();
      return;
    }
    const obj = this.current.objectives[this.objectiveIndex];
    if (this.current.id === 'm5' && this.objectiveIndex === 1) {
      this._spawnPackage(this._vaultTruck ? this._vaultTruck.position.x : 0, this._vaultTruck ? this._vaultTruck.position.z : -40);
    }
    if (this.current.id === 'm5' && this.objectiveIndex === 2) {
      this._clearPackage();
      addWanted(this.game.state, 4);
      if (this.game.hud) this.game.hud.toast('4-star chase — lose them, then get to Delia!');
      if (this.game.audio) this.game.audio.siren(true);
    }
    this._setObjectiveText();
    this._showMarker(this._currentTarget());
    if (this.game.audio) this.game.audio.chime();
  }

  complete() {
    if (!this.current) return;
    const done = this.current;
    addMoney(this.game.state, done.reward);
    if (!this.game.state.missionsDone.includes(done.id)) {
      this.game.state.missionsDone.push(done.id);
    }
    this.game.state.stats.missionsCompleted += 1;
    this.game.state.currentMission = null;
    this.game.state.missionObjective = '';
    this.current = null;
    this.objectiveIndex = 0;
    this.timer = 0;
    this._vaultTruck = null;
    this._stolenCar = null;
    this._clearMarker();
    this._clearPackage();
    if (this.game.audio) {
      this.game.audio.jingle();
      this.game.audio.siren(false);
    }
    if (this.game.hud) {
      this.game.hud.toast(`Mission complete: ${done.title} — +$${done.reward}`);
      this.game.hud.setObjective('', '');
    }
    if (this.game.save) this.game.save.save();
    if (this.game.menus && this.game.menus.showMissionComplete) {
      this.game.menus.showMissionComplete(done.title, done.reward, done.id === 'm5');
    }
  }

  fail(reason) {
    if (!this.current && !this._failedId) return;
    const id = this.current ? this.current.id : this._failedId;
    const title = this.current ? this.current.title : id;
    this._failedId = id;
    this.current = null;
    this.objectiveIndex = 0;
    this.timer = 0;
    this.game.state.currentMission = null;
    this.game.state.missionObjective = '';
    this._vaultTruck = null;
    this._stolenCar = null;
    this._clearMarker();
    this._clearPackage();
    if (this.game.audio) this.game.audio.siren(false);
    if (this.game.hud) this.game.hud.setObjective('', '');
    if (this.game.menus && this.game.menus.showMissionFailed) {
      const retryId = id;
      this.game.menus.showMissionFailed(title, reason, () => this.start(retryId));
    } else if (this.game.hud) {
      this.game.hud.toast(`Mission failed: ${reason} — press E to retry`);
    }
  }

  _checkInteract() {
    const game = this.game;
    if (!game.input || !game.input.wasPressed) return;
    const interactKey = (game.config && game.config.keys && game.config.keys.interact) || 'KeyE';
    if (!game.input.wasPressed(interactKey)) return;
    if (!this.current || this.current.id !== 'm5') return;
    if (this.objectiveIndex !== 0 || this._truckStopped || !this._vaultTruck) return;
    const p = playerPos(game);
    const t = this._vaultTruck.position;
    if (dist2d(p.x, p.z, t.x, t.z) < 5) {
      this._truckStopped = true;
      if (game.hud) game.hud.toast('Vault truck stopped — grab the loot!');
      this._advance();
    }
  }

  update(dt) {
    if (!this.current) return;
    this._pulse += dt;
    if (this._markerIcon) {
      this._markerIcon.position.y = 4.2 + Math.sin(this._pulse * 3) * 0.4;
      this._markerIcon.rotation.y += dt * 2;
    }
    if (this._markerRing) {
      const s = 1 + Math.sin(this._pulse * 3) * 0.06;
      this._markerRing.scale.set(s, 1, s);
    }
    this._checkInteract();
    const game = this.game;
    const obj = this.current.objectives[this.objectiveIndex];
    if (!obj) return;
    const p = playerPos(game);
    const inVehicle = game.player && !game.player.onFoot;
    const speed = game.player ? Math.abs(game.player.speed || 0) : 0;

    if (obj.type === 'timed') {
      this.timer -= dt;
      const shown = Math.ceil(this.timer);
      if (shown !== this._lastTimerShown) {
        this._lastTimerShown = shown;
        this._setObjectiveText();
      }
      if (this.timer <= 0) {
        this.fail('Out of time — the package went cold.');
        return;
      }
    }

    if (this.current.id === 'm5' && this.objectiveIndex === 0 && this._vaultTruck && !this._truckStopped) {
      this._syncCurrentTarget();
      if (inVehicle && speed > 5) {
        const t = this._vaultTruck.position;
        if (dist2d(p.x, p.z, t.x, t.z) < 4.5) {
          this._truckHits += 1;
          if (game.audio) game.audio.crash();
          if (this._truckHits >= 3) {
            this._truckStopped = true;
            if (game.hud) game.hud.toast('Vault truck stopped — grab the loot!');
            this._advance();
            return;
          }
        }
      }
      return;
    }

    if (obj.type === 'goto' || obj.type === 'drive' || obj.type === 'deliver') {
      // Mission 1, first step: arriving is not enough — Rook must actually
      // be sitting in Delia's van before the drive counts as started.
      if (this.current.id === 'm1' && this.objectiveIndex === 0) {
        const car = game.player ? game.player.vehicle : null;
        if (car && car.type === 'van') this._advance();
        return;
      }
      const t = this._currentTarget();
      if (!t) return;
      const reach = obj.type === 'drive' ? 9 : 6;
      if (dist2d(p.x, p.z, t.x, t.z) < reach) {
        if (this.current.id === 'm3' && this.objectiveIndex === 1) {
          const alive = game.combat ? (game.combat.enemies || []).filter((e) => e.alive).length : 0;
          if (alive > 0) return;
        }
        this._advance();
      }
      return;
    }

    if (obj.type === 'steal') {
      const car = game.player ? game.player.vehicle : null;
      if (car && (car === this._stolenCar || car.type === 'sports')) {
        if (game.state.wanted < 1) addWanted(game.state, 1);
        if (game.hud) game.hud.toast('You took the sports car — now lose the tail!');
        this._advance();
      }
      return;
    }

    if (obj.type === 'kill') {
      const alive = game.combat ? (game.combat.enemies || []).filter((e) => e.alive).length : 0;
      if (alive === 0) this._advance();
      return;
    }

    if (obj.type === 'escape') {
      if (game.state.wanted <= 0) {
        if (game.audio) game.audio.siren(false);
        this._advance();
      }
      return;
    }
  }

  reset() {
    this.current = null;
    this.objectiveIndex = 0;
    this.timer = 0;
    this._failedId = null;
    this._stolenCar = null;
    this._vaultTruck = null;
    this._truckHits = 0;
    this._truckStopped = false;
    this._lootTaken = false;
    this._clearMarker();
    this._clearPackage();
    if (this.game.hud) this.game.hud.setObjective('', '');
  }
}
