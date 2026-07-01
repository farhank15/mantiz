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
        
        # --> Assertions to verify final state
        
        # --> The hero section is visible and contains a headline with the words 'AI' and either 'lie detector', 'trust score', or 'fake' describing Mantiz as a tool that scans code diffs for cheating patterns
        await page.locator("xpath=/html/body/main/section[1]/span[3]/div").nth(0).scroll_into_view_if_needed()
        # Assert: Hero section headline element is visible on the page.
        await expect(page.locator("xpath=/html/body/main/section[1]/span[3]/div").nth(0)).to_be_visible(timeout=15000), "Hero section headline element is visible on the page."
        # Assert: Hero headline contains the token 'AI'.
        await expect(page.locator("xpath=/html/body/main/section[1]/span[3]/div").nth(0)).to_contain_text("AI", timeout=15000), "Hero headline contains the token 'AI'."
        # Assert: Hero headline contains the phrase 'lie detector'.
        await expect(page.locator("xpath=/html/body/main/section[1]/span[3]/div").nth(0)).to_contain_text("lie detector", timeout=15000), "Hero headline contains the phrase 'lie detector'."
        # Assert: Hero headline says the product scans diffs and PRs for cheating patterns.
        await expect(page.locator("xpath=/html/body/main/section[1]/span[3]/div").nth(0)).to_contain_text("Scans diffs and PRs", timeout=15000), "Hero headline says the product scans diffs and PRs for cheating patterns."
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
    