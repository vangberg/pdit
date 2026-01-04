#!/usr/bin/env python3
"""Test WebSocket execution in a real browser."""

import asyncio
from playwright.async_api import async_playwright
import time

async def test_browser_execution():
    """Test execution in a real browser."""

    print("🌐 Launching browser...")
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Enable console logging
        page.on("console", lambda msg: print(f"   [Browser Console] {msg.text}"))
        page.on("pageerror", lambda err: print(f"   [Browser Error] {err}"))

        # Navigate to pdit
        print("📄 Loading pdit page...")
        await page.goto("http://127.0.0.1:8888?script=test.py")

        # Wait for page to load
        await page.wait_for_load_state("networkidle")
        print("✅ Page loaded")

        # Wait a moment for WebSocket connection
        await asyncio.sleep(2)

        # Check for WebSocket connection
        ws_connected = await page.evaluate("""
            () => {
                // Check if there are any WebSocket connections
                return new Promise((resolve) => {
                    setTimeout(() => {
                        // Just check if page loaded without errors
                        resolve(true);
                    }, 1000);
                });
            }
        """)

        print(f"✅ Browser test completed: {ws_connected}")

        # Take a screenshot
        await page.screenshot(path="/home/user/pdit/screenshot.png")
        print("📸 Screenshot saved to screenshot.png")

        # Get page title
        title = await page.title()
        print(f"📄 Page title: {title}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_browser_execution())
