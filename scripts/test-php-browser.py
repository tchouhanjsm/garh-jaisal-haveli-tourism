#!/usr/bin/env python3
"""Browser acceptance for the PHP hospitality routes, not the static .html copies."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path(os.environ.get("PHP_VISUAL_EVIDENCE", "/tmp/garh-php-visual"))
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8767"
ROUTES = ("index", "about", "rooms", "gallery", "dining", "directions", "experiences", "experience-details", "booking")
VIEWPORTS = {"phone-360": (360, 780), "phone-390": (390, 844), "tablet-768": (768, 1024), "laptop-1280": (1280, 800)}
RESULTS = []

def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

server = subprocess.Popen(
    ["php", "-S", "127.0.0.1:8767", "-t", str(ROOT)],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
)
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/index.php", timeout=2).close()
            break
        except Exception:
            time.sleep(0.25)
    else:
        raise RuntimeError("PHP development server did not start")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            for vp_name, (width, height) in VIEWPORTS.items():
                context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                for route in ROUTES:
                    response = page.goto(f"{BASE}/{route}.php", wait_until="domcontentloaded", timeout=30000)
                    assert_ok(response is not None and response.status == 200, f"HTTP failed: {route}, {vp_name}")
                    page.wait_for_timeout(450)
                    assert_ok(page.locator("h1").count() == 1, f"Exactly one H1 needed: {route}, {vp_name}")
                    assert_ok(page.locator("main").count() == 1, f"Missing main: {route}, {vp_name}")
                    overflow = page.evaluate(
                        "() => ({scroll: document.documentElement.scrollWidth, width: innerWidth})"
                    )
                    assert_ok(overflow["scroll"] <= overflow["width"] + 2,
                              f"Horizontal overflow: {route}, {vp_name}: {overflow}")
                    if route != "booking":
                        assert_ok(page.locator("a[href='booking.php']").count() > 0,
                                  f"Missing enquiry CTA: {route}, {vp_name}")
                    else:
                        assert_ok(page.locator("form[method='post']").count() == 1, "Booking form missing")
                        assert_ok(page.locator("input[name='csrf']").count() == 1, "Missing CSRF input")
                        assert_ok(page.locator("a[href='#stay-enquiry-form']").count() == 1, "Missing stay enquiry jump")
                        assert_ok(page.locator("a.hotel-booking__whatsapp-link").count() == 1, "Missing verified WhatsApp fallback")
                        assert_ok(page.locator("button[type='submit']").is_disabled(),
                                  "Unconfigured email form must be disabled")
                    # One screenshot per page and viewport for visual review.
                    page.screenshot(path=str(OUTPUT / f"{route}-{vp_name}.png"),
                                    full_page=False, animations="disabled")
                    RESULTS.append({"route": route, "viewport": vp_name, "overflow": overflow})
                assert_ok(not errors, f"JS exceptions at {vp_name}: {errors[:5]}")
                context.close()
        finally:
            browser.close()
    (OUTPUT / "report.json").write_text(json.dumps(
        {"checked": len(RESULTS), "viewports": list(VIEWPORTS), "routes": list(ROUTES)},
        indent=2), encoding="utf-8")
    print(f"PASS PHP browser acceptance: {len(RESULTS)} route/viewport combinations")
finally:
    server.terminate()
    try:
        server.wait(timeout=3)
    except subprocess.TimeoutExpired:
        server.kill()
