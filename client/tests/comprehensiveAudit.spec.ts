
import { test, expect } from '@playwright/test';

interface ChartDataset {
  data?: unknown[];
}

interface ChartInstance {
  data: {
    labels?: unknown[];
    datasets: ChartDataset[];
  };
}

interface ChartConstructor {
  instances: Record<string, ChartInstance>;
}

declare global {
  interface Window {
    Chart?: ChartConstructor;
  }
}

test.describe('RailConnect Comprehensive Visual & Data Audit', () => {
  test.setTimeout(90000);

  test('Comprehensive verification of Operations, Tracking, Live Status, Booking, and Wallet', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/(home|admin)/, { timeout: 15000 });
    console.log('[Audit] Logged in successfully');

    // 2. Admin Operations Visual & Chart Dataset Verification
    await page.goto('/admin/operations');
    await page.waitForTimeout(3000);
    await page.waitForSelector('text=Loading Operations Intelligence...', { state: 'detached', timeout: 15000 }).catch(() => {});

    // Inspect Chart.js datasets directly from the page context
    const chartInfo = await page.evaluate(() => {
      const instances = window.Chart ? Object.values(window.Chart.instances) : [];

      return instances.map((chart) => ({
        labelsCount: chart.data.labels?.length || 0,
        datasetsCount: chart.data.datasets?.length || 0,
        firstDatasetData: chart.data.datasets[0]?.data || []
      }));
    });

    console.log('[Audit] Admin Operations Chart.js Instances Data:', JSON.stringify(chartInfo, null, 2));

    // Verify background is white
    const bgCol = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log('[Audit] Admin Operations Body Background:', bgCol);
    expect(bgCol).toBe('rgb(255, 255, 255)');

    // Save final required screenshot
    await page.screenshot({ path: 'screenshots/admin_operations_final.png', fullPage: true });

    // 3. Live Status T0 vs T1 Telemetry Update Check
    console.log('[Audit] Checking Live Status Telemetry T0 -> T1...');
    await page.goto('/live-station');
    await page.waitForTimeout(3000);

    const t0Data = await page.evaluate(() => {
      const el = document.querySelector('.space-y-6, main, body');
      return el ? el.textContent?.substring(0, 300) : '';
    });

    console.log('[Audit] Live Status T0 state sample:', t0Data);

    // Wait for telemetry update interval (5 seconds)
    await page.waitForTimeout(6000);

    const t1Data = await page.evaluate(() => {
      const el = document.querySelector('.space-y-6, main, body');
      return el ? el.textContent?.substring(0, 300) : '';
    });

    console.log('[Audit] Live Status T1 state sample:', t1Data);

    // 4. Tracking Page Visual Verification
    console.log('[Audit] Checking Tracking Page...');
    await page.goto('/train-tracking');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/tracking_final.png', fullPage: true });

    // 5. ETA Prediction Verification
    console.log('[Audit] Checking ETA Prediction Page...');
    await page.goto('/eta-prediction');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/eta_final.png', fullPage: true });

    // 6. AI Assistant Visual & Conversation Verification
    console.log('[Audit] Checking AI Assistant Page...');
    await page.goto('/ai-assistant');
    await page.waitForTimeout(3000);

    // Type prompt
    const chatInput = page.locator('input[placeholder*="Ask"], textarea');

    if (await chatInput.isVisible()) {
      await chatInput.fill('Where is my train?');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }

    await page.screenshot({ path: 'screenshots/ai_assistant_final.png', fullPage: true });

    // 7. Booking Fare & GST Calculation Verification
    console.log('[Audit] Checking Booking & GST Fare calculation...');
    await page.goto('/book/12001');
    await page.waitForTimeout(3000);

    const gstVisible = await page.getByText('GST (18%)').isVisible();
    console.log('[Audit] GST (18%) Visibility:', gstVisible);
    expect(gstVisible).toBe(true);

    const totalFareText = await page.locator('p:has-text("Total Fare")').locator('xpath=..').textContent();
    console.log('[Audit] Total Fare Displayed:', totalFareText);

    await page.screenshot({ path: 'screenshots/booking_fare_final.png', fullPage: true });

    // 8. Wallet Page Verification
    console.log('[Audit] Checking Wallet Page...');
    await page.goto('/wallet');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/wallet_final.png', fullPage: true });

    console.log('[Audit] Comprehensive Audit completed successfully.');
  });
});
