#!/usr/bin/env python3
"""Real Chromium smoke tests for the static guest journey.

These checks run against a temporary local HTTP server. They validate browser
behavior and local asset delivery, not staging, live contacts or booking completion.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    "index.html",
    "rooms.html",
    "experiences.html",
    "dining.html",
    "about.html",
    "directions.html",
    "gallery.html",
]
VIEWPORTS = [(360, 800), (768, 1024), (1440, 900)]
FAILURES: list[str] = []
RUNTIME_ERRORS: list[str] = []
HTTP_ERRORS: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def start_server() -> tuple[subprocess.Popen[bytes], str]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(ROOT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError("Temporary static HTTP server exited before becoming ready")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return server, f"http://127.0.0.1:{port}/"
        except OSError:
            time.sleep(0.1)
    server.terminate()
    raise RuntimeError("Temporary static HTTP server did not become ready within 10 seconds")


def load_visible_images(page, page_name: str, base_url: str) -> None:
    images = page.locator("img")
    local_host = urlparse(base_url).netloc
    for index in range(images.count()):
        image = images.nth(index)
        if not image.is_visible():
            # The inactive carousel slide is checked after the browser advances it.
            continue
        try:
            image.scroll_into_view_if_needed(timeout=3000)
            details = image.evaluate(
                """async (img) => {
                  img.loading = 'eager';
                  try { await img.decode(); } catch (_) {}
                  return {
                    currentSrc: img.currentSrc,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    alt: img.getAttribute('alt')
                  };
                }"""
            )
        except Exception as error:  # keep reporting useful failures across all pages
            check(False, f"{page_name}: image {index + 1} could not be inspected: {error}")
            continue
        check(details["width"] > 0 and details["height"] > 0,
              f"{page_name}: image {index + 1} did not decode: {details['currentSrc']}")
        check(details["alt"] is not None,
              f"{page_name}: image {index + 1} is missing its alt attribute")
        source_host = urlparse(details["currentSrc"]).netloc
        check(source_host == local_host,
              f"{page_name}: browser selected a non-local image source: {details['currentSrc']}")


def check_page_contract(page, page_name: str, titles: dict[str, str]) -> None:
    title = page.title().strip()
    description = page.locator('meta[name="description"]').get_attribute("content") or ""
    check(bool(title), f"{page_name}: browser DOM has no title")
    check(bool(description.strip()), f"{page_name}: browser DOM has no meta description")
    check(title not in titles, f"{page_name}: title duplicates {titles.get(title, '')}")
    if title:
        titles[title] = page_name
    check(page.locator("main#main").count() == 1, f"{page_name}: expected exactly one main#main")
    check(page.locator("main#main").get_attribute("tabindex") == "-1",
          f"{page_name}: main must be programmatically focusable as the skip-link destination")
    check(page.locator("main h1").count() == 1, f"{page_name}: expected exactly one main h1")

    active = page.locator('#primary-navigation a[aria-current="page"]')
    check(active.count() == 1, f"{page_name}: primary navigation must identify one current page")
    if active.count() == 1:
        check(active.get_attribute("href") == page_name,
              f"{page_name}: aria-current navigation link must point to the current page")

    og_image = page.locator('meta[property="og:image"]').get_attribute("content")
    twitter_image = page.locator('meta[name="twitter:image"]').get_attribute("content")
    og_alt = page.locator('meta[property="og:image:alt"]').get_attribute("content")
    twitter_alt = page.locator('meta[name="twitter:image:alt"]').get_attribute("content")
    check(bool(og_image) and og_image == twitter_image,
          f"{page_name}: Twitter and Open Graph image paths must match")
    check(bool(og_alt and og_alt.strip()) and og_alt == twitter_alt,
          f"{page_name}: Twitter and Open Graph image alt text must match")
    check(page.locator('link[rel="canonical"]').count() == 0,
          f"{page_name}: canonical must remain gated pending host approval")
    check(page.locator('meta[property="og:url"]').count() == 0,
          f"{page_name}: og:url must remain gated pending host approval")


def check_contact_hydration(page, base_url: str) -> None:
    page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_function(
        """() => {
          const booking = document.querySelector('[data-booking-link]');
          return booking && booking.href.startsWith('https://asiatech.in/booking_engine/index3?token=');
        }""",
        timeout=7000,
    )
    booking = page.locator("[data-booking-link]").first
    check(booking.get_attribute("target") == "_blank", "Book Now must open the external provider in a new tab")
    check(set((booking.get_attribute("rel") or "").split()) >= {"noopener", "noreferrer"},
          "Book Now must protect the new tab with noopener/noreferrer")
    whatsapp = page.locator("[data-enquiry-link]").first
    check((urlparse(whatsapp.get_attribute("href") or "").hostname or "").lower() == "wa.me",
          "WhatsApp must hydrate from the central config")
    check(page.locator("[data-contact-phone]").first.get_attribute("href") == "tel:+917727047567",
          "Primary phone must hydrate from the central config")
    check(page.locator("[data-contact-alt-phone]").first.get_attribute("href") == "tel:+912992253836",
          "Alternate landline must hydrate from the central config")
    check(page.locator("[data-contact-email]").first.get_attribute("href") == "mailto:info@hotelgarhjaisal.com",
          "Email must hydrate from the central config")
    # This test only inspects links; it never navigates to the provider or submits guest data.


def check_responsive_layout(page, base_url: str) -> None:
    for width, height in VIEWPORTS:
        page.set_viewport_size({"width": width, "height": height})
        for page_name in PAGES:
            response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
            check(response is not None and response.status == 200,
                  f"{page_name} at {width}px: expected HTTP 200")
            page.wait_for_selector("main#main", timeout=5000)
            page.wait_for_timeout(80)
            dimensions = page.evaluate(
                """() => ({
                  viewport: window.innerWidth,
                  document: document.documentElement.scrollWidth,
                  body: document.body.scrollWidth
                })"""
            )
            check(dimensions["document"] <= width + 2 and dimensions["body"] <= width + 2,
                  f"{page_name} at {width}px: horizontal overflow ({dimensions})")
            if width == 360:
                bar = page.locator(".mobile-booking-bar")
                check(bar.is_visible(), f"{page_name}: mobile Book Now bar must be visible at 360px")
                box = bar.bounding_box()
                if box:
                    check(box["x"] >= -1 and box["x"] + box["width"] <= width + 1,
                          f"{page_name}: mobile booking bar exceeds viewport width")
                    check(box["y"] >= -1 and box["y"] + box["height"] <= height + 1,
                          f"{page_name}: mobile booking bar is outside the viewport")
            if width == 1440:
                check(page.locator("#primary-navigation").is_visible(),
                      f"{page_name}: desktop primary navigation must be visible")
                check(not page.locator(".menu-toggle").is_visible(),
                      f"{page_name}: mobile menu toggle must be hidden at desktop width")


def check_keyboard_navigation(page, base_url: str) -> None:
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "index.html", wait_until="domcontentloaded", timeout=15000)
    page.keyboard.press("Tab")
    focused_skip = page.evaluate(
        """() => {
          const el = document.activeElement;
          if (!el || !el.classList.contains('skip-link')) return false;
          const box = el.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }"""
    )
    check(focused_skip, "Keyboard Tab must reveal and focus the skip-to-content link")
    page.keyboard.press("Enter")
    check(page.evaluate("document.activeElement === document.querySelector('main#main')"),
          "Activating Skip to content must move keyboard focus to main content")

    toggle = page.locator(".menu-toggle")
    check(toggle.is_visible(), "Mobile navigation toggle must be visible at 360px")
    toggle.click()
    check(toggle.get_attribute("aria-expanded") == "true", "Opening mobile navigation must update aria-expanded")
    check(page.locator("#primary-navigation").evaluate("(nav) => nav.classList.contains('is-open')"),
          "Opening mobile navigation must expose the navigation panel")
    page.keyboard.press("Escape")
    check(toggle.get_attribute("aria-expanded") == "false", "Escape must close mobile navigation")
    check(page.evaluate("document.activeElement === document.querySelector('.menu-toggle')"),
          "Escape must restore focus to the menu toggle")

    page.emulate_media(reduced_motion="reduce")
    scroll_behavior = page.evaluate("getComputedStyle(document.documentElement).scrollBehavior")
    check(scroll_behavior == "auto", "Reduced-motion mode must disable smooth scrolling")
    page.emulate_media(reduced_motion="no-preference")

    toggle.click()
    page.locator('#primary-navigation a[href="rooms.html"]').click()
    page.wait_for_url("**/rooms.html", timeout=7000)
    check(page.locator('#primary-navigation a[aria-current="page"]').get_attribute("href") == "rooms.html",
          "Selecting Rooms from the mobile navigation must reach the Rooms page")


def check_carousels(page, base_url: str, browser) -> None:
    page.set_viewport_size({"width": 360, "height": 800})
    page.goto(base_url + "experiences.html", wait_until="domcontentloaded", timeout=15000)
    cards = page.locator("[data-experience-carousel]")
    check(cards.count() == 6, "Experiences page must render all six source-listed galleries")

    for index in range(cards.count()):
        card = cards.nth(index)
        label = card.get_attribute("aria-label") or f"experience carousel {index + 1}"
        controls = card.locator("[data-carousel-controls]")
        try:
            controls.wait_for(state="visible", timeout=5000)
        except Exception as error:
            check(False, f"{label}: carousel controls did not become available: {error}")
            continue
        slides = card.locator("[data-carousel-slide]")
        check(slides.count() == 2, f"{label}: expected two distinct slides")
        status = card.locator("[data-carousel-status]")
        previous = card.locator("[data-carousel-previous]")
        next_button = card.locator("[data-carousel-next]")
        check(previous.get_attribute("type") == "button" and next_button.get_attribute("type") == "button",
              f"{label}: carousel controls must be non-submitting buttons")

        next_button.click()
        check(status.inner_text().strip() == "Photo 2 of 2", f"{label}: Next must advance the live counter")
        check(slides.nth(0).is_hidden() and slides.nth(1).is_visible(),
              f"{label}: Next must switch the visible slide")
        second_image = slides.nth(1).locator("img")
        try:
            second_image.scroll_into_view_if_needed(timeout=3000)
            details = second_image.evaluate(
                """async img => {
                  try { await img.decode(); } catch (_) {}
                  return {width: img.naturalWidth, height: img.naturalHeight, alt: img.getAttribute('alt')};
                }"""
            )
            check(details["width"] > 0 and details["height"] > 0,
                  f"{label}: second image must decode in the browser")
            check(bool(details["alt"] and details["alt"].strip()),
                  f"{label}: second image must have descriptive alt text")
        except Exception as error:
            check(False, f"{label}: second slide image failed inspection: {error}")

        next_button.click()
        check(status.inner_text().strip() == "Photo 1 of 2", f"{label}: Next must wrap from last to first")
        previous.click()
        check(status.inner_text().strip() == "Photo 2 of 2", f"{label}: Previous must wrap from first to last")
        previous.click()
        check(status.inner_text().strip() == "Photo 1 of 2", f"{label}: Previous must return to first slide")

    if cards.count():
        first_status = cards.nth(0).locator("[data-carousel-status]").inner_text()
        page.wait_for_timeout(1100)
        check(cards.nth(0).locator("[data-carousel-status]").inner_text() == first_status,
              "Experience galleries must not autoplay")

    no_js = browser.new_context(java_script_enabled=False, viewport={"width": 360, "height": 800})
    try:
        fallback = no_js.new_page()
        fallback.goto(base_url + "experiences.html", wait_until="domcontentloaded", timeout=15000)
        fallback_cards = fallback.locator("[data-experience-carousel]")
        check(fallback_cards.count() == 6, "No-JavaScript fallback must retain all six experience cards")
        for index in range(fallback_cards.count()):
            card = fallback_cards.nth(index)
            slides = card.locator("[data-carousel-slide]")
            check(slides.nth(0).is_visible(), f"Experience {index + 1}: first image must remain visible without JavaScript")
            check(slides.nth(1).is_hidden(), f"Experience {index + 1}: inactive image must remain hidden without JavaScript")
            check(card.locator("[data-carousel-controls]").is_hidden(),
                  f"Experience {index + 1}: nonfunctional carousel controls must remain hidden without JavaScript")
    finally:
        no_js.close()


def main() -> int:
    server = None
    browser = None
    try:
        server, base_url = start_server()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on("pageerror", lambda error: RUNTIME_ERRORS.append(f"{page.url}: {error}"))

            def record_response(response) -> None:
                if response.url.startswith(base_url) and response.status >= 400:
                    HTTP_ERRORS.append(f"HTTP {response.status}: {response.url}")

            page.on("response", record_response)
            titles: dict[str, str] = {}
            for page_name in PAGES:
                before_errors = len(RUNTIME_ERRORS)
                response = page.goto(base_url + page_name, wait_until="domcontentloaded", timeout=15000)
                check(response is not None and response.status == 200, f"{page_name}: expected HTTP 200")
                page.wait_for_selector("main#main", timeout=5000)
                check_page_contract(page, page_name, titles)
                load_visible_images(page, page_name, base_url)
                page.evaluate("window.scrollTo(0, 0)")
                check(len(RUNTIME_ERRORS) == before_errors,
                      f"{page_name}: browser JavaScript exception(s): {RUNTIME_ERRORS[before_errors:]}")

            check_contact_hydration(page, base_url)
            check_responsive_layout(page, base_url)
            check_keyboard_navigation(page, base_url)
            check_carousels(page, base_url, browser)
            browser.close()
            browser = None

        for error in HTTP_ERRORS:
            FAILURES.append("Local resource request failed: " + error)
        for error in RUNTIME_ERRORS:
            FAILURES.append("Browser JavaScript exception: " + error)

        if FAILURES:
            print(f"FAIL: browser guest-journey smoke suite found {len(FAILURES)} issue(s)")
            for failure in FAILURES:
                print(" - " + failure)
            return 1

        print(
            "PASS: Chromium browser smoke suite covered seven pages, unique page titles, "
            "social metadata parity, local image decoding, central contact-link hydration, "
            "360/768/1440px layout, keyboard/skip-link behavior, reduced motion, six "
            "manual galleries, wraparound, no-autoplay and no-JavaScript fallback. "
            "This is local-browser QA, not staging or live-channel verification."
        )
        return 0
    except Exception as error:
        print(f"FAIL: browser smoke suite could not complete: {type(error).__name__}: {error}")
        return 1
    finally:
        if browser is not None:
            browser.close()
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
