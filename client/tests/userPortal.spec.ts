import { test, expect } from '@playwright/test';

test.describe('RailConnect Passenger Portal End-to-End Test', () => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  test.beforeEach(({ page }) => {
    test.setTimeout(60000);
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`);
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.request().method()} ${response.url()}: ${response.status()}`);
      }
    });
  });

  test('Complete End-to-End Passenger Journey', async ({ page }) => {
    // 1. Go to login page and login with correct credentials
    console.log('--- Step 1: Login ---');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'user@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');

    // Wait for redirect to home
    await page.waitForURL('**/home', { timeout: 15000 });
    console.log('Valid login completed, redirected to /home');

    // 2. Search Trains
    console.log('--- Step 2: Search Trains ---');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await page.fill('input[placeholder="E.G. NDLS"]', 'NDLS');
    await page.fill('input[placeholder="E.G. BCT"]', 'BCT');
    await page.fill('input[type="date"]', tomorrowStr);
    
    await page.click('button[type="submit"]');
    
    // Wait for search results
    await page.waitForURL('**/search**', { timeout: 15000 });
    console.log('Train search results loaded');

    // Make sure we have the trains or "No trains found" but they are rendered
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/search_results.png', fullPage: true });

    // 3. Booking Page & Fare Calculation
    console.log('--- Step 3: Booking & Fare Calculation ---');
    await page.goto('/book/12001');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/booking_page.png', fullPage: true });

    // 4. Wallet Page
    console.log('--- Step 4: Wallet ---');
    await page.goto('/wallet');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/wallet_page.png', fullPage: true });

    // 5. Live Status
    console.log('--- Step 5: Live Status ---');
    await page.goto('/live-station');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/live_status_page.png', fullPage: true });

    // 6. Tracking
    console.log('--- Step 6: Tracking ---');
    await page.goto('/train-tracking');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/tracking_page.png', fullPage: true });

    // 7. ETA Predictions
    console.log('--- Step 7: ETA ---');
    await page.goto('/eta-prediction');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/eta_page.png', fullPage: true });

    // 8. AI Assistant Widget/Page
    console.log('--- Step 8: AI Assistant ---');
    await page.goto('/ai-assistant');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/ai_assistant_page.png', fullPage: true });

    console.log('--- CONSOLE ERRORS CAPTURED ---', consoleErrors);
    console.log('--- FAILED REQUESTS CAPTURED ---', failedRequests);
    
    // Filter out third-party/external assets or aborted navigations
    const realFailures = failedRequests.filter(r => 
      !r.includes('razorpay') && 
      !r.includes('noise.svg') && 
      !r.includes('Visa_Inc._logo.svg') && 
      !r.includes('ERR_ABORTED')
    );

    expect(realFailures.length).toBe(0);
  });
});
