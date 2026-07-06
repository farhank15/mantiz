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
        
        # -> Click the 'Scan Diff' link to open the Scan page.
        # Scan Diff link
        elem = page.get_by_role('link', name='Scan Diff', exact=True)
        await elem.click(timeout=10000)
        
        # -> Paste the exact diff text into the 'Paste a git diff here...' textarea and click the 'Scan Diff' button to submit.
        # Paste a git diff here... e.g. diff --git... text area
        elem = page.locator('xpath=/html/body/main/div/div[2]/textarea')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("diff --git a/src/math.ts b/src/math.ts\n+export function add(a, b) { return a + b; }")
        
        # -> Paste the exact diff text into the 'Paste a git diff here...' textarea and click the 'Scan Diff' button to submit.
        # Scan Diff button
        elem = page.get_by_role('button', name='Scan Diff', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The Trust Score shown in the results is 80 or higher and the result label says 'Clean' or 'No Cheating Detected'
        # Assert: Expected the Trust Score to be 80 or higher.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[1]/div[1]/span").nth(0)).to_contain_text("80", timeout=15000), "Expected the Trust Score to be 80 or higher."
        # Assert: Expected the result label to say 'Clean' or 'No Cheating Detected'.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[1]/div[1]/span").nth(0)).to_contain_text("Clean", timeout=15000), "Expected the result label to say 'Clean' or 'No Cheating Detected'."
        
        # --> The findings section shows zero findings or displays a message stating the diff is clean and no cheating patterns were detected
        # Assert: Expected the findings list to be empty and no finding entries to be visible.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[3]/div[2]/div/button").nth(0)).not_to_be_visible(timeout=15000), "Expected the findings list to be empty and no finding entries to be visible."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    