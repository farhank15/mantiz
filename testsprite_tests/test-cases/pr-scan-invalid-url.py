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
        context.set_default_timeout(20000)

        page = await context.new_page()

        # Step 1: Authenticate via mock-login
        await page.goto("https://mantiz-wine.vercel.app/api/mock-login?secret=mantiz_e2e_bypass_2026")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass

        # Assert: PR Scan input visible (authenticated)
        await expect(
            page.locator("input[placeholder*='github.com'], input[type='url'], input[type='text']").first
        ).to_be_visible(timeout=15000), "PR Scan input should be visible after auth"

        # Step 2: Type an invalid URL
        input_locator = page.locator("input[placeholder*='github.com'], input[type='url'], input[type='text']").first
        await input_locator.fill("https://example.com/not-a-real-pr")

        # Step 3: Click the Scan button
        scan_button = page.locator("button:has-text('Scan'), button:has-text('Analyze'), button[type='submit']").first
        await scan_button.click()

        await asyncio.sleep(5)

        # Assert: An error or validation message is shown — no Trust Score for invalid URL
        error_visible = await page.locator(
            "text=/invalid|Invalid|error|Error|not a valid|must be a github/i"
        ).first.is_visible()

        assert error_visible, \
            "An error/validation message should appear for invalid PR URL — not a Trust Score"

        await asyncio.sleep(2)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
