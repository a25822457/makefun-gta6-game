// Sol Bay: the single shared game state. Every system reads and mutates this
// object through `game.state`; nothing keeps a private copy of the facts here.
export function createGameState() {
  return {
    // Run clock (seconds since the run started) and world clock (hours, 0-24).
    time: 0,
    timeOfDay: 16.5, // late afternoon: long warm shadows, golden light
    money: 250,
    health: 100,
    wanted: 0,
    // Game time of the last damage taken (drives health regen).
    lastDamageAt: -Infinity,
    // Seconds since any police last saw the player (drives wanted decay).
    quietSeconds: 0,
    // On-foot state: position is a [x, y, z] array, heading is yaw in radians.
    player: {
      position: [0, 0, 0],
      heading: 0,
      onFoot: true,
      vehicleId: null,
      speed: 0,
      armed: false, // pistol owned (granted in mission 3)
    },
    // Story progress.
    missionsDone: [],
    currentMission: null, // mission id, or null in free roam
    missionObjective: '',
    // Session stats, shown on the pause screen.
    stats: {
      carsStolen: 0,
      kills: 0,
      copsKilled: 0,
      missionsCompleted: 0,
      timesBusted: 0,
      timesWasted: 0,
      shotsFired: 0,
    },
    // Flags systems set for each other: 'busted' | 'wasted' | null.
    endState: null,
    muted: false,
    paused: false,
    started: false, // true once the player leaves the title screen
  };
}

/** Raise the wanted level by n stars, clamped to 0..5. */
export function addWanted(state, n) {
  state.wanted = Math.max(0, Math.min(5, state.wanted + n));
  state.quietSeconds = 0;
}

/** Add (or remove, when negative) money, never below zero. */
export function addMoney(state, n) {
  state.money = Math.max(0, state.money + n);
}

/** Hurt the player by n health. Returns true when the player is wasted. */
export function damagePlayer(state, n) {
  state.health = Math.max(0, state.health - n);
  state.lastDamageAt = state.time;
  if (state.health <= 0) {
    state.endState = 'wasted';
    state.stats.timesWasted += 1;
    return true;
  }
  return false;
}

/** Heal the player by n health, clamped to full. */
export function healPlayer(state, n) {
  state.health = Math.min(100, state.health + n);
}
