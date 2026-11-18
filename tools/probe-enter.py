#!/usr/bin/env python3
"""Debug E-to-enter: dump cars near player, input edge state, onFoot after E."""
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8906


def main() -> int:
    server = subprocess.Popen(
        ["node", "serve.ts", "--port", str(PORT)],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_timeout(2500)
            page.click("#solbay-start")
            page.wait_for_timeout(1000)
            print("total cars:", page.evaluate("window.__game.vehicles.cars.length"))
            print("parked spots:", page.evaluate("window.__game.city.spawnPoints.cars.length"))
            page.evaluate(
                """() => {
                const g = window.__game;
                const car = g.city.spawnPoints.cars[0];
                g.player.position.set(car.x + 2, 0, car.z + 2);
                }"""
            )
            page.wait_for_timeout(300)
            print("nearest:", page.evaluate(
                """() => {
                const g = window.__game;
                const c = g.vehicles.nearestCar(g.player.position, 10);
                return c ? { type: c.type, d: +Math.hypot(c.position.x - g.player.position.x, c.position.z - g.player.position.z).toFixed(2), driver: c.driver } : null;
                }"""))
            page.keyboard.press("KeyE")
            page.wait_for_timeout(1500)
            print("pressed has KeyE:", page.evaluate("window.__game.input._pressed.has('KeyE')"),
                  "down has KeyE:", page.evaluate("window.__game.input._down.has('KeyE')"),
                  "onFoot:", page.evaluate("window.__game.player.onFoot"))
            page.keyboard.up("KeyE")
            page.wait_for_timeout(500)
            print("after up, onFoot:", page.evaluate("window.__game.player.onFoot"),
                  "vehicle:", page.evaluate("window.__game.player.vehicle && window.__game.player.vehicle.type"))
            print("pageerrors:", errs)
            browser.close()
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
