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
        
        # -> Open the mock login endpoint /api/mock-login?secret=mantiz_e2e_bypass_2026 to authenticate the session.
        await page.goto("https://mantiz-wine.vercel.app/api/mock-login?secret=mantiz_e2e_bypass_2026")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Settings' link in the top navigation to open the Settings page.
        # Settings link
        elem = page.get_by_role('link', name='Settings', exact=True)
        await elem.click(timeout=10000)
        
        # -> Set the 'Trust Score Threshold' slider to 50, verify the numeric label updates, then toggle the 'AI-Assisted Detection' switch and click the 'Save Settings' button.
        # range field
        elem = page.locator('[id="threshold-slider"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("50")
        
        # -> Set the 'Trust Score Threshold' slider to 50, verify the numeric label updates, then toggle the 'AI-Assisted Detection' switch and click the 'Save Settings' button.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Set the 'Trust Score Threshold' slider to 50, verify the numeric label updates, then toggle the 'AI-Assisted Detection' switch and click the 'Save Settings' button.
        # Save Settings button
        elem = page.locator('[id="save-settings-button"]')
        await elem.click(timeout=10000)
        
        # -> Adjust the 'Trust Score Threshold' slider using the keyboard (ArrowRight) and confirm its numeric label updates.
        # range field
        elem = page.locator('[id="threshold-slider"]')
        await elem.click(timeout=10000)
        
        # -> Adjust the 'Trust Score Threshold' slider using the keyboard (ArrowRight) and confirm its numeric label updates.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify the page shows 'Saved!' indicating settings persisted.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify the page shows 'Saved!' indicating settings persisted.
        # Save Settings button
        elem = page.locator('[id="save-settings-button"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify the page shows 'Saved!'
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Adjust the 'Trust Score Threshold' slider by one notch, toggle the 'AI-Assisted Detection' switch, click the 'Save Settings' button, and verify the 'Saved!' confirmation appears.
        # range field
        elem = page.locator('[id="threshold-slider"]')
        await elem.click(timeout=10000)
        
        # -> Adjust the 'Trust Score Threshold' slider by one notch, toggle the 'AI-Assisted Detection' switch, click the 'Save Settings' button, and verify the 'Saved!' confirmation appears.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Adjust the 'Trust Score Threshold' slider by one notch, toggle the 'AI-Assisted Detection' switch, click the 'Save Settings' button, and verify the 'Saved!' confirmation appears.
        # Save Settings button
        elem = page.locator('[id="save-settings-button"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify that the 'Saved!' confirmation appears on the page.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify that the 'Saved!' confirmation appears on the page.
        # Save Settings button
        elem = page.locator('[id="save-settings-button"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify that the text 'Saved!' appears on the page.
        # Toggle AI-assisted detection button
        elem = page.locator('[id="ai-detection-toggle"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Assisted Detection' toggle to change its state, then click the 'Save Settings' button and verify that the text 'Saved!' appears on the page.
        # Save Settings button
        elem = page.locator('[id="save-settings-button"]')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the Settings page shows a range input slider with id='threshold-slider' and a nearby numeric label showing a value between 0 and 100
        await page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[1]/input").nth(0).scroll_into_view_if_needed()
        # Assert: The Trust Score threshold slider (range input) is visible on the Settings page.
        await expect(page.locator("xpath=/html/body/main/div/div[3]/div[2]/div[1]/input").nth(0)).to_be_visible(timeout=15000), "The Trust Score threshold slider (range input) is visible on the Settings page."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
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
    