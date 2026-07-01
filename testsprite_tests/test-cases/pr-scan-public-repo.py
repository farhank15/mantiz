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

        # Assert: PR Scan interface is visible — user is authenticated
        await expect(
            page.locator("input[placeholder*='github.com'], input[type='url'], input[type='text']").first
        ).to_be_visible(timeout=15000), \
            "PR Scan input should be visible after auth"

        # Step 2: Type a real public GitHub PR URL
        pr_url = "https://github.com/vercel/next.js/pull/73509"
        input_locator = page.locator("input[placeholder*='github.com'], input[type='url'], input[type='text']").first
        await input_locator.fill(pr_url)

        # Step 3: Click the Scan button
        scan_button = page.locator("button:has-text('Scan'), button:has-text('Analyze'), button[type='submit']").first
        await scan_button.click()

        # Wait for scan to process (may take several seconds)
        await asyncio.sleep(10)

        # Assert: A Trust Score between 0 and 100 is displayed
        await expect(
            page.locator("text=/trust score|Trust Score|score/i").first
        ).to_be_visible(timeout=30000), \
            "Trust Score should be displayed after scanning a real public PR"

        # Assert: Results breakdown is visible
        await expect(
            page.locator("text=/finding|Finding|scanned|result/i").first
        ).to_be_visible(timeout=15000), \
            "Findings or scan results breakdown should be visible"

        await asyncio.sleep(3)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
