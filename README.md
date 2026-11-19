[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/a25822457/makefun-gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/a25822457/makefun-gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Sol Bay — an open-world crime game

An original open-world crime game built for the make.fun **Make GTA 6** bounty
(`gta6-01`). Everything in it is invented here: the city of Sol Bay, Jax "Rook"
Marlowe, Delia Voss, and the Breakers crew. Nothing is taken from Rockstar's
GTA or any other commercial game.

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. No network requests: every
script, texture, sound, and font is a file under `game/` (three.js is vendored
at `game/vendor/three.min.js`).

## What is in the game

- **A city to explore on foot and by car** — a 10×10-block procedural city
  with roads, sidewalks, a beach, a pier, and a marina (`game/src/city.js`).
- **Traffic and pedestrians** who drive the road graph, yield, and flee from
  gunfire — 20 cars and 32 pedestrians keeping the streets alive
  (`game/src/traffic.js`).
- **Street-cash side jobs** — glowing cash bundles on the sidewalks, $50 a
  grab, respawning around the city so free roam always pays
  (`game/src/sidejobs.js`).
- **Cars to steal and drive** — parked cars are free; taking a crewed car or a
  police cruiser is a crime (`game/src/vehicles.js`, `game/src/player.js`).
- **A wanted level with responding police** — stars, pursuit cruisers with
  flashing light bars, foot cops, and busted/wasted screens
  (`game/src/police.js`).
- **The Bay Patrol helicopter** — at 3 stars and up, a harbour-patrol chopper
  circles overhead and pins you with a searchlight while the chase is on
  (`game/src/helicopter.js`).
- **Missions and a story** — an 8-mission chain for Delia Voss, from a courier
  run to taking back Pier 9: a beachfront sprint, an escort run, and a
  five-star finale, with briefings, character dialogue, markers, rewards,
  and retries (`game/src/missions.js`).
- **Respect** — jobs, escapes, kills and street cash earn respect, from Nobody
  up to King of the Bay; every level raises mission pay by 5%
  (`game/src/reputation.js`).
- **Sol Bay radio** — three home-grown stations (BAY 98.5 Dusk FM, SOL 107
  Street Beats, PIER 88 Tide FM), all synthesized with WebAudio; R switches
  station, M toggles it, and it comes on by itself when you drive
  (`game/src/audio.js`).
- **Harbor Arms gun shop** — walk up on foot and press E: buy a Bay Sweeper
  SMG ($800, 120 rounds) or a Pier Scatter shotgun ($1,200, 24 shells), restock
  ammo, or put on a Kevlar vest ($400, 100 armour). Weapons switch with
  1/2/3, each with its own damage, range, and fire rate, plus tracers and a
  muzzle flash (`game/src/shops.js`, `game/src/combat.js`).
- **Rook's Garage** — drive in and press G: repair the car ($150) or respray
  it ($200) — a fresh coat and a new plate clears the heat. Hard crashes wear
  the car down, and a worn car is slower (`game/src/shops.js`,
  `game/src/vehicles.js`, `game/src/police.js`).
- **Armour** — damage hits the vest before it hits you; the HUD shows a blue
  armour bar under the health bar (`game/src/state.js`, `game/src/hud.js`).
- **HUD with minimap** — wanted stars, health, armour, money, missions done,
  respect level, radio station, objective, speed, and a live minimap — plus a
  world clock (DAWN / DAY / DUSK / NIGHT), the district and street you are on,
  your current weapon and ammo, and a vehicle card (car type + condition)
  while driving (`game/src/hud.js`, `game/src/city.js`).
- **Start screen, pause menu, and save** — localStorage save/continue,
  including your respect level (`game/src/menus.js`, `game/src/save.js`).
- **Synthesized sound** — engine, sirens, gunshots, crashes, and the radio,
  all generated with WebAudio, no audio files (`game/src/audio.js`).

## Controls

WASD move / drive · Shift run · Space jump / handbrake · E enter car /
shop · G garage (in car) · F punch · Mouse shoot (once armed) · 1/2/3
pistol / SMG / shotgun · R radio station · M music · Esc pause · H help.

## Screenshots

`?shot=chase|mission|city|start&seed=1` stages a fixed scene for the
screenshots in `screenshots/` (cover first). Capture them with:

```sh
~/workspace/makefun/.pw-venv/bin/python tools/capture-shots.py
```

## Layout

```
game/            the game (static files; index.html is the entry point)
  src/           one file per system, named for what it does
  vendor/        three.js (vendored, not counted as our source)
main.ts          copies game/ + screenshots/ to /output, writes dossier.json
screenshots/    4 real renders of the game (1280×720)
tools/           screenshot capture + interactive playtest scripts
```

## License

MIT — see `LICENSE`.
