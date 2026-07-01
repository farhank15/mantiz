import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()

        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        context = await browser.new_context()
        context.set_default_timeout(15000)

        page = await context.new_page()

        # Step 1: Navigate to mock-login — sets HttpOnly session cookie server-side
        # and redirects to /pr-scan in an authenticated state.
        await page.goto("https://mantiz-wine.vercel.app/api/mock-login?secret=mantiz_e2e_bypass_2026")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass

        # Assert: After mock-login redirect, the PR Scan interface is visible
        # (not a login wall). We look for the PR URL input field.
        await expect(
            page.locator("input[placeholder*='github.com'], input[type='url'], input[type='text']").first
        ).to_be_visible(timeout=15000), \
            "PR Scan input field should be visible after mock-login auth bypass"

        await asyncio.sleep(3)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
