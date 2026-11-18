#!/usr/bin/env python3
"""Probe staged shots repeatedly: catch intermittent page errors with stacks.

Usage: probe-chase.py [shot] [reps]
  shot: chase | mission | city | start   (default chase)
  reps: number of page loads (default 1)
With reps > 1 it only reports errors (no state dump).
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8903


def one_load(pw, shot):
    browser = pw.chromium.launch(
        executable_path="/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome",
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}\n{getattr(e, 'stack', '')}"))
    page.on("response", lambda r: errors.append(f"http{r.status}: {r.url}") if r.status >= 400 else None)
    page.goto(f"http://localhost:{PORT}/?shot={shot}&seed=1")
    page.wait_for_timeout(4000)
    state = None
    if page.evaluate("!!window.__game"):
        state = page.evaluate(
            """() => {
            const g = window.__game;
            const p = g.player;
            return {
              player: { x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1),
                        speed: +(p.speed * 3.6).toFixed(1), onFoot: p.onFoot,
                        vehicle: p.vehicle ? p.vehicle.type : null },
              wanted: g.state.wanted,
              police: (g.police && g.police.cars || []).length,
              traffic: (g.traffic && g.traffic.cars || []).length,
              errors: window.__errors || [],
            };
            }"""
        )
    browser.close()
    return state, errors


def main() -> int:
    shot = sys.argv[1] if len(sys.argv) > 1 else "chase"
    reps = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    server = subprocess.Popen(
        ["node", "serve.ts", "--port", str(PORT)],
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(1.5)
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            for i in range(reps):
                state, errors = one_load(pw, shot)
                tag = f"[{shot} rep {i + 1}/{reps}]"
                if reps == 1:
                    print(json.dumps(state, indent=2))
                else:
                    print(tag, "state:", json.dumps(state), "errors:", len(errors))
                for e in errors:
                    print("  ERR:", e)
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
