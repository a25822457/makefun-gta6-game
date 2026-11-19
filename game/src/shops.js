// Sol Bay: Harbor Arms (gun shop) and Rook's Garage (car shop).
// Two money sinks the player actually uses. Harbor Arms sells guns, ammo
// and a Kevlar vest — walk up on foot and press E. Rook's Garage repairs
// and resprays the car — drive in and press G. Both pause the game while
// the menu is open, and both are Sol Bay's own places, not anyone else's.
import { CONFIG } from './config.js';
import { addMoney } from './state.js';

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// A shop sign: flat colour, big wording, like the city's billboards.
function makeSignTexture(lines, bgHex, fgHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexCss(bgHex);
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = hexCss(fgHex);
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = hexCss(fgHex);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 56px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, 256, 256 / (lines.length + 1) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ShopsSystem {
  constructor(game) {
    this.game = game;
    this.open = null; // 'gun' | 'garage' | null
    this._pulse = 0;
    this._markers = [];
    this._buildMarkers();
    this._buildMenu();
  }

  // ---- markers ----------------------------------------------------------

  _buildMarkers() {
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const defs = [
      { key: 'gun', def: shops.gunShop, color: 0xffd23f, signBg: 0x274b63, signFg: 0xffd27a },
      { key: 'garage', def: shops.garage, color: 0x4aa3ff, signBg: 0x2e5d43, signFg: 0xffffff },
    ];
    for (const { key, def, color, signBg, signFg } of defs) {
      if (!def) continue;
      const group = new THREE.Group();
      const ringGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.25, 24, 1, true);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.4;
      group.add(ring);
      const discGeo = new THREE.CircleGeometry(4.3, 24);
      const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.35;
      group.add(disc);
      // A sign on posts beside the ring, facing the road.
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 4.5),
        new THREE.MeshLambertMaterial({ map: makeSignTexture([def.name.toUpperCase()], signBg, signFg) }),
      );
      panel.position.set(6.5, 5, 0);
      panel.castShadow = true;
      group.add(panel);
      const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 5, 6);
      const postMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
      for (const off of [-2.5, 2.5]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(6.5 + off, 2.5, 0);
        group.add(post);
      }
      group.position.set(def.x, 0, def.z);
      if (this.game.scene) this.game.scene.add(group);
      this._markers.push({ key, group, ring, def });
    }
  }

  // ---- menu --------------------------------------------------------------

  _buildMenu() {
    const style = document.createElement('style');
    style.textContent = [
      '#solbay-shop{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(8,14,22,.72);font-family:Arial,Helvetica,sans-serif;color:#fff}',
      '#solbay-shop .card{background:rgba(12,22,34,.96);border:2px solid #ffd23f;border-radius:14px;padding:28px 34px;width:560px;max-width:92vw;text-align:left;box-shadow:0 12px 50px rgba(0,0,0,.6)}',
      '#solbay-shop h2{font-size:28px;letter-spacing:3px;margin:0 0 4px;color:#ffd23f}',
      '#solbay-shop .sub{font-size:14px;color:#b9c7d4;margin:0 0 14px}',
      '#solbay-shop .money{font-size:18px;font-weight:700;margin:0 0 12px}',
      '#solbay-shop .row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.14)}',
      '#solbay-shop .row .info{flex:1}',
      '#solbay-shop .row .name{font-size:16px;font-weight:700}',
      '#solbay-shop .row .desc{font-size:13px;color:#b9c7d4;margin-top:2px}',
      '#solbay-shop .row button{flex:0 0 auto;padding:9px 18px;font-size:15px;font-weight:700;cursor:pointer;border-radius:8px;border:2px solid #ffd23f;background:#ffd23f;color:#16222e}',
      '#solbay-shop .row button:disabled{background:transparent;color:#8fa3b5;border-color:#5a6a78;cursor:default}',
      '#solbay-shop .close{margin-top:16px;width:100%;padding:12px 20px;font-size:16px;font-weight:700;cursor:pointer;border-radius:8px;border:2px solid #ffd23f;background:transparent;color:#ffd23f}',
    ].join('\n');
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'solbay-shop';
    overlay.innerHTML = '<div class="card" id="solbay-shop-card"></div>';
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._card = overlay.querySelector('#solbay-shop-card');
    // Escape is owned by main.js: while the shop is open it closes the
    // shop instead of toggling pause, so no listener is needed here.
  }

  isOpen() {
    return this.open !== null;
  }

  // ---- proximity ----------------------------------------------------------

  _playerPos() {
    const p = this.game.player;
    if (p && p.position) return p.position;
    return { x: 0, z: 0 };
  }

  nearGunShop() {
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const def = shops.gunShop;
    if (!def) return false;
    const p = this._playerPos();
    return dist2d(p.x, p.z, def.x, def.z) < 6;
  }

  nearGarage() {
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const def = shops.garage;
    if (!def) return false;
    const p = this._playerPos();
    return dist2d(p.x, p.z, def.x, def.z) < 8;
  }

  // ---- opening ------------------------------------------------------------

  openGunShop() {
    if (this.open) return false;
    if (this.game.player && !this.game.player.onFoot) return false;
    if (!this.nearGunShop()) return false;
    this.open = 'gun';
    this._pause(true);
    this._render();
    return true;
  }

  openGarage() {
    if (this.open) return false;
    const player = this.game.player;
    if (!player || player.onFoot || !player.vehicle) return false;
    if (!this.nearGarage()) return false;
    this.open = 'garage';
    this._pause(true);
    this._render();
    return true;
  }

  close() {
    if (!this.open) return;
    this.open = null;
    this._pause(false);
    if (this._overlay) this._overlay.style.display = 'none';
  }

  _pause(on) {
    const state = this.game.state;
    if (state) state.paused = !!on;
  }

  // ---- items --------------------------------------------------------------

  _gunItems() {
    const state = this.game.state;
    const w = (this.game.config && this.game.config.weapons) || CONFIG.weapons || {};
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const money = state ? state.money : 0;
    const owned = state && state.weapons ? state.weapons : { smg: {}, shotgun: {} };
    const armed = !!(state && state.player && state.player.armed);
    const items = [];
    if (!armed) {
      items.push({
        id: 'pistol', name: w.pistol ? w.pistol.name : 'Pistol',
        desc: 'A reliable sidearm. Infinite ammo — yours for good.',
        price: w.pistol ? w.pistol.price : 250,
        disabled: money < (w.pistol ? w.pistol.price : 250),
        label: '$' + (w.pistol ? w.pistol.price : 250),
      });
    }
    items.push({
      id: 'smg',
      name: w.smg ? w.smg.name : 'SMG',
      desc: owned.smg && owned.smg.owned
        ? `Owned — ${owned.smg.ammo || 0} rounds in the mag.`
        : `Fast and hungry. Includes ${w.smg ? w.smg.ammoPerBox : 120} rounds.`,
      price: w.smg ? w.smg.price : 800,
      disabled: !!(owned.smg && owned.smg.owned) || money < (w.smg ? w.smg.price : 800),
      label: (owned.smg && owned.smg.owned) ? 'OWNED' : '$' + (w.smg ? w.smg.price : 800),
    });
    items.push({
      id: 'shotgun',
      name: w.shotgun ? w.shotgun.name : 'Shotgun',
      desc: owned.shotgun && owned.shotgun.owned
        ? `Owned — ${owned.shotgun.ammo || 0} shells left.`
        : `Close-range burst. Includes ${w.shotgun ? w.shotgun.ammoPerBox : 24} shells.`,
      price: w.shotgun ? w.shotgun.price : 1200,
      disabled: !!(owned.shotgun && owned.shotgun.owned) || money < (w.shotgun ? w.shotgun.price : 1200),
      label: (owned.shotgun && owned.shotgun.owned) ? 'OWNED' : '$' + (w.shotgun ? w.shotgun.price : 1200),
    });
    if (owned.smg && owned.smg.owned) {
      items.push({
        id: 'smg-ammo',
        name: 'SMG Ammo',
        desc: `${w.smg ? w.smg.ammoPerBox : 120} rounds for the Bay Sweeper.`,
        price: w.smg ? w.smg.ammoPrice : 80,
        disabled: money < (w.smg ? w.smg.ammoPrice : 80),
        label: '$' + (w.smg ? w.smg.ammoPrice : 80),
      });
    }
    if (owned.shotgun && owned.shotgun.owned) {
      items.push({
        id: 'shotgun-ammo',
        name: 'Shotgun Shells',
        desc: `${w.shotgun ? w.shotgun.ammoPerBox : 24} shells for the Pier Scatter.`,
        price: w.shotgun ? w.shotgun.ammoPrice : 60,
        disabled: money < (w.shotgun ? w.shotgun.ammoPrice : 60),
        label: '$' + (w.shotgun ? w.shotgun.ammoPrice : 60),
      });
    }
    items.push({
      id: 'armor',
      name: 'Kevlar Vest',
      desc: state && state.armor >= 100
        ? 'Already at full armour.'
        : 'Full 100 armour. Damage hits the vest before it hits you.',
      price: shops.armorPrice || 400,
      disabled: !!(state && state.armor >= 100) || money < (shops.armorPrice || 400),
      label: (state && state.armor >= 100) ? 'FULL' : '$' + (shops.armorPrice || 400),
    });
    return items;
  }

  _garageItems() {
    const state = this.game.state;
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const money = state ? state.money : 0;
    const player = this.game.player;
    const car = player ? player.vehicle : null;
    const cond = car ? Math.round(car.condition ?? 100) : 100;
    const wanted = state ? state.wanted : 0;
    return [
      {
        id: 'repair',
        name: 'Full Repair',
        desc: cond >= 100 ? 'The car is already in perfect shape.' : `Condition ${cond}% — back to 100%.`,
        price: shops.repairPrice || 150,
        disabled: cond >= 100 || money < (shops.repairPrice || 150),
        label: cond >= 100 ? 'PERFECT' : '$' + (shops.repairPrice || 150),
      },
      {
        id: 'respray',
        name: 'Respray + Clean Slate',
        desc: wanted > 0
          ? `A fresh coat and a new plate — the ${wanted}-star heat is gone.`
          : 'A fresh coat of paint. Nobody recognises the car after.',
        price: shops.resprayPrice || 200,
        disabled: money < (shops.resprayPrice || 200),
        label: '$' + (shops.resprayPrice || 200),
      },
    ];
  }

  _render() {
    if (!this.open || !this._card) return;
    const state = this.game.state;
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const isGun = this.open === 'gun';
    const title = isGun
      ? (shops.gunShop ? shops.gunShop.name : 'Harbor Arms')
      : (shops.garage ? shops.garage.name : "Rook's Garage");
    const sub = isGun
      ? 'Guns, ammo and armour. Cash only, no questions asked.'
      : 'Repairs and resprays. Drive in, drive out clean.';
    const items = isGun ? this._gunItems() : this._garageItems();
    const money = state ? Math.floor(state.money) : 0;
    const rows = items.map((it) => [
      '<div class="row"><div class="info"><div class="name">', it.name,
      '</div><div class="desc">', it.desc,
      '</div></div><button data-buy="', it.id, '"',
      it.disabled ? ' disabled' : '', '>', it.label, '</button></div>',
    ].join(''));
    this._card.innerHTML = [
      '<h2>', title.toUpperCase(), '</h2>',
      '<p class="sub">', sub, '</p>',
      '<p class="money">Cash: $', money.toLocaleString('en-US'), '</p>',
      rows.join(''),
      '<button class="close" id="solbay-shop-close">Close — back to the street</button>',
    ].join('');
    const closeBtn = this._card.querySelector('#solbay-shop-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    const buyBtns = this._card.querySelectorAll('[data-buy]');
    buyBtns.forEach((btn) => {
      btn.addEventListener('click', () => this._buy(btn.getAttribute('data-buy')));
    });
    this._overlay.style.display = 'flex';
  }

  // ---- buying --------------------------------------------------------------

  _buy(id) {
    const state = this.game.state;
    if (!state) return;
    const w = (this.game.config && this.game.config.weapons) || CONFIG.weapons || {};
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    const hud = this.game.hud;
    const toast = (m) => { if (hud) hud.toast(m); };
    const pay = (price) => {
      if (state.money < price) {
        toast('Not enough cash for that.');
        return false;
      }
      addMoney(state, -price);
      return true;
    };

    if (id === 'pistol') {
      const price = w.pistol ? w.pistol.price : 250;
      if (!pay(price)) return;
      state.player.armed = true;
      if (state.weapons) state.weapons.current = 'pistol';
      toast('Pistol bought — press 1 to draw it.');
    } else if (id === 'smg') {
      const price = w.smg ? w.smg.price : 800;
      if (!pay(price)) return;
      if (!state.weapons) state.weapons = { current: 'pistol', smg: {}, shotgun: {} };
      state.weapons.smg = { owned: true, ammo: w.smg ? w.smg.ammoPerBox : 120 };
      state.weapons.current = 'smg';
      if (state.player) state.player.armed = true;
      toast('Bay Sweeper SMG bought — press 2 to draw it.');
    } else if (id === 'shotgun') {
      const price = w.shotgun ? w.shotgun.price : 1200;
      if (!pay(price)) return;
      if (!state.weapons) state.weapons = { current: 'pistol', smg: {}, shotgun: {} };
      state.weapons.shotgun = { owned: true, ammo: w.shotgun ? w.shotgun.ammoPerBox : 24 };
      state.weapons.current = 'shotgun';
      if (state.player) state.player.armed = true;
      toast('Pier Scatter shotgun bought — press 3 to draw it.');
    } else if (id === 'smg-ammo') {
      const price = w.smg ? w.smg.ammoPrice : 80;
      if (!pay(price)) return;
      if (state.weapons && state.weapons.smg) {
        state.weapons.smg.ammo = (state.weapons.smg.ammo || 0) + (w.smg ? w.smg.ammoPerBox : 120);
      }
      toast('SMG ammo restocked.');
    } else if (id === 'shotgun-ammo') {
      const price = w.shotgun ? w.shotgun.ammoPrice : 60;
      if (!pay(price)) return;
      if (state.weapons && state.weapons.shotgun) {
        state.weapons.shotgun.ammo = (state.weapons.shotgun.ammo || 0) + (w.shotgun ? w.shotgun.ammoPerBox : 24);
      }
      toast('Shotgun shells restocked.');
    } else if (id === 'armor') {
      const price = shops.armorPrice || 400;
      if (!pay(price)) return;
      state.armor = 100;
      toast('Kevlar vest on — armour 100.');
    } else if (id === 'repair') {
      const price = shops.repairPrice || 150;
      if (!pay(price)) return;
      const car = this.game.player ? this.game.player.vehicle : null;
      if (this.game.vehicles && typeof this.game.vehicles.repair === 'function') {
        this.game.vehicles.repair(car);
      } else if (car) {
        car.condition = 100;
      }
      toast('Car repaired — condition 100%.');
    } else if (id === 'respray') {
      const price = shops.resprayPrice || 200;
      if (!pay(price)) return;
      const car = this.game.player ? this.game.player.vehicle : null;
      if (this.game.vehicles && typeof this.game.vehicles.respray === 'function') {
        this.game.vehicles.respray(car);
      }
      if (this.game.police && typeof this.game.police.clearHeat === 'function') {
        this.game.police.clearHeat();
      } else if (state) {
        state.wanted = 0;
      }
      toast('Fresh paint, clean slate — the heat is gone.');
    } else {
      return;
    }
    if (this.game.save) this.game.save.save();
    this._render();
  }

  // ---- main loop ------------------------------------------------------------

  update(dt) {
    const state = this.game.state;
    if (!state || state.paused || state.endState) return;
    this._pulse += dt;
    // The rings breathe so the shops read as places, not props.
    for (const m of this._markers) {
      const s = 1 + Math.sin(this._pulse * 2) * 0.05;
      if (m.ring) m.ring.scale.set(s, 1, s);
    }
    // Prompts: E at Harbor Arms on foot, G at the garage in a car.
    // Only ever hide a prompt this system showed — other systems (missions)
    // set their own prompts, and this must not clear them.
    const hud = this.game.hud;
    if (!hud || this.open) return;
    const player = this.game.player;
    if (!player) return;
    const shops = (this.game.config && this.game.config.shops) || CONFIG.shops || {};
    if (player.onFoot && this.nearGunShop()) {
      hud.showPrompt(`Press E — ${shops.gunShop ? shops.gunShop.name : 'Harbor Arms'}`);
      this._promptShown = true;
    } else if (!player.onFoot && player.vehicle && this.nearGarage()) {
      hud.showPrompt(`Press G — ${shops.garage ? shops.garage.name : "Rook's Garage"}`);
      this._promptShown = true;
    } else if (this._promptShown) {
      hud.hidePrompt();
      this._promptShown = false;
    }
  }

  reset() {
    this.close();
  }
}
