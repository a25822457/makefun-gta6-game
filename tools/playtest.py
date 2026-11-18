#!/usr/bin/env python3
"""Interactive playtest: title -> start -> walk -> steal car -> drive ->
pause -> save -> reload -> Continue. Reports console/page errors."""
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8905


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
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}\n{getattr(e, 'stack', '')}"))
            page.on("response", lambda r: errors.append(f"http{r.status}: {r.url}") if r.status >= 400 else None)

            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_timeout(2500)
            print("title visible:", page.evaluate("!!document.querySelector('#solbay-start')"))
            page.click("#solbay-start")
            page.wait_for_timeout(1000)
            print("started:", page.evaluate("window.__game && window.__game.state.started"))

            # Walk forward for 2 s.
            page.keyboard.down("KeyW")
            page.wait_for_timeout(2000)
            page.keyboard.up("KeyW")
            pos1 = page.evaluate("[window.__game.player.position.x, window.__game.player.position.z]")
            print("walked to:", [round(v, 1) for v in pos1], "onFoot:", page.evaluate("window.__game.player.onFoot"))

            # Teleport next to a parked car, press E to steal it, drive 3 s.
            page.evaluate(
                """() => {
                const g = window.__game;
                const car = g.city.spawnPoints.cars[0];
                g.player.position.set(car.x + 2, 0, car.z + 2);
                }"""
            )
            page.wait_for_timeout(300)
            page.keyboard.press("KeyE")
            page.wait_for_timeout(1500)
            print("in car:", page.evaluate("!window.__game.player.onFoot"),
                  "vehicle:", page.evaluate("window.__game.player.vehicle && window.__game.player.vehicle.type"))
            page.keyboard.down("KeyW")
            page.wait_for_timeout(3000)
            page.keyboard.up("KeyW")
            print("driving speed km/h:", page.evaluate("Math.round(window.__game.player.speed * 3.6)"))
            page.screenshot(path="/tmp/playtest-drive.jpg", type="jpeg", quality=85)

            # Pause menu, save, reload, Continue button.
            page.keyboard.press("Escape")
            page.wait_for_timeout(1500)
            print("pause visible:", page.evaluate("window.__game.menus.visible"))
            page.click("#solbay-save")
            page.wait_for_timeout(300)
            print("save exists:", page.evaluate("window.__game.save.exists()"))
            page.reload()
            page.wait_for_timeout(2500)
            print("continue button after reload:", page.evaluate("!!document.querySelector('#solbay-continue')"))
            page.click("#solbay-continue")
            page.wait_for_timeout(1000)
            print("resumed started:", page.evaluate("window.__game && window.__game.state.started"),
                  "money:", page.evaluate("window.__game.state.money"))
            browser.close()
        print("--- errors (%d) ---" % len(errors))
        for e in errors:
            print(" ", e)
        return 1 if errors else 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
