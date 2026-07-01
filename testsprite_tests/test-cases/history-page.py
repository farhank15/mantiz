import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("https://mantiz-wine.vercel.app")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Navigate to the History page by opening the URL: https://mantiz-wine.vercel.app/history and verify the page renders and displays a History heading or an empty-state/list of scans.
        await page.goto("https://mantiz-wine.vercel.app/history")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # --> Assertions to verify final state
        
        # --> The page shows either a list of previous scan entries or an empty-state message — it does not show a JavaScript error or loading spinner that never resolves
        # Assert: The empty-state shows a 'Sign In to Continue' button.
        await expect(page.locator("xpath=/html/body/main/div/div/button").nth(0)).to_have_text("Sign In to Continue", timeout=15000), "The empty-state shows a 'Sign In to Continue' button."
        await page.locator("xpath=/html/body/main/div/div/svg").nth(0).scroll_into_view_if_needed()
        # Assert: The empty-state illustration is visible on the History page.
        await expect(page.locator("xpath=/html/body/main/div/div/svg").nth(0)).to_be_visible(timeout=15000), "The empty-state illustration is visible on the History page."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    