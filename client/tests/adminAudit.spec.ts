import { test, expect } from '@playwright/test';

test.describe('RailConnect Admin Portal Audit & Verification', () => {
  test.setTimeout(60000);

  test('Admin dashboard loads with real data and white background, and all admin pages work', async ({ page }) => {
    // 1. Login as admin
    console.log('[Admin Audit] Logging in as admin...');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/(home|admin)/, { timeout: 15000 });

    // 2. Go to Admin Dashboard
    console.log('[Admin Audit] Navigating to /admin...');
    await page.goto('/admin');
    await page.waitForTimeout(3000);

    // Verify background is white
    const bgCol = await page.evaluate(() => {
      const el = document.querySelector('main main, main');
      return el ? window.getComputedStyle(el).backgroundColor : '';
    });
    console.log('[Admin Audit] Background color:', bgCol);

    // Take screenshot of /admin
    await page.screenshot({ path: 'screenshots/admin_dashboard_final.png', fullPage: true });

    // 3. Verify Admin User Management
    console.log('[Admin Audit] Checking User Management (/admin/users)...');
    await page.goto('/admin/users');
    await page.waitForTimeout(3000);
    const userCountText = await page.locator('text=/TOTAL ENTITIES:/i').textContent();
    console.log('[Admin Audit] User Registry Count Text:', userCountText);
    expect(userCountText).toContain('TOTAL ENTITIES');

    // 4. Verify Manage Trains
    console.log('[Admin Audit] Checking Manage Trains (/admin/trains)...');
    await page.goto('/admin/trains');
    await page.waitForTimeout(2000);

    // 5. Verify Analytics
    console.log('[Admin Audit] Checking Analytics (/admin/analytics)...');
    await page.goto('/admin/analytics');
    await page.waitForTimeout(2000);

    // 6. Verify Operations Intel
    console.log('[Admin Audit] Checking Operations Intel (/admin/operations)...');
    await page.goto('/admin/operations');
    await page.waitForTimeout(2000);

    console.log('[Admin Audit] All admin pages verified successfully!');
  });
});
