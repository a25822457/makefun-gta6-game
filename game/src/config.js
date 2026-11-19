// Sol Bay: every number the game tunes from, in one place. Units are metres,
// seconds and km/h unless a name says otherwise.
export const CONFIG = {
  title: 'Sol Bay',
  version: '1.0.0',

  // The city is a square grid of blocks with roads between them.
  city: {
    blocks: 9, // blocks per side
    blockSize: 40, // metres of buildable block
    roadWidth: 12, // metres of asphalt between blocks
    sidewalkWidth: 3,
    // Derived below in citySize().
    beachWidth: 60, // sand strip on the south edge, then water
    waterWidth: 220,
  },

  // Sun-soaked coastal palette: warm stucco, glass blue, brick, palm green.
  // The fog and sun lean warm — Sol Bay at dusk, the bay going gold.
  palette: {
    sky: 0x87b5d6,
    fog: 0xd8c9b8,
    sun: 0xffc98a,
    asphalt: 0x33363c,
    sidewalk: 0x9a938a,
    sand: 0xe0c98f,
    water: 0x2e7f9e,
    grass: 0x5d8a4a,
    building: [0xe8dcc8, 0xd9c1a3, 0xb7c4cc, 0xc9a689, 0x8fa3b5, 0xe0b48f],
    windowLit: 0xffd27a,
    windowDark: 0x2a3542,
  },

  player: {
    walkSpeed: 5,
    runSpeed: 9,
    jumpSpeed: 7,
    radius: 0.5,
    health: 100,
    regenDelay: 8, // seconds without damage before health regens
    regenRate: 8, // health per second
  },

  // Arcade car tuning, per car type: accel (m/s^2), top speed (km/h), grip.
  cars: {
    sedan: { accel: 9, topSpeed: 135, reverseSpeed: 40, steer: 0.55, grip: 0.92, color: 0x4a6fa5 },
    taxi: { accel: 9, topSpeed: 130, reverseSpeed: 40, steer: 0.55, grip: 0.92, color: 0xf2c200 },
    sports: { accel: 14, topSpeed: 190, reverseSpeed: 45, steer: 0.7, grip: 0.88, color: 0xc22727 },
    van: { accel: 7, topSpeed: 110, reverseSpeed: 35, steer: 0.45, grip: 0.95, color: 0x7a7f85 },
    truck: { accel: 6, topSpeed: 100, reverseSpeed: 30, steer: 0.4, grip: 0.96, color: 0x5b7d4f },
    police: { accel: 13, topSpeed: 175, reverseSpeed: 45, steer: 0.65, grip: 0.9, color: 0xe9edf2 },
  },

  traffic: {
    cars: 20,
    pedestrians: 32,
    carSpeed: 11, // m/s cruising
    pedSpeed: 1.4,
  },

  // Wanted: stars 0-5; active police cars per star level.
  wanted: {
    policeByStars: [0, 1, 2, 3, 4, 5],
    stealCrime: 1,
    killCrime: 1,
    killCopCrime: 2,
    decayQuietSeconds: 20, // unseen this long before stars start falling
    decaySecondsPerStar: 10,
    bustDistance: 2.2, // a cop this close to a slow player on foot busts them
    bustPlayerSpeed: 1.5,
    sightRange: 90, // police see the player this far (less behind buildings)
  },

  combat: {
    pistolDamage: 34,
    pistolRange: 60,
    pistolFireDelay: 0.28, // seconds between shots
    enemyHealth: 100,
    enemyDamage: 9,
    enemyRange: 45,
    enemyFireDelay: 0.9,
    enemyAccuracy: 0.35,
    punchDamage: 20,
    punchRange: 2.2,
  },

  // Buyable weapons (Harbor Arms). The pistol is the starter: infinite
  // ammo, granted in mission 3 (or bought early). The SMG is fast and
  // hungry; the shotgun is a close-range burst. Ammo is bought by the box.
  weapons: {
    pistol: { name: 'Pistol', price: 250, damage: 34, range: 60, fireDelay: 0.28, ammoPerBox: 0, ammoPrice: 0 },
    smg: { name: 'Bay Sweeper SMG', price: 800, damage: 22, range: 55, fireDelay: 0.11, ammoPerBox: 120, ammoPrice: 80 },
    shotgun: { name: 'Pier Scatter', price: 1200, damage: 90, range: 35, fireDelay: 0.9, ammoPerBox: 24, ammoPrice: 60 },
  },

  // Shops. Harbor Arms sells guns and armour; Rook's Garage fixes cars.
  shops: {
    armorPrice: 400, // Kevlar Vest: full 100 armour
    repairPrice: 150, // full condition restore
    resprayPrice: 200, // new paint + clears the wanted level
    gunShop: { x: 182, z: 78, name: 'Harbor Arms' },
    garage: { x: -182, z: 78, name: "Rook's Garage" },
  },

  // Car condition: crashes wear a car down; a worn car is slower.
  // Damage only accrues on hard hits, so a careful driver stays near 100.
  carCondition: {
    wallSpeed: 10, // wall scrape only hurts above this m/s
    wallDamage: 6, // max damage from one wall scrape
    crashSpeed: 8, // car-vs-car only hurts above this relative m/s
    crashDamage: 5, // max damage from one collision
    minPerformance: 0.55, // a wrecked car keeps 55% of its top speed
  },

  // Key bindings (KeyboardEvent.code values).
  keys: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    run: 'ShiftLeft',
    jump: 'Space',
    handbrake: 'Space',
    interact: 'KeyE',
    garage: 'KeyG',
    weapon1: 'Digit1',
    weapon2: 'Digit2',
    weapon3: 'Digit3',
    punch: 'KeyF',
    radio: 'KeyR',
    mute: 'KeyM',
    pause: 'Escape',
    help: 'KeyH',
  },

  // Fixed simulation step (seconds) used by the loop and the screenshot staging.
  step: 1 / 60,
  shotStep: 1 / 30,
};

/** Side length of the drivable city square, in metres. */
export function citySize() {
  const c = CONFIG.city;
  return c.blocks * c.blockSize + (c.blocks + 1) * c.roadWidth;
}

/** Half the city side, for clamping positions. */
export function cityHalf() {
  return citySize() / 2;
}
