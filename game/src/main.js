// Sol Bay: boot, the one game loop, the camera, and the wiring between systems.
// Every system is built here and reached through the single `game` object.
import { CONFIG } from './config.js';
import { createGameState } from './state.js';
import { createRng } from './rng.js';
import { buildCity } from './city.js';
import { Input } from './input.js';
import { VehicleSystem } from './vehicles.js';
import { Player } from './player.js';
import { TrafficSystem } from './traffic.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionSystem } from './missions.js';
import { HUD } from './hud.js';
import { AudioSystem } from './audio.js';
import { MenuSystem } from './menus.js';
import { SaveSystem } from './save.js';
import { stageShot } from './shots.js';

// Errors the page hit, kept where a playtest script can read them.
window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error));
});

/** URL parameters: ?seed= for the world, ?shot= for a staged screenshot. */
function readParams() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') || '', 10);
  return {
    seed: Number.isFinite(seed) ? seed : 1337,
    shot: params.get('shot') || '',
  };
}

class Game {
  constructor() {
    const params = readParams();
    this.params = params;
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(CONFIG.palette.fog, 220, 900);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 40, 80);

    this.config = CONFIG;
    this.state = createGameState();
    this.rng = createRng(params.seed);

    // The one shared object every system reads.
    const game = this;
    this.input = new Input(this.canvas);
    this.city = buildCity(this.scene, this.rng);
    this.audio = new AudioSystem(game);
    this.hud = new HUD(game);
    this.menus = new MenuSystem(game);
    this.save = new SaveSystem(game);
    this.vehicles = new VehicleSystem(game);
    this.player = new Player(game);
    this.traffic = new TrafficSystem(game);
    this.police = new PoliceSystem(game);
    this.combat = new CombatSystem(game);
    this.missions = new MissionSystem(game);

    // Player starts at the marina spawn point.
    const spawn = this.city.spawnPoints.player;
    this.player.position.set(spawn.x, 0, spawn.z);
    this.player.heading = spawn.heading;
    this.player.cameraYaw = spawn.heading;

    // Parked cars to steal, at the marked parking spots (driverless, so
    // taking one is free — crewed traffic and police cars are the crime).
    for (const spot of this.city.spawnPoints.cars || []) {
      this.vehicles.spawnCar(spot.type || 'sedan', spot.x, spot.z, spot.heading || 0);
    }

    this.clock = { last: performance.now(), acc: 0 };
    this.shotMode = params.shot !== '';
    this.frozen = false; // screenshot staging freezes the sim after staging

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('click', () => this.audio.unlock(), { once: true });
    document.addEventListener('keydown', () => this.audio.unlock(), { once: true });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Start free roam from the title screen (also used by Continue). */
  start(saved) {
    if (saved) this.applySave(saved);
    this.state.started = true;
    this.state.paused = false;
    this.menus.hide();
    this.audio.unlock();
    this.hud.toast('Welcome back to Sol Bay, Rook.');
  }

  /** Apply a loaded save onto the live state and player. */
  applySave(saved) {
    this.state.money = saved.money ?? this.state.money;
    this.state.health = saved.health ?? this.state.health;
    this.state.missionsDone = saved.missionsDone ?? [];
    this.state.player.armed = Boolean(saved.armed);
    if (saved.playerPos) {
      this.player.position.set(saved.playerPos[0], 0, saved.playerPos[2]);
      this.player.heading = saved.heading ?? 0;
      this.player.cameraYaw = this.player.heading;
    }
    if (saved.timeOfDay) this.state.timeOfDay = saved.timeOfDay;
  }

  /** One fixed simulation step. */
  step(dt) {
    this.state.time += dt;
    this.player.update(dt);
    this.vehicles.update(dt);
    this.traffic.update(dt);
    this.police.update(dt);
    this.combat.update(dt);
    this.missions.update(dt);
    this.hud.update(dt);
    this.audio.update(dt);
    this.updateCamera(dt);
    this.input.endFrame();
  }

  /** Run n fixed steps at once (screenshot staging uses this). */
  updateSteps(n, dt) {
    for (let i = 0; i < n; i += 1) this.step(dt);
  }

  /** Third-person follow camera: behind the player (or their car), orbiting. */
  updateCamera(dt) {
    const p = this.player;
    const yaw = p.cameraYaw ?? p.heading;
    const pitch = p.cameraPitch ?? 0.32;
    const dist = p.onFoot ? 6.5 : 10;
    const height = p.onFoot ? 3.2 : 4.5;
    const target = p.position.clone();
    target.y += p.onFoot ? 1.6 : 1.2;
    // Chase camera: BEHIND the player (opposite their facing direction),
    // looking forward over them at the road ahead. The offset must be
    // +forward, not -forward: with the minus sign the camera sat in front
    // of the car, so the player drove toward the viewer and the road ahead
    // was off-screen behind the camera.
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + Math.sin(pitch) * dist + height * 0.4;
    const want = new THREE.Vector3(cx, cy, cz);
    // Smooth follow, but snap on the first frame so shots start framed.
    if (!this.cameraPlaced) {
      this.camera.position.copy(want);
      this.cameraPlaced = true;
    } else {
      this.camera.position.lerp(want, 1 - Math.pow(0.0001, dt));
    }
    this.camera.lookAt(target);
  }

  /** Main loop: fixed-step simulation, render every frame. */
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min((now - this.clock.last) / 1000, 0.1);
    this.clock.last = now;
    // Pause toggle (checked here, not in step(), so it also works while
    // already paused — step() never runs then).
    if (this.state.started && !this.state.endState && this.input.wasPressed(CONFIG.keys.pause)) {
      if (this.state.paused) {
        this.state.paused = false;
        this.menus.hide();
      } else {
        this.state.paused = true;
        this.menus.showPause();
      }
    }
    const running = this.state.started && !this.state.paused && !this.state.endState && !this.frozen;
    if (running) {
      this.clock.acc += dt;
      const step = CONFIG.step;
      let guard = 0;
      while (this.clock.acc >= step && guard < 5) {
        this.step(step);
        this.clock.acc -= step;
        guard += 1;
      }
      if (guard === 5) this.clock.acc = 0;
    } else {
      // Still drain input edges so a paused frame never replays a keypress.
      this.input.endFrame();
    }
    // End screens freeze play but keep rendering the world behind them.
    if (this.state.endState && this.menus.visible !== 'end') {
      this.menus.showEnd(this.state.endState);
    }
    this.renderer.render(this.scene, this.camera);
  }

  boot() {
    if (this.shotMode) {
      // Staged screenshot: build the scene, freeze it, render it.
      stageShot(this.params.shot, this);
      this.frozen = true;
      this.state.started = true;
    } else if (this.save.exists()) {
      this.menus.showTitle(true);
    } else {
      this.menus.showTitle(false);
    }
    this.clock.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
}

const game = new Game();
game.boot();
window.__game = game;
