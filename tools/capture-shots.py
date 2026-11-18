#!/usr/bin/env python3
"""Capture Sol Bay screenshots with headless Chromium (Playwright).

Serves game/ on localhost, opens each ?shot= URL from shots.json at 1280x720,
waits for the staged frame to settle, and saves a JPEG to screenshots/.
Also prints any console errors / page errors and the window.__errors list.

Usage (from the repo root):
    ~/workspace/makefun/.pw-venv/bin/python tools/capture-shots.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8901


def main() -> int:
    shots = json.loads((REPO / "shots.json").read_text())
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
                args=[
                    "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                    "--disable-gpu-sandbox",
                ],
            )
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            errors: list[str] = []
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            for shot in shots:
                url = f"http://localhost:{PORT}/{shot['query']}"
                print(f"== {shot['name']} <- {url}")
                page.goto(url)
                page.wait_for_timeout(4000)
                game_errors = page.evaluate("window.__errors || []")
                for err in game_errors:
                    errors.append(f"window.__errors: {err}")
                out = REPO / "screenshots" / shot["name"]
                page.screenshot(path=str(out), type="jpeg", quality=88)
                size = out.stat().st_size
                print(f"   saved {out.name}: {size} bytes")
                if size > 262144:
                    print("   WARNING: over the 256 KiB screenshot cap")
            browser.close()
        if errors:
            print("\n--- errors seen ---")
            for err in errors:
                print(" ", err)
            return 1
        print("\nno console/page errors")
        return 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
