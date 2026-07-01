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
        
        # -> Paste the provided git diff into the 'Paste Diff' textarea and click the 'Scan Diff' button to submit the diff.
        # Paste a git diff here... e.g. diff --git... text area
        elem = page.locator('xpath=/html/body/main/div/div[2]/textarea')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("--- a/test/math.test.ts\n+++ b/test/math.test.ts\n@@ -1,6 +1,6 @@\n import { add } from '../src/math';\n-test('add returns correct sum', () => {\n+test.skip('add returns correct sum', () => {\n   expect(add(2, 3)).toBe(5);\n });")
        
        # -> Paste the provided git diff into the 'Paste Diff' textarea and click the 'Scan Diff' button to submit the diff.
        # Scan Diff button
        elem = page.get_by_role('button', name='Scan Diff', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The scan page shows a text area or input area where a git diff can be pasted
        await page.locator("xpath=/html/body/main/div/div[2]/textarea").nth(0).scroll_into_view_if_needed()
        # Assert: A visible textarea is present for pasting a git diff.
        await expect(page.locator("xpath=/html/body/main/div/div[2]/textarea").nth(0)).to_be_visible(timeout=15000), "A visible textarea is present for pasting a git diff."
        
        # --> A Trust Score number is displayed in the results area, clearly labelled as a score or percentage
        # Assert: The results area shows the Trust Score number “70”.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[1]/div[1]/span").nth(0)).to_have_text("70", timeout=15000), "The results area shows the Trust Score number \u201c70\u201d. "
        
        # --> At least one finding is listed in the results, with an explanation mentioning disabled assertion or test.skip
        # Assert: A finding mentions that a test or test suite is marked with .skip().
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[3]/div[2]/div/button").nth(0)).to_contain_text("Test or test suite marked with .skip()", timeout=15000), "A finding mentions that a test or test suite is marked with .skip()."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    