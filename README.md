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
  gunfire (`game/src/traffic.js`).
- **Cars to steal and drive** — parked cars are free; taking a crewed car or a
  police cruiser is a crime (`game/src/vehicles.js`, `game/src/player.js`).
- **A wanted level with responding police** — stars, pursuit cruisers with
  flashing light bars, foot cops, and busted/wasted screens
  (`game/src/police.js`).
- **Missions and a story** — a 5-mission chain for Delia Voss, from a courier
  run to the vault-truck finale, with briefings, markers, rewards, and retries
  (`game/src/missions.js`).
- **Combat** — fists and, once armed, a hitscan pistol against the Breakers
  (`game/src/combat.js`).
- **HUD with minimap** — wanted stars, health, money, objective, speed, and a
  live minimap (`game/src/hud.js`).
- **Start screen, pause menu, and save** — localStorage save/continue
  (`game/src/menus.js`, `game/src/save.js`).
- **Synthesized sound** — engine, sirens, gunshots, crashes, and a music loop,
  all generated with WebAudio, no audio files (`game/src/audio.js`).

## Controls

WASD move / drive · Shift run · Space jump / handbrake · E enter car /
interact · F punch · Mouse shoot (once armed) · M music · Esc pause · H help.

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
