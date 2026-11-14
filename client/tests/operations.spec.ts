import { test, expect } from '@playwright/test';

test('Admin operations page loads, renders charts, has white background', async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

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

  // 1. Go to login page
  await page.goto('/login');

  // 2. Perform login
  await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
  await page.fill('input[placeholder="••••••••"]', 'password123');
  await page.click('button:has-text("Sign In"), button:has-text("Sign in"), button[type="submit"]');

  // Wait for login redirection / dashboard
  await page.waitForTimeout(3000);

  // 3. Go to admin operations
  await page.goto('/admin/operations');
  await page.waitForTimeout(3000);

  // Wait for loading to finish if active
  await page.waitForSelector('text=Loading Operations Intelligence...', { state: 'detached', timeout: 15000 }).catch(() => {});

  // 4. Capture screenshot
  await page.screenshot({ path: 'screenshots/admin_operations_page.png', fullPage: true });

  // Print results to console
  console.log('--- TEST BROWSER LOGS ---');
  console.log('CONSOLE ERRORS:', consoleErrors);
  console.log('FAILED REQUESTS:', failedRequests);

  // 5. Inspect DOM for metrics
  const activeTrains = await page.locator('text=Active Trains').locator('xpath=..').textContent();
  const delayedTrains = await page.locator('text=Delayed Trains').locator('xpath=..').textContent();
  const activeEvents = await page.locator('text=Active Events').locator('xpath=..').textContent();
  const etaMae = await page.locator('text=ETA MAE').locator('xpath=..').textContent();

  console.log('ACTIVE TRAINS:', activeTrains);
  console.log('DELAYED TRAINS:', delayedTrains);
  console.log('ACTIVE EVENTS:', activeEvents);
  console.log('ETA MAE:', etaMae);

  // Check background is white
  const bodyBg = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  console.log('BODY BACKGROUND COLOR:', bodyBg);

  // Assert that background is white
  expect(bodyBg).toBe('rgb(255, 255, 255)');

  // Determine whether charts/canvas elements are rendered
  const canvases = page.locator('canvas');
  const canvasCount = await canvases.count();
  console.log('CANVAS GRAPH COUNT:', canvasCount);

  // There should be at least one and ideally 2 canvases loaded (ETA Accuracy by Station and Delay Causes & Distribution)
  expect(canvasCount).toBeGreaterThanOrEqual(1);

  // 6. Refresh Feed click and verify
  const refreshButton = page.locator('button:has-text("Refresh Feed")');
  await expect(refreshButton).toBeVisible();
  await refreshButton.click();
  await page.waitForTimeout(1000);

  // Expect no critical console errors from our code
  expect(consoleErrors.filter(e => !e.includes('razorpay')).length).toBe(0);
});
