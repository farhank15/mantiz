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
        
        # -> Open the Benchmark page (navigate to the site's '/benchmark' page) so the dataset result cards and Trust Scores can be inspected.
        await page.goto("https://mantiz-wine.vercel.app/benchmark")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # --> Assertions to verify final state
        
        # --> The benchmark page shows at least three dataset result cards or rows, each containing a numeric Trust Score between 0 and 100
        # Assert: Dataset A (Honest) card displays the numeric Trust Score 96.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[1]/button").nth(0)).to_contain_text("96", timeout=15000), "Dataset A (Honest) card displays the numeric Trust Score 96."
        # Assert: Dataset B (Cheating) card displays the numeric Trust Score 54.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[2]/button").nth(0)).to_contain_text("54", timeout=15000), "Dataset B (Cheating) card displays the numeric Trust Score 54."
        # Assert: Dataset C (Evasion) card displays the numeric Trust Score 66.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[3]/button").nth(0)).to_contain_text("66", timeout=15000), "Dataset C (Evasion) card displays the numeric Trust Score 66."
        
        # --> Dataset A (honest code) shows a high score (80 or above), while at least one other dataset shows a lower score reflecting cheating detection
        # Assert: Dataset A displays a high Trust Score of 96.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[1]/button").nth(0)).to_contain_text("96", timeout=15000), "Dataset A displays a high Trust Score of 96."
        # Assert: Dataset B displays a lower Trust Score of 54, reflecting cheating detection.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[2]/button").nth(0)).to_contain_text("54", timeout=15000), "Dataset B displays a lower Trust Score of 54, reflecting cheating detection."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    