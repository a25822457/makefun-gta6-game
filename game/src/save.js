// Sol Bay: localStorage save / load. One key, one plain object, no network.
export const SAVE_KEY = 'solbay-save-v1';

export class SaveSystem {
  constructor(game) {
    this.game = game;
    this.key = SAVE_KEY;
  }

  exists() {
    try {
      return window.localStorage.getItem(this.key) !== null;
    } catch (e) {
      return false;
    }
  }

  save() {
    const state = this.game.state;
    if (!state) return false;
    // Live position lives on game.player (a Vector3); state.player.position
    // is only a snapshot, so prefer the live object when it exists.
    const live = this.game.player && this.game.player.position;
    const pos = live ? [live.x, live.y || 0, live.z]
      : (state.player && state.player.position ? state.player.position : [0, 0, 0]);
    const heading = live && this.game.player.heading !== undefined
      ? this.game.player.heading
      : (state.player ? state.player.heading : 0);
    const data = {
      money: state.money,
      health: state.health,
      armor: state.armor || 0,
      weapons: state.weapons ? {
        current: state.weapons.current,
        smg: state.weapons.smg ? { owned: !!state.weapons.smg.owned, ammo: state.weapons.smg.ammo || 0 } : { owned: false, ammo: 0 },
        shotgun: state.weapons.shotgun ? { owned: !!state.weapons.shotgun.owned, ammo: state.weapons.shotgun.ammo || 0 } : { owned: false, ammo: 0 },
      } : { current: 'pistol', smg: { owned: false, ammo: 0 }, shotgun: { owned: false, ammo: 0 } },
      missionsDone: Array.isArray(state.missionsDone) ? [...state.missionsDone] : [],
      currentMission: state.currentMission,
      armed: !!(state.player && state.player.armed),
      playerPos: [pos[0], pos[1] || 0, pos[2]],
      heading,
      timeOfDay: state.timeOfDay,
      reputation: this.game.reputation ? this.game.reputation.points : 0,
    };
    try {
      window.localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  load() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(this.key);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    const state = this.game.state;
    if (!state) return data;
    if (typeof data.money === 'number') state.money = data.money;
    if (typeof data.health === 'number') state.health = data.health;
    if (Array.isArray(data.missionsDone)) state.missionsDone = [...data.missionsDone];
    if (data.currentMission !== undefined) state.currentMission = data.currentMission;
    if (Array.isArray(data.playerPos) && data.playerPos.length >= 3) {
      state.player.position = [data.playerPos[0], data.playerPos[1] || 0, data.playerPos[2]];
    }
    if (typeof data.heading === 'number') state.player.heading = data.heading;
    if (typeof data.timeOfDay === 'number') state.timeOfDay = data.timeOfDay;
    state.player.armed = !!data.armed;
    // The saved run resumes in free roam: a half-finished mission is not
    // resumed mid-objective, so the player can restart it at its marker.
    state.currentMission = null;
    state.missionObjective = '';
    if (this.game.player && this.game.player.position && Array.isArray(data.playerPos)) {
      this.game.player.position.set(data.playerPos[0], data.playerPos[1] || 0, data.playerPos[2]);
      this.game.player.heading = typeof data.heading === 'number' ? data.heading : 0;
    }
    return data;
  }

  clear() {
    try {
      window.localStorage.removeItem(this.key);
    } catch (e) {
      // Storage unavailable — nothing to clear.
    }
  }
}
