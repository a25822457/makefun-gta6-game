# Sol Bay — design contract (gta6-01)

An original open-world crime game. City: **Sol Bay**, a sun-soaked coastal city.
Hero: **Jax "Rook" Marlowe**, a driver-for-hire back in town. Fixer: **Delia Voss**.
Rival crew: **the Breakers**. Nothing from GTA or any commercial game: all names,
places, art, sounds and music are invented here.

## Tech rules (do not break these)
- `game/index.html` loads `vendor/three.min.js` (three.js 0.186.1, classic script,
  sets global `THREE`) and then `./src/main.js` as an ES module. Game code uses the
  global `THREE` — no import maps, no bare specifiers, no network anywhere.
- One `THREE.WebGLRenderer`, one scene, one game loop — all in `src/main.js`.
  Systems never create their own renderer, scene or loop.
- Coordinates: Y up, metres. North is -Z. The city is a road grid centred on (0,0).
- Deterministic world: city generation uses a seeded RNG (`src/rng.js`, seed 1 for
  screenshots). No `Math.random()` in world building.
- Every file does one job, named for it. No file may copy code from anywhere:
  write everything fresh in your session, in more than one message (draft, then
  revise). Never paste a big block from a brief or a tool result.
- Do NOT commit, push, or submit. The coordinator commits centrally.

## File map (owner in brackets)
```
game/index.html            [coord] canvas + HUD DOM overlay, loads vendor + src/main.js
game/vendor/three.min.js   [coord] vendored three.js 0.186.1 (library, not source)
game/vendor/LICENSE        [coord] three.js MIT licence
game/src/config.js         [coord] constants: city size, palette, tuning, keys
game/src/state.js          [coord] GameState object + helpers
game/src/rng.js            [city]  seeded RNG (mulberry32) + helpers
game/src/main.js           [coord] Game boot, fixed-step loop, camera, wiring, shots entry
game/src/input.js          [drive] keyboard + mouse (pointer lock) state
game/src/city.js           [city]  city build: ground, roads, buildings, beach, water,
                                   sky, lights, props; exports roadGraph + colliders
game/src/vehicles.js       [drive] Car factory + arcade car physics + enter/exit/steal
game/src/player.js         [drive] on-foot third-person controller + character mesh
game/src/traffic.js        [law]   traffic cars + pedestrians on the road graph
game/src/police.js         [law]   wanted level, police pursuit, busted/wasted
game/src/combat.js         [law]   pistol shooting, rival NPCs, damage, tracers
game/src/missions.js       [story] 5-mission story chain, objectives, markers, dialogue
game/src/hud.js            [story] DOM HUD: stars, health, money, speed, objective,
                                   prompts, toasts, damage flash, minimap canvas
game/src/audio.js          [story] WebAudio synth: engine, siren, shots, jingles, music
game/src/menus.js          [story] start screen, pause, busted/wasted, mission cards
game/src/save.js           [story] localStorage save/load (key solbay-save-v1)
game/src/shots.js          [coord] ?shot= staging: chase / city / mission / shop
game/src/postfx.js         [coord] light post-processing: warm grade + speed blur + vignette (one fullscreen pass)
```
`[city]` = city agent, `[drive]` = vehicles+player agent, `[law]` = traffic+police
agent, `[story]` = missions+HUD agent, `[coord]` = coordinator (me).

## Shared objects (import these, do not re-invent them)
- `config.js` exports `CONFIG` (see file): city dims, palette, tuning numbers, keys.
- `state.js` exports `createGameState()` and helpers `addWanted(state,n)`,
  `addMoney(state,n)`, `damagePlayer(state,n)`, `healPlayer(state,n)`.
  The live state object lives on `game.state` and every system reads/mutates it.
- `main.js` builds one `game` object and passes it to every system:
  `game = { scene, camera, renderer, state, city, input, hud, audio, ... }`.
  Systems are constructed as `new X(game)` or `createX(game)` and expose
  `update(dt)` (called every fixed step) and `reset()` where needed.
- `city.js` exports `buildCity(scene, rng)` returning
  `{ group, roadGraph, colliders, spawnPoints, bounds }` where:
  - `roadGraph.nodes` is a Map id -> `{x, z}` at every intersection;
    `roadGraph.edges` is `[{a, b, ax, az, bx, bz}]` along roads.
  - `colliders` is `[{minX, maxX, minZ, maxZ}]` (building footprints).
  - `spawnPoints` is `{ player: {x, z, heading}, cars: [{x, z, heading, type}],
    missions: { m1: {x, z}, m2: {...}, ... }, police: [{x, z}] }`.
  - `bounds` is `{ minX, maxX, minZ, maxZ }` of the drivable city.
- Collision helper lives in `city.js` and is imported by the others:
  `collideCircle(x, z, radius, colliders) -> {x, z, hit}` pushes a circle out of
  building AABBs; `clampToBounds(x, z, bounds, margin)`.

## Game flow
- Boot -> title screen (menus.showTitle) -> Start -> free roam.
- Mission markers glow in the world + on the minimap. Walk/drive into a marker
  (or press E at it) to start the mission. Objectives appear top-centre.
  Complete -> reward money, next mission unlocks, autosave. Fail (die, busted,
  timeout) -> retry card.
- Missions (all in `missions.js`):
  1. "Welcome Back" — drive Delia's courier van from the marina to the drop-off.
     Teaches driving + GPS marker.
  2. "Borrowed Wheels" — steal a sports car at the docks, shake a 1-star tail.
     Teaches stealing + wanted.
  3. "Payback at Pier 9" — shootout: clear the Breakers at the pier warehouse,
     grab the package. Teaches combat (pistol granted here).
  4. "The Long Way Home" — timed delivery across town with a 3-star chase.
  5. "King of the Bay" — finale: hit the vault truck, escape a 4-star chase,
     deliver to Delia.
- Wanted 0-5 stars. Stealing a car +1, killing +1, killing a cop +2.
  Police cars spawn by stars (1->1, 2->2, 3->3, 4->4, 5->5). Busted if a cop
  touches the player on foot while the player is slow. Wasted at 0 health.
  Wanted decays when no police can see the player for 20 s (-1 per 10 s).
- Free roam between missions: drive, steal, fight, explore. Money from
  missions + pickups (cash drops at mission sites).

## Controls (also shown on the title screen)
- WASD move / drive, Shift run (on foot), Space jump / handbrake (in car),
  mouse orbits the camera (click canvas for pointer lock), E enter/exit car
  or interact, F punch, left mouse shoot (pistol, from mission 3), R reload
  (cosmetic), M mute music, Esc pause, H toggle HUD help.

## HUD (DOM overlay, `hud.js`)
- Top-left: wanted stars (up to 5), health bar, money.
- Top-right: minimap canvas (220 px): roads, buildings, player arrow, traffic
  dots, police (blue/red), mission blip (yellow pulse). North up.
- Top-centre: current objective text + mission title.
- Bottom-right: speed (km/h) when driving, current vehicle name.
- Bottom-centre: context prompt ("Press E to steal the car").
- Damage vignette flash, crosshair dot when armed, toast messages.

## Audio (`audio.js`, all synthesized, no files)
- Engine hum (oscillator pitch follows speed), siren (two-tone), gunshot
  (noise burst), crash (noise), pickup chime, mission jingle, ambient music
  (slow synth bassline + pad, M to mute). AudioContext starts on first gesture.

## Screenshots (`shots.js`, `shots.json`)
`?shot=chase|city|mission|shop&seed=1`, fixed dt 1/30, seeded world:
- `chase` (COVER, first by name): player driving a sports car down the main
  avenue, 3-star wanted, two police cars in pursuit, HUD + minimap + objective.
- `city`: low aerial of downtown + beach at sunset, traffic and a patrol
  cruiser reading in the foreground.
- `mission`: on foot at Pier 9, mission 3 active, rivals visible, objective banner.
- `shop`: on foot at Harbor Arms, the gun shop's sign and ring, the "Press E"
  prompt, HUD + minimap. Round 7 replaced the title-screen shot: a menu
  alone shows less than a shot of a system, and the shop was round 6's
  headline feature with no screenshot showing it.
Each shot must show several systems at once and stay readable at 300 px.

## Performance budget
- Keep draw calls low: reuse geometries/materials, merge static city geometry
  where easy (BufferGeometryUtils.mergeGeometries is bundled in THREE).
  Target 60 fps on a normal laptop, and must run under headless SwiftShader
  for screenshots.

## System APIs (what each system exposes on the `game` object)
`main.js` builds `game` and passes it to every system. Systems read each other
only through `game.*` — never through globals, never by importing each other
except for the helpers named here.
- `game.scene`, `game.camera`, `game.renderer` — the one THREE scene/camera/renderer.
- `game.config` — CONFIG from `config.js`. `game.state` — the GameState object.
- `game.input` — `Input` from `input.js`:
  `isDown(code)`, `wasPressed(code)` (edge, cleared by `endFrame()`),
  `endFrame()` (clears edges + mouse deltas), `mouseDX` / `mouseDY`
  (accumulated pointer-lock movement since last `endFrame()`),
  `mouseDown` (left button held), `pointerLocked`. Clicking the canvas
  requests pointer lock.
- `game.city` — the object `buildCity(scene, rng)` returns (see above).
  `city.js` also exports `collideCircle(x, z, radius, colliders)` and
  `clampToBounds(x, z, bounds, margin)`.
- `game.player` — from `player.js`: `position` (THREE.Vector3),
  `heading` (radians), `speed`, `onFoot` (bool), `vehicle` (car or null),
  `mesh`, `enterVehicle(car)`, `exitVehicle()`, `update(dt)`.
- `game.vehicles` — from `vehicles.js`: `cars` (array of car objects),
  `spawnCar(type, x, z, heading)`, `nearestCar(pos, maxDist)`,
  `removeCar(car)`, `update(dt)`. A car object: `{ id, type, mesh, group,
  position (Vector3), heading, speed, steering, driver ('player'|'traffic'|
  'police'|null), color, tuning }`.
- `game.traffic` — from `traffic.js`: `cars`, `pedestrians`, `update(dt)`.
- `game.police` — from `police.js`: `cars` (police car objects),
  `update(dt)`, `reportCrime(stars)` (adds wanted via state helper).
- `game.combat` — from `combat.js`: `enemies` (array), `shoot(origin, dir)`,
  `spawnSquad(x, z, count)`, `update(dt)`. An enemy: `{ mesh, position,
  heading, health, alive }`.
- `game.missions` — from `missions.js`: `list` (mission definitions),
  `current` (active mission or null), `start(id)`, `complete()`, `fail(reason)`,
  `update(dt)`.
- `game.hud` — from `hud.js`: `setObjective(text)`, `toast(msg)`,
  `flashDamage()`, `showPrompt(text)` / `hidePrompt()`, `update(dt)`.
  The minimap reads `game.city.roadGraph`, `game.city.colliders`,
  `game.player`, `game.vehicles.cars`, `game.police.cars`,
  `game.missions.current`.
- `game.audio` — from `audio.js`: `unlock()` (call on first gesture),
  `setEngine(speed01, on)`, `siren(on)`, `gunshot()`, `crash()`, `chime()`,
  `jingle()`, `setMusic(on)`, `update(dt)`.
- `game.menus` — from `menus.js`: `showTitle()`, `showPause()`,
  `showEnd(kind)` (kind: 'busted' | 'wasted'), `hide()`, `visible`.
- `game.save` — from `save.js`: `save()`, `load()` (returns state patch or
  null), `clear()`, `exists()`.
- `game.shots` — from `shots.js`: `stageShot(name, game)` stages a scene.
- Every system constructor takes `game` and exposes `update(dt)`; `reset()`
  where the system holds run state (traffic, police, combat, missions).

