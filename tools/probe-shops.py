#!/usr/bin/env python3
"""Probe the round-6 systems headlessly: gun shop, garage, armour, weapons,
clock, location readout, vehicle card. Not part of the game; a dev probe.

Headless SwiftShader renders at ~1 fps, so every keypress effect is awaited
by polling for the expected state instead of fixed sleeps.
"""
import json
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8908


def show(name, obj):
    print(f"[{name}] {json.dumps(obj, ensure_ascii=False)}")


def wait_for(page, expr, timeout=20.0, desc=""):
    """Poll expr (JS, must return truthy) until it holds or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if page.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    print(f"[TIMEOUT waiting for {desc}] {expr}")
    return False


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
            page.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type == "error" else None)
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_timeout(2500)
            page.click("#solbay-start")
            wait_for(page, "window.__game.state.started", desc="game started")
            # Let a few frames run so the HUD populates.
            wait_for(page, "document.querySelector('#solbay-clock').textContent.length > 0", desc="clock text")

            # --- HUD basics -------------------------------------------------
            show("clock", page.evaluate("document.querySelector('#solbay-clock').textContent"))
            show("location-spawn", page.evaluate("document.querySelector('#solbay-location').textContent"))
            show("weapon-unarmed", page.evaluate("document.querySelector('#solbay-weapon').textContent"))
            show("armor-bar-hidden", page.evaluate("document.querySelector('#solbay-armor').style.display"))

            # --- Gun shop ---------------------------------------------------
            page.evaluate("() => { const g = window.__game; g.state.money = 5000; g.player.position.set(182, 0, 78); }")
            wait_for(page, "document.querySelector('#solbay-prompt').textContent.includes('Harbor Arms')", desc="gun prompt")
            show("prompt-near-gun", page.evaluate("document.querySelector('#solbay-prompt').textContent"))
            page.keyboard.press("KeyE")
            wait_for(page, "window.__game.shops.isOpen()", desc="shop opens")
            show("shop-open", page.evaluate("window.__game.shops.isOpen()"))
            show("shop-paused", page.evaluate("window.__game.state.paused"))
            show("shop-title", page.evaluate("document.querySelector('#solbay-shop h2').textContent"))
            show("shop-money", page.evaluate("document.querySelector('#solbay-shop .money').textContent"))
            page.click('[data-buy="smg"]')
            wait_for(page, "window.__game.state.weapons.smg.owned", desc="smg bought")
            show("after-smg", page.evaluate("() => { const g = window.__game; return { owned: g.state.weapons.smg.owned, ammo: g.state.weapons.smg.ammo, current: g.state.weapons.current, money: g.state.money }; }"))
            page.click('[data-buy="shotgun"]')
            wait_for(page, "window.__game.state.weapons.shotgun.owned", desc="shotgun bought")
            show("after-shotgun", page.evaluate("() => { const g = window.__game; return { owned: g.state.weapons.shotgun.owned, ammo: g.state.weapons.shotgun.ammo, current: g.state.weapons.current, money: g.state.money }; }"))
            page.click('[data-buy="armor"]')
            wait_for(page, "window.__game.state.armor === 100", desc="armor bought")
            show("after-armor", page.evaluate("() => { const g = window.__game; return { armor: g.state.armor, money: g.state.money }; }"))
            page.click('[data-buy="smg-ammo"]')
            wait_for(page, "window.__game.state.weapons.smg.ammo === 240", desc="smg ammo bought")
            show("after-smg-ammo", page.evaluate("() => { const g = window.__game; return { ammo: g.state.weapons.smg.ammo, money: g.state.money }; }"))
            page.click("#solbay-shop-close")
            wait_for(page, "!window.__game.shops.isOpen() && !window.__game.state.paused", desc="shop closed")
            show("shop-closed", page.evaluate("window.__game.shops.isOpen()"))
            show("unpaused", page.evaluate("window.__game.state.paused"))
            # The HUD only refreshes while the sim runs (paused in the shop),
            # so the armor bar is checked after closing.
            wait_for(page, "document.querySelector('#solbay-armor').style.display === 'block'", desc="armor bar visible")
            show("armor-bar-visible", page.evaluate("document.querySelector('#solbay-armor').style.display"))
            show("armor-bar-width", page.evaluate("document.querySelector('#solbay-armor-fill').style.width"))

            # Weapon wheel: 2 -> SMG, 3 -> shotgun, 1 -> pistol. Buying any
            # gun arms the player, so the pistol is available once armed.
            page.keyboard.press("Digit2")
            wait_for(page, "window.__game.state.weapons.current === 'smg'", desc="switch to smg")
            show("weapon-2", page.evaluate("() => { const g = window.__game; return { current: g.state.weapons.current, hud: document.querySelector('#solbay-weapon').textContent }; }"))
            page.keyboard.press("Digit3")
            wait_for(page, "window.__game.state.weapons.current === 'shotgun'", desc="switch to shotgun")
            show("weapon-3", page.evaluate("() => { const g = window.__game; return { current: g.state.weapons.current, hud: document.querySelector('#solbay-weapon').textContent }; }"))
            page.keyboard.press("Digit1")
            wait_for(page, "window.__game.state.weapons.current === 'pistol'", desc="switch to pistol")
            show("weapon-1", page.evaluate("() => { const g = window.__game; return { current: g.state.weapons.current, hud: document.querySelector('#solbay-weapon').textContent }; }"))

            # --- Garage ------------------------------------------------------
            page.evaluate("() => { const g = window.__game; const car = g.city.spawnPoints.cars[0]; g.player.position.set(car.x + 2, 0, car.z + 2); }")
            page.keyboard.press("KeyE")
            wait_for(page, "!window.__game.player.onFoot", desc="enter car")
            show("in-car", page.evaluate("() => { const g = window.__game; return { onFoot: g.player.onFoot, type: g.player.vehicle && g.player.vehicle.type }; }"))
            page.evaluate("() => { const g = window.__game; const c = g.player.vehicle; c.position.set(-182, 0, 78); c.heading = 0; c.speed = 0; c.condition = 40; g.state.wanted = 3; }")
            wait_for(page, "document.querySelector('#solbay-prompt').textContent.includes(\"Rook's Garage\")", desc="garage prompt")
            show("prompt-near-garage", page.evaluate("document.querySelector('#solbay-prompt').textContent"))
            show("vehicle-card", page.evaluate("() => { const v = document.querySelector('#solbay-vehicle'); return { display: v.style.display, name: document.querySelector('#solbay-vehicle-name').textContent }; }"))
            page.keyboard.press("KeyG")
            wait_for(page, "window.__game.shops.isOpen()", desc="garage opens")
            show("garage-open", page.evaluate("window.__game.shops.isOpen()"))
            show("garage-title", page.evaluate("document.querySelector('#solbay-shop h2').textContent"))
            page.click('[data-buy="repair"]')
            wait_for(page, "window.__game.player.vehicle.condition === 100", desc="repair done")
            show("after-repair", page.evaluate("() => { const g = window.__game; return { condition: g.player.vehicle.condition, money: g.state.money }; }"))
            before = page.evaluate("() => { const g = window.__game; return { color: g.player.vehicle.color, wanted: g.state.wanted }; }")
            page.click('[data-buy="respray"]')
            wait_for(page, "window.__game.state.wanted === 0", desc="respray clears heat")
            after = page.evaluate("() => { const g = window.__game; return { color: g.player.vehicle.color, wanted: g.state.wanted, money: g.state.money }; }")
            show("respray-before", before)
            show("respray-after", after)
            page.keyboard.press("Escape")
            wait_for(page, "!window.__game.shops.isOpen() && !window.__game.state.paused", desc="garage closed by Esc")
            show("garage-closed-esc", page.evaluate("window.__game.shops.isOpen()"))
            show("unpaused-esc", page.evaluate("window.__game.state.paused"))
            show("pause-menu-after-esc", page.evaluate("() => { const m = document.querySelector('#solbay-menu'); return m ? m.style.display : 'no-menu'; }"))

            # --- Location + clock after moving -------------------------------
            page.evaluate("() => { const g = window.__game; if (g.player.vehicle) { g.player.vehicle.position.set(26, 0, -26); } else { g.player.position.set(26, 0, -26); } }")
            wait_for(page, "document.querySelector('#solbay-location').textContent.includes('Downtown')", desc="downtown location")
            show("location-downtown", page.evaluate("document.querySelector('#solbay-location').textContent"))
            show("clock-later", page.evaluate("document.querySelector('#solbay-clock').textContent"))
            show("errors", page.evaluate("window.__errors"))

            print("pageerrors:", errs)
            browser.close()
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
