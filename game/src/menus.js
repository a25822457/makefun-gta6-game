// Sol Bay: title, pause, busted/wasted and mission cards. All DOM, all original.
import { addMoney } from './state.js';

export class MenuSystem {
  constructor(game) {
    this.game = game;
    this.visible = null; // 'title' | 'pause' | 'end' | 'mission-complete' | 'mission-failed' | null
    this._overlay = null;
    this._endKind = null;
    this._build();
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = [
      '#solbay-menu{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(8,14,22,.72);font-family:Arial,Helvetica,sans-serif;color:#fff}',
      '#solbay-menu .card{background:rgba(12,22,34,.96);border:2px solid #ffd23f;border-radius:14px;padding:34px 44px;max-width:620px;text-align:center;box-shadow:0 12px 50px rgba(0,0,0,.6)}',
      '#solbay-menu h1{font-size:56px;letter-spacing:6px;margin:0 0 6px;color:#ffd23f}',
      '#solbay-menu h2{font-size:34px;letter-spacing:3px;margin:0 0 10px;color:#ffd23f}',
      '#solbay-menu p{font-size:16px;line-height:1.6;color:#dfe8f0;margin:10px 0}',
      '#solbay-menu .controls{font-size:14px;line-height:1.9;color:#b9c7d4;text-align:left;display:inline-block;margin:14px 0}',
      '#solbay-menu button{display:block;width:100%;margin:8px 0;padding:13px 20px;font-size:17px;font-weight:700;cursor:pointer;border-radius:8px;border:2px solid #ffd23f;background:#ffd23f;color:#16222e}',
      '#solbay-menu button.ghost{background:transparent;color:#ffd23f}',
      '#solbay-menu button:hover{filter:brightness(1.12)}',
      '#solbay-menu .fine{font-size:13px;color:#8fa3b5}',
    ].join('\n');
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'solbay-menu';
    overlay.innerHTML = '<div class="card" id="solbay-menu-card"></div>';
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._card = overlay.querySelector('#solbay-menu-card');
  }

  _show(kind, html) {
    this.visible = kind;
    this._card.innerHTML = html;
    this._overlay.style.display = 'flex';
  }

  hide() {
    this.visible = null;
    if (this._overlay) this._overlay.style.display = 'none';
  }

  _respawn() {
    const state = this.game.state;
    const spawn = (this.game.city && this.game.city.spawnPoints && this.game.city.spawnPoints.player)
      || { x: 0, z: 200, heading: 0 };
    addMoney(state, -200);
    state.health = 100;
    state.wanted = 0;
    state.endState = null;
    state.currentMission = null;
    state.missionObjective = '';
    if (this.game.missions) this.game.missions.reset();
    if (this.game.player) {
      // Exit the vehicle FIRST: exitVehicle() places the player beside the
      // car, which would overwrite the spawn position if it ran after.
      if (this.game.player.exitVehicle) this.game.player.exitVehicle();
      this.game.player.position.set(spawn.x, 0, spawn.z);
      this.game.player.heading = spawn.heading || 0;
    }
    state.player.position = [spawn.x, 0, spawn.z];
    state.player.heading = spawn.heading || 0;
    state.player.onFoot = true;
    state.player.vehicleId = null;
    if (this.game.police && this.game.police.cars) this.game.police.cars.length = 0;
    if (this.game.audio) this.game.audio.siren(false);
    if (this.game.hud) {
      this.game.hud.setObjective('', '');
      this.game.hud.toast('Back on your feet — minus $200.');
    }
    this.hide();
    if (this.game.state) this.game.state.paused = false;
  }

  showTitle() {
    const hasSave = this.game.save && this.game.save.exists();
    const continueBtn = hasSave
      ? '<button id="solbay-continue">Continue — pick up where you left off</button>'
      : '';
    this._show('title', [
      '<h1>SOL BAY</h1>',
      '<p>Jax "Rook" Marlowe is back in the city that made him — and the crew that ran him out is still holding the bay. Drive, steal, settle scores, and take the crown back, one job at a time.</p>',
      '<div class="controls">WASD — move / drive &nbsp;·&nbsp; Shift — run<br>Space — jump / handbrake &nbsp;·&nbsp; E — enter car / interact<br>F — punch &nbsp;·&nbsp; Mouse — shoot (once armed) &nbsp;·&nbsp; R — reload<br>M — music on/off &nbsp;·&nbsp; Esc — pause &nbsp;·&nbsp; H — help</div>',
      '<button id="solbay-start">Start — back to Sol Bay</button>',
      continueBtn,
      '<p class="fine">An original game. Sol Bay, its people and its stories are invented here.</p>',
    ].join(''));
    const startBtn = this._card.querySelector('#solbay-start');
    if (startBtn) startBtn.addEventListener('click', () => {
      if (this.game.audio) this.game.audio.unlock();
      this.hide();
      if (this.game.start) this.game.start();
    });
    const contBtn = this._card.querySelector('#solbay-continue');
    if (contBtn) contBtn.addEventListener('click', () => {
      if (this.game.audio) this.game.audio.unlock();
      if (this.game.save) this.game.save.load();
      this.hide();
      if (this.game.start) this.game.start();
    });
  }

  showPause() {
    const state = this.game.state;
    this._show('pause', [
      '<h2>PAUSED</h2>',
      `<p>Missions done: ${state.missionsDone.length} / 5 &nbsp;·&nbsp; Money: $${Math.floor(state.money)} &nbsp;·&nbsp; Cars stolen: ${state.stats.carsStolen}</p>`,
      '<button id="solbay-resume">Resume</button>',
      '<button id="solbay-save" class="ghost">Save game</button>',
      '<button id="solbay-restart" class="ghost">Restart run</button>',
      '<button id="solbay-quit" class="ghost">Quit to title</button>',
    ].join(''));
    this._card.querySelector('#solbay-resume').addEventListener('click', () => {
      this.hide();
      if (this.game.state) this.game.state.paused = false;
    });
    this._card.querySelector('#solbay-save').addEventListener('click', () => {
      if (this.game.save) this.game.save.save();
      if (this.game.hud) this.game.hud.toast('Game saved.');
    });
    this._card.querySelector('#solbay-restart').addEventListener('click', () => {
      if (this.game.save) this.game.save.clear();
      window.location.reload();
    });
    this._card.querySelector('#solbay-quit').addEventListener('click', () => {
      if (this.game.save) this.game.save.save();
      this.showTitle();
    });
  }

  showEnd(kind) {
    this._endKind = kind;
    if (kind === 'busted') {
      this._show('end', [
        '<h2>BUSTED</h2>',
        '<p>The harbour patrol hauled you in. Delia bailed you out — that cost you $200, and the run is over for now.</p>',
        '<button id="solbay-retry">Retry — back on the street</button>',
      ].join(''));
    } else {
      this._show('end', [
        '<h2>WASTED</h2>',
        '<p>You wake up at the marina clinic, patched up and $200 lighter. The bay is still out there, Rook.</p>',
        '<button id="solbay-retry">Retry — back on the street</button>',
      ].join(''));
    }
    this._card.querySelector('#solbay-retry').addEventListener('click', () => this._respawn());
  }

  showMissionComplete(title, reward, isFinale) {
    const finale = isFinale
      ? '<p><strong>KING OF THE BAY.</strong> The vault loot is Delia\'s, the Breakers are finished, and the whole bay knows the name Rook Marlowe now.</p>'
      : '';
    this._show('mission-complete', [
      '<h2>MISSION COMPLETE</h2>',
      `<p><strong>${title}</strong> — reward $${reward}.</p>`,
      finale,
      '<button id="solbay-continue-mission">Continue</button>',
    ].join(''));
    this._card.querySelector('#solbay-continue-mission').addEventListener('click', () => this.hide());
  }

  showMissionFailed(title, reason, onRetry) {
    this._show('mission-failed', [
      '<h2>MISSION FAILED</h2>',
      `<p><strong>${title}</strong></p>`,
      `<p>${reason}</p>`,
      '<button id="solbay-retry-mission">Retry mission</button>',
      '<button id="solbay-skip-mission" class="ghost">Back to free roam</button>',
    ].join(''));
    this._card.querySelector('#solbay-retry-mission').addEventListener('click', () => {
      this.hide();
      if (onRetry) onRetry();
    });
    this._card.querySelector('#solbay-skip-mission').addEventListener('click', () => this.hide());
  }
}
