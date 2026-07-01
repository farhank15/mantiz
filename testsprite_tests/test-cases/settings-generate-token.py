import asyncio
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

        # Step 1: Navigate to mock-login to authenticate
        await page.goto("https://mantiz-wine.vercel.app/api/mock-login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        # Step 2: Navigate to settings page
        await page.goto("https://mantiz-wine.vercel.app/settings")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        # Assert: Check that we are on settings page and the API Tokens section is visible
        await expect(page.locator("text=API Tokens").first).to_be_visible(timeout=15000)

        # Step 3: Type token name
        token_name_input = page.locator("input[placeholder*='Token Name'], input[placeholder*='e.g.'], input[type='text']").first
        await token_name_input.fill("hackathon-test-token")

        # Step 4: Click the Generate button
        generate_button = page.locator("button:has-text('Generate')").first
        await generate_button.click()

        # Assert: A new token copy box appears with copy instructions
        await expect(page.locator("text=Copy this token now").first).to_be_visible(timeout=15000)

        # Assert: Token appears in the active list
        await expect(page.locator("text=hackathon-test-token").first).to_be_visible(timeout=15000)

        await asyncio.sleep(3)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
