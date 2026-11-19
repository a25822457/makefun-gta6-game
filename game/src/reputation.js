// Sol Bay: respect. Rook earns respect for jobs, escapes, kills and street
// cash; every level up raises mission pay by 5%. The titles are Sol Bay's
// own ladder — from a nobody on the marina to King of the Bay. Purely
// additive: it never blocks a mission, it just makes progress visible.
const TITLES = [
  'Nobody',
  'Small Fry',
  'Wheelman',
  'Street Hustler',
  'Bay Runner',
  'Enforcer',
  'Shot Caller',
  'Bay Legend',
  'King of the Bay',
];
const POINTS_PER_LEVEL = 100;
const MAX_LEVEL = TITLES.length;

export class ReputationSystem {
  constructor(game) {
    this.game = game;
    this.points = 0;
    this.level = 1;
  }

  title() {
    return TITLES[this.level - 1] || TITLES[TITLES.length - 1];
  }

  /** Fraction of the way to the next level (1 at the top). */
  progress() {
    if (this.level >= MAX_LEVEL) return 1;
    return (this.points - (this.level - 1) * POINTS_PER_LEVEL) / POINTS_PER_LEVEL;
  }

  /** Mission pay multiplier: +5% per level above 1. */
  multiplier() {
    return 1 + (this.level - 1) * 0.05;
  }

  /** Add respect points; toasts and returns true on a level-up. */
  addPoints(n, reason) {
    if (!n) return false;
    this.points += n;
    const next = Math.min(MAX_LEVEL, Math.floor(this.points / POINTS_PER_LEVEL) + 1);
    if (next > this.level) {
      this.level = next;
      if (this.game.hud) {
        this.game.hud.toast(`Respect up! You are now ${this.title()} — Lv.${this.level}. Mission pay +${(this.level - 1) * 5}%.`);
      }
      return true;
    }
    return false;
  }

  /** Set the total directly (loading a save). */
  setPoints(n) {
    this.points = Math.max(0, n || 0);
    this.level = Math.min(MAX_LEVEL, Math.floor(this.points / POINTS_PER_LEVEL) + 1);
  }

  reset() {
    this.points = 0;
    this.level = 1;
  }
}
