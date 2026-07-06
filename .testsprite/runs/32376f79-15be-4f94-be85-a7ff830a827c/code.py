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
        
        # -> Navigate to the mock login URL (/api/mock-login?secret=mantiz_e2e_bypass_2026) to authenticate the session.
        await page.goto("https://mantiz-wine.vercel.app/api/mock-login?secret=mantiz_e2e_bypass_2026")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Settings' link in the header to open the Settings page.
        # Settings link
        elem = page.get_by_role('link', name='Settings', exact=True)
        await elem.click(timeout=10000)
        
        # -> Set the 'Trust Score Threshold' slider to 60 and then toggle the 'AI-Powered Detection' switch to change its state.
        # range field
        elem = page.locator('xpath=/html/body/main/div/div[2]/div[2]/div/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("60")
        
        # -> Set the 'Trust Score Threshold' slider to 60 and then toggle the 'AI-Powered Detection' switch to change its state.
        # button
        elem = page.locator('xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Powered Detection' toggle in Settings to change its state and verify the UI reflects the change.
        # button
        elem = page.locator('xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Powered Detection' toggle to change its state and verify the UI updates to reflect the new state.
        # button
        elem = page.locator('xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'AI-Powered Detection' toggle switch (label: "AI-Powered Detection") to change its state and then verify the UI reflects the new on/off state.
        # button
        elem = page.locator('xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button')
        await elem.click(timeout=10000)
        
        # -> Click the icon inside the 'AI-Powered Detection' control to change its state, then click the 'Save Settings' button to persist the change.
        # Save Settings button
        elem = page.get_by_role('button', name='Save Settings', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the Settings page shows a threshold or Trust Score slider input control with a numeric value label
        # Assert: Expected the Trust Score slider's numeric value to be '60'.
        await expect(page.locator("xpath=/html/body/main/div/div[2]/div[2]/div[1]/input").nth(0)).to_have_value("60", timeout=15000), "Expected the Trust Score slider's numeric value to be '60'."
        
        # --> Verify an AI Detection toggle or checkbox is visible in the settings form
        await page.locator("xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button").nth(0).scroll_into_view_if_needed()
        # Assert: Expected the AI-Powered Detection toggle to be visible in the settings form.
        await expect(page.locator("xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button").nth(0)).to_be_visible(timeout=15000), "Expected the AI-Powered Detection toggle to be visible in the settings form."
        
        # --> Verify the AI Detection toggle reflects the new state (checked or unchecked, on or off) in the Settings panel
        # Assert: Expected the AI Detection toggle to reflect the new off state (aria-checked=false) in the Settings panel.
        await expect(page.locator("xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button").nth(0)).to_have_attribute("aria-checked", "false", timeout=15000), "Expected the AI Detection toggle to reflect the new off state (aria-checked=false) in the Settings panel."
        # Assert: Expected the AI Detection toggle to reflect the new off state (aria-pressed=false) in the Settings panel.
        await expect(page.locator("xpath=/html/body/main/div/div[2]/div[2]/div[3]/div/button").nth(0)).to_have_attribute("aria-pressed", "false", timeout=15000), "Expected the AI Detection toggle to reflect the new off state (aria-pressed=false) in the Settings panel."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    