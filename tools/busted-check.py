#!/usr/bin/env python3
"""Focused busted/respawn check: load Sol Bay, set up a bust, verify the
player gets busted and respawns at the marina. Fast — skips the missions."""
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8908


def main() -> int:
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
            browser = pw.chromium.launch(
                executable_path="/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome",
                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
            )
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            errors = []
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_timeout(2500)
            page.click("#solbay-start")
            page.wait_for_timeout(500)
            # Same setup as the playthrough busted check, in two steps:
            # reportCrime only raises the wanted level — the cruisers spawn
            # on later update ticks, so cars[0] is empty right after the
            # call. Wait for them, then park one beside the player and step
            # a foot cop out of it.
            page.evaluate(
                """() => {
                const g = window.__game;
                g.player.position.set(26, 0, 26);
                g.player.cameraYaw = 0;
                g.police.reportCrime(2);
                }"""
            )
            page.wait_for_timeout(2000)
            page.evaluate(
                """() => {
                const g = window.__game;
                const entry = g.police.cars && g.police.cars[0];
                if (entry && entry.car && entry.car.position) {
                    entry.car.position.set(34, 0, 26);
                    if (entry.car.group) entry.car.group.position.set(34, 0, 26);
                    if (typeof g.police._spawnFootCop === 'function') {
                        g.police._spawnFootCop(entry.car);
                    }
                }
                }"""
            )
            # Step the game forward in real time and watch for the bust.
            busted = False
            for i in range(60):
                page.wait_for_timeout(1000)
                s = page.evaluate("""() => {
                    const g = window.__game;
                    return { end: g.state.endState, wanted: g.state.wanted,
                             cops: (g.police.cops || []).length,
                             police: (g.police.cars || []).length };
                }""")
                if i % 10 == 0 or s["end"]:
                    print(f"t={i + 1}s", s)
                if s["end"] == "busted":
                    busted = True
                    break
            print("BUSTED:", busted)
            if busted:
                page.click("#solbay-retry")
                page.wait_for_timeout(500)
                s = page.evaluate("""() => {
                    const g = window.__game;
                    return { end: g.state.endState,
                             pos: [g.player.position.x, g.player.position.z] };
                }""")
                print("after retry:", s)
                ok = s["end"] is None and abs(s["pos"][0] + 190) < 5 and abs(s["pos"][1] - 214) < 5
                print("RESPAWN OK:", ok)
            else:
                ok = False
            browser.close()
        print("errors:", errors)
        return 0 if (ok and not errors) else 1
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
