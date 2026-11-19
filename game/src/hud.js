import { districtAt, streetAt } from './city.js';

// Sol Bay: DOM HUD — stars, health, armour, money, minimap, objective, speed, prompts.
export class HUD {
  constructor(game) {
    this.game = game;
    this._objectiveText = '';
    this._missionTitle = '';
    this._toastTimer = null;
    this._flashTimer = null;
    this._build();
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = [
      '#solbay-hud{position:fixed;inset:0;pointer-events:none;z-index:20;font-family:Arial,Helvetica,sans-serif;color:#fff}',
      '#solbay-topleft{position:absolute;top:14px;left:16px;text-shadow:0 1px 3px rgba(0,0,0,.7)}',
      '#solbay-stars{font-size:26px;letter-spacing:4px;color:#ffd23f;line-height:1}',
      '#solbay-stars .off{color:rgba(255,255,255,.35)}',
      '#solbay-health{width:200px;height:12px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5);border-radius:6px;margin-top:8px;overflow:hidden}',
      '#solbay-health-fill{height:100%;width:100%;background:#37c24a;transition:width .2s}',
      '#solbay-armor{width:200px;height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.4);border-radius:4px;margin-top:4px;overflow:hidden}',
      '#solbay-armor-fill{height:100%;width:0%;background:#4aa3ff;transition:width .2s}',
      '#solbay-weapon{font-size:13px;font-weight:700;letter-spacing:1px;color:#cfe6ff;margin-top:5px}',
      '#solbay-clock{position:absolute;top:244px;right:16px;width:220px;text-align:center;font-size:16px;font-weight:700;letter-spacing:1px;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
      '#solbay-location{position:absolute;top:266px;right:16px;width:220px;text-align:center;font-size:12px;font-weight:700;letter-spacing:1px;color:#b9c7d4;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
      '#solbay-vehicle{position:absolute;right:20px;bottom:78px;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
      '#solbay-vehicle-name{font-size:15px;font-weight:800;letter-spacing:1px}',
      '#solbay-vehicle-cond{width:150px;height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.4);border-radius:4px;margin-top:4px;margin-left:auto;overflow:hidden}',
      '#solbay-vehicle-cond-fill{height:100%;width:100%;background:#37c24a}',
      '#solbay-money{font-size:22px;font-weight:700;margin-top:6px}',
      '#solbay-missions{font-size:13px;font-weight:700;letter-spacing:1px;color:#ffd23f;margin-top:4px}',
      '#solbay-respect{font-size:12px;font-weight:700;letter-spacing:1px;color:#8fd3ff;margin-top:4px}',
      '#solbay-respect-bar{width:200px;height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.4);border-radius:3px;margin-top:3px;overflow:hidden}',
      '#solbay-respect-fill{height:100%;width:0%;background:#8fd3ff}',
      '#solbay-radio{position:absolute;left:16px;bottom:52px;font-size:13px;font-weight:700;letter-spacing:1px;color:#ffd23f;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
      '#solbay-dialogue{position:absolute;left:50%;bottom:230px;transform:translateX(-50%);background:rgba(10,16,24,.88);border-left:4px solid #ffd23f;border-radius:4px;padding:10px 18px;font-size:16px;line-height:1.45;max-width:640px;text-align:left;opacity:0;transition:opacity .3s}',
      '#solbay-dialogue .who{font-weight:800;letter-spacing:1px;color:#ffd23f;margin-right:8px}',
      '#solbay-minimap{position:absolute;top:14px;right:16px;border:2px solid rgba(255,255,255,.55);border-radius:50%;background:rgba(10,20,30,.85);box-shadow:0 2px 10px rgba(0,0,0,.5)}',
      '#solbay-objective{position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8)}',
      '#solbay-objective-title{font-size:15px;font-weight:700;letter-spacing:2px;color:#ffd23f}',
      '#solbay-objective-text{font-size:19px;font-weight:700;margin-top:2px}',
      '#solbay-speed{position:absolute;right:20px;bottom:18px;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.8)}',
      '#solbay-speed-num{font-size:34px;font-weight:800;line-height:1}',
      '#solbay-speed-label{font-size:13px;color:#ffd23f;font-weight:700}',
      '#solbay-prompt{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.4);border-radius:6px;padding:8px 16px;font-size:16px;font-weight:700;display:none}',
      '#solbay-toast{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);background:rgba(0,0,0,.7);border-radius:6px;padding:9px 18px;font-size:16px;max-width:640px;text-align:center;opacity:0;transition:opacity .4s}',
      '#solbay-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(200,0,0,.55) 100%);opacity:0;transition:opacity .15s}',
      '#solbay-crosshair{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 4px #000;display:none}',
      '#solbay-help{position:absolute;left:16px;bottom:16px;font-size:12px;line-height:1.6;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(0,0,0,.8)}',
    ].join('\n');
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'solbay-hud';
    root.innerHTML = [
      '<div id="solbay-vignette"></div>',
      '<div id="solbay-topleft"><div id="solbay-stars"></div>',
      '<div id="solbay-health"><div id="solbay-health-fill"></div></div>',
      '<div id="solbay-armor"><div id="solbay-armor-fill"></div></div>',
      '<div id="solbay-weapon"></div>',
      '<div id="solbay-money">$0</div><div id="solbay-missions">MISSIONS 0/8</div><div id="solbay-respect">RESPECT Lv.1 NOBODY</div><div id="solbay-respect-bar"><div id="solbay-respect-fill"></div></div></div>',
      '<canvas id="solbay-minimap" width="220" height="220"></canvas>',
      '<div id="solbay-clock"></div><div id="solbay-location"></div>',
      '<div id="solbay-vehicle"><div id="solbay-vehicle-name"></div><div id="solbay-vehicle-cond"><div id="solbay-vehicle-cond-fill"></div></div></div>',
      '<div id="solbay-objective"><div id="solbay-objective-title"></div><div id="solbay-objective-text"></div></div>',
      '<div id="solbay-speed"><div id="solbay-speed-num"></div><div id="solbay-speed-label"></div></div>',
      '<div id="solbay-prompt"></div>',
      '<div id="solbay-toast"></div>',
      '<div id="solbay-dialogue"></div>',
      '<div id="solbay-radio"></div>',
      '<div id="solbay-crosshair"></div>',
      '<div id="solbay-help">WASD move / drive &nbsp;·&nbsp; E enter car / shop &nbsp;·&nbsp; G garage &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Mouse shoot &nbsp;·&nbsp; 1/2/3 weapons &nbsp;·&nbsp; R radio &nbsp;·&nbsp; M music &nbsp;·&nbsp; Esc pause</div>',
    ].join('');
    document.body.appendChild(root);
    this.root = root;
    this.starsEl = root.querySelector('#solbay-stars');
    this.healthFill = root.querySelector('#solbay-health-fill');
    this.armorFill = root.querySelector('#solbay-armor-fill');
    this.weaponEl = root.querySelector('#solbay-weapon');
    this.clockEl = root.querySelector('#solbay-clock');
    this.locationEl = root.querySelector('#solbay-location');
    this.vehicleEl = root.querySelector('#solbay-vehicle');
    this.vehicleNameEl = root.querySelector('#solbay-vehicle-name');
    this.vehicleCondFill = root.querySelector('#solbay-vehicle-cond-fill');
    this.moneyEl = root.querySelector('#solbay-money');
    this.missionsEl = root.querySelector('#solbay-missions');
    this.mapCanvas = root.querySelector('#solbay-minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.objTitleEl = root.querySelector('#solbay-objective-title');
    this.objTextEl = root.querySelector('#solbay-objective-text');
    this.speedNumEl = root.querySelector('#solbay-speed-num');
    this.speedLabelEl = root.querySelector('#solbay-speed-label');
    this.promptEl = root.querySelector('#solbay-prompt');
    this.toastEl = root.querySelector('#solbay-toast');
    this.dialogueEl = root.querySelector('#solbay-dialogue');
    this.respectEl = root.querySelector('#solbay-respect');
    this.respectFill = root.querySelector('#solbay-respect-fill');
    this.radioEl = root.querySelector('#solbay-radio');
    this.vignetteEl = root.querySelector('#solbay-vignette');
    this.crosshairEl = root.querySelector('#solbay-crosshair');
    this.helpEl = root.querySelector('#solbay-help');
    this._dialogueTimer = null;
    this._mapTime = 0;
  }

  setObjective(text, title) {
    this._objectiveText = text || '';
    if (title !== undefined) this._missionTitle = title || '';
    if (this.objTextEl) this.objTextEl.textContent = this._objectiveText;
    if (this.objTitleEl) this.objTitleEl.textContent = this._missionTitle ? this._missionTitle.toUpperCase() : '';
  }

  toast(msg) {
    if (!this.toastEl || !msg) return;
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 4200);
  }

  /** A toast that stays up until something else replaces it (staging only). */
  toastSticky(msg) {
    if (!this.toastEl || !msg) return;
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
  }

  /** A character speaks: "DELIA: ..." in a dialogue bar. Fades after 5 s. */
  dialogue(speaker, line) {
    if (!this.dialogueEl || !speaker || !line) return;
    this.dialogueEl.innerHTML = '';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = String(speaker).toUpperCase() + ':';
    this.dialogueEl.appendChild(who);
    this.dialogueEl.appendChild(document.createTextNode(' ' + line));
    this.dialogueEl.style.opacity = '1';
    if (this._dialogueTimer) clearTimeout(this._dialogueTimer);
    this._dialogueTimer = setTimeout(() => { this.dialogueEl.style.opacity = '0'; }, 5000);
  }

  /** A dialogue line that stays up (screenshot staging only). */
  dialogueSticky(speaker, line) {
    if (!this.dialogueEl || !speaker || !line) return;
    if (this._dialogueTimer) { clearTimeout(this._dialogueTimer); this._dialogueTimer = null; }
    this.dialogueEl.innerHTML = '';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = String(speaker).toUpperCase() + ':';
    this.dialogueEl.appendChild(who);
    this.dialogueEl.appendChild(document.createTextNode(' ' + line));
    this.dialogueEl.style.opacity = '1';
  }

  /** Radio readout: "RADIO · BAY 98.5 — Sunset Drive". */
  setRadio(stationName, trackName) {
    if (!this.radioEl) return;
    this.radioEl.textContent = stationName
      ? 'RADIO · ' + stationName + (trackName ? ' — ' + trackName : '')
      : '';
  }

  flashDamage() {
    if (!this.vignetteEl) return;
    this.vignetteEl.style.opacity = '1';
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this.vignetteEl.style.opacity = '0'; }, 350);
  }

  showPrompt(text) {
    if (!this.promptEl) return;
    this.promptEl.textContent = text;
    this.promptEl.style.display = 'block';
  }

  hidePrompt() {
    if (this.promptEl) this.promptEl.style.display = 'none';
  }

  _drawMinimap(now) {
    const ctx = this.mapCtx;
    const game = this.game;
    if (!ctx || !game.city) return;
    const size = 220;
    const range = 120; // metres shown from centre to edge
    const px = game.player && game.player.position ? game.player.position.x : 0;
    const pz = game.player && game.player.position ? game.player.position.z : 0;
    const toMap = (x, z) => [size / 2 + ((x - px) / range) * (size / 2), size / 2 + ((z - pz) / range) * (size / 2)];
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0e2433';
    ctx.fillRect(0, 0, size, size);
    // Roads.
    const graph = game.city.roadGraph;
    if (graph && graph.edges) {
      ctx.strokeStyle = '#5a636e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const e of graph.edges) {
        const [ax, ay] = toMap(e.ax, e.az);
        const [bx, by] = toMap(e.bx, e.bz);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    // Buildings.
    const colliders = game.city.colliders || [];
    ctx.fillStyle = '#3d4a58';
    for (const c of colliders) {
      const [x1, y1] = toMap(c.minX, c.minZ);
      const [x2, y2] = toMap(c.maxX, c.maxZ);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    // Mission blip, yellow pulse.
    const cur = game.missions ? game.missions.current : null;
    if (cur && cur.target) {
      const [mx, my] = toMap(cur.target.x, cur.target.z);
      const r = 7 + Math.sin(now * 5) * 2.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic dots, white.
    const trafficCars = (game.traffic && game.traffic.cars) || [];
    ctx.fillStyle = '#e8e8e8';
    for (const car of trafficCars) {
      const p = car.position || car;
      if (!p) continue;
      const [dx, dy] = toMap(p.x, p.z);
      ctx.fillRect(dx - 1.5, dy - 1.5, 3, 3);
    }
    // Police, blue with red ring.
    const policeCars = (game.police && game.police.cars) || [];
    for (const car of policeCars) {
      const p = car.position || car;
      if (!p) continue;
      const [dx, dy] = toMap(p.x, p.z);
      ctx.fillStyle = '#2f7bff';
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Player arrow, north up: heading 0 faces -Z.
    const heading = game.player ? (game.player.heading || 0) : 0;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    // Arrow is drawn pointing north (up, -Z); rotating by -heading keeps it
    // pointing the way the player faces, with north up on the map.
    ctx.rotate(-heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 14);
  }

  update(dt) {
    const state = this.game.state;
    if (!state) return;
    // Wanted stars.
    if (this.starsEl) {
      let html = '';
      for (let i = 0; i < 5; i++) {
        html += i < state.wanted ? '<span>★</span>' : '<span class="off">★</span>';
      }
      if (this.starsEl.innerHTML !== html) this.starsEl.innerHTML = html;
    }
    if (this.healthFill) {
      const hp = Math.max(0, Math.min(100, state.health));
      this.healthFill.style.width = hp + '%';
      this.healthFill.style.background = hp > 50 ? '#37c24a' : hp > 25 ? '#f2a200' : '#e5322d';
    }
    // Armour bar (Kevlar vest): blue, only visible when wearing armour.
    if (this.armorFill) {
      const ar = Math.max(0, Math.min(100, state.armor || 0));
      this.armorFill.style.width = ar + '%';
      const bar = this.armorFill.parentElement;
      if (bar) bar.style.display = ar > 0 ? 'block' : 'none';
    }
    // Current weapon + ammo ("Bay Sweeper SMG · 120" / "Pistol · ∞").
    if (this.weaponEl) {
      const w = state.weapons || {};
      const defs = (this.game.config && this.game.config.weapons) || {};
      let text = '';
      if (state.player && state.player.armed) {
        const cur = w.current || 'pistol';
        const def = defs[cur] || {};
        const name = (def.name || cur).toUpperCase();
        if (cur === 'pistol') {
          text = '⚔ ' + name + ' · ∞';
        } else {
          const ammo = w[cur] ? (w[cur].ammo || 0) : 0;
          text = '⚔ ' + name + ' · ' + ammo;
        }
      }
      if (this.weaponEl.textContent !== text) this.weaponEl.textContent = text;
    }
    // Clock: 12-hour time + period (DAWN / DAY / DUSK / NIGHT).
    if (this.clockEl) {
      const tod = (state.timeOfDay !== undefined ? state.timeOfDay : 16.5) % 24;
      const h = Math.floor(tod);
      const m = Math.floor((tod - h) * 60);
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const period = tod >= 5 && tod < 8 ? 'DAWN' : tod >= 8 && tod < 17 ? 'DAY' : tod >= 17 && tod < 20 ? 'DUSK' : 'NIGHT';
      const text = h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm + ' · ' + period;
      if (this.clockEl.textContent !== text) this.clockEl.textContent = text;
    }
    // Location: district + street, under the minimap.
    if (this.locationEl) {
      const p = this.game.player && this.game.player.position ? this.game.player.position : { x: 0, z: 0 };
      const text = districtAt(p.x, p.z) + ' · ' + streetAt(p.x, p.z);
      if (this.locationEl.textContent !== text) this.locationEl.textContent = text;
    }
    if (this.moneyEl) {
      const text = '$' + Math.floor(state.money).toLocaleString('en-US');
      if (this.moneyEl.textContent !== text) this.moneyEl.textContent = text;
    }
    if (this.missionsEl) {
      const done = (state.missionsDone || []).length;
      const total = (this.game.missions && this.game.missions.list) ? this.game.missions.list.length : 8;
      const text = 'MISSIONS ' + done + '/' + total;
      if (this.missionsEl.textContent !== text) this.missionsEl.textContent = text;
    }
    // Respect level + title + progress.
    if (this.respectEl) {
      const rep = this.game.reputation;
      if (rep) {
        const text = 'RESPECT Lv.' + rep.level + ' ' + rep.title().toUpperCase();
        if (this.respectEl.textContent !== text) this.respectEl.textContent = text;
        if (this.respectFill) this.respectFill.style.width = Math.round(rep.progress() * 100) + '%';
      }
    }
    // Speed + vehicle name.
    const player = this.game.player;
    if (this.speedNumEl && this.speedLabelEl) {
      if (player && !player.onFoot && player.vehicle) {
        const kmh = Math.round(Math.abs(player.speed || 0) * 3.6);
        this.speedNumEl.textContent = String(kmh);
        const name = player.vehicle.type ? player.vehicle.type.charAt(0).toUpperCase() + player.vehicle.type.slice(1) : 'Car';
        this.speedLabelEl.textContent = 'km/h · ' + name;
      } else {
        this.speedNumEl.textContent = '';
        this.speedLabelEl.textContent = '';
      }
    }
    // Vehicle card: car type + condition bar, only while driving.
    if (this.vehicleEl && this.vehicleNameEl && this.vehicleCondFill) {
      if (player && !player.onFoot && player.vehicle) {
        const car = player.vehicle;
        const name = car.type ? car.type.charAt(0).toUpperCase() + car.type.slice(1) : 'Car';
        const cond = Math.round(car.condition ?? 100);
        this.vehicleEl.style.display = 'block';
        const nameText = name + ' · ' + cond + '%';
        if (this.vehicleNameEl.textContent !== nameText) this.vehicleNameEl.textContent = nameText;
        this.vehicleCondFill.style.width = cond + '%';
        this.vehicleCondFill.style.background = cond > 50 ? '#37c24a' : cond > 25 ? '#f2a200' : '#e5322d';
      } else {
        this.vehicleEl.style.display = 'none';
      }
    }
    // Crosshair when armed.
    if (this.crosshairEl) {
      this.crosshairEl.style.display = state.player && state.player.armed ? 'block' : 'none';
    }
    this._mapTime += dt;
    this._drawMinimap(this._mapTime);
  }
}
