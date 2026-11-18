#!/usr/bin/env python3
"""Debug slow drive: enter parked sedan, hold W, dump speed/pos + what's ahead."""
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8907


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
            print("in car:", page.evaluate("!window.__game.player.onFoot"))
            page.keyboard.down("KeyW")
            for i in range(3):
                page.wait_for_timeout(1000)
                print(f"t={i + 1}s:", page.evaluate(
                    """() => {
                    const g = window.__game;
                    const p = g.player;
                    const ahead = g.vehicles.cars
                      .filter(c => c !== p.vehicle)
                      .map(c => ({ type: c.type, d: +Math.hypot(c.position.x - p.position.x, c.position.z - p.position.z).toFixed(1) }))
                      .sort((a, b) => a.d - b.d).slice(0, 3);
                    return { speed: Math.round(p.speed * 3.6), x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1), nearest: ahead };
                    }"""))
            page.keyboard.up("KeyW")
            print("pageerrors:", errs)
            browser.close()
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
