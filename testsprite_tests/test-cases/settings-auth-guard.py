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

        # Step 1: Navigate to settings directly without any login session
        await page.goto("https://mantiz-wine.vercel.app/settings")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        # Assert: The page shows a login/sign-in warning and does not render the token list
        await expect(page.locator("text=You need to sign in with GitHub").first).to_be_visible(timeout=15000)
        await expect(page.locator("button:has-text('Generate')").first).not_to_be_visible(timeout=5000)

        await asyncio.sleep(2)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
