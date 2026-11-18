// Sol Bay: DOM HUD — stars, health, money, minimap, objective, speed, prompts.
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
      '#solbay-money{font-size:22px;font-weight:700;margin-top:6px}',
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
      '<div id="solbay-money">$0</div></div>',
      '<canvas id="solbay-minimap" width="220" height="220"></canvas>',
      '<div id="solbay-objective"><div id="solbay-objective-title"></div><div id="solbay-objective-text"></div></div>',
      '<div id="solbay-speed"><div id="solbay-speed-num"></div><div id="solbay-speed-label"></div></div>',
      '<div id="solbay-prompt"></div>',
      '<div id="solbay-toast"></div>',
      '<div id="solbay-crosshair"></div>',
      '<div id="solbay-help">WASD move / drive &nbsp;·&nbsp; E enter car &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Mouse shoot &nbsp;·&nbsp; M music &nbsp;·&nbsp; Esc pause</div>',
    ].join('');
    document.body.appendChild(root);
    this.root = root;
    this.starsEl = root.querySelector('#solbay-stars');
    this.healthFill = root.querySelector('#solbay-health-fill');
    this.moneyEl = root.querySelector('#solbay-money');
    this.mapCanvas = root.querySelector('#solbay-minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.objTitleEl = root.querySelector('#solbay-objective-title');
    this.objTextEl = root.querySelector('#solbay-objective-text');
    this.speedNumEl = root.querySelector('#solbay-speed-num');
    this.speedLabelEl = root.querySelector('#solbay-speed-label');
    this.promptEl = root.querySelector('#solbay-prompt');
    this.toastEl = root.querySelector('#solbay-toast');
    this.vignetteEl = root.querySelector('#solbay-vignette');
    this.crosshairEl = root.querySelector('#solbay-crosshair');
    this.helpEl = root.querySelector('#solbay-help');
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
    if (this.moneyEl) {
      const text = '$' + Math.floor(state.money).toLocaleString('en-US');
      if (this.moneyEl.textContent !== text) this.moneyEl.textContent = text;
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
    // Crosshair when armed.
    if (this.crosshairEl) {
      this.crosshairEl.style.display = state.player && state.player.armed ? 'block' : 'none';
    }
    this._mapTime += dt;
    this._drawMinimap(this._mapTime);
  }
}
