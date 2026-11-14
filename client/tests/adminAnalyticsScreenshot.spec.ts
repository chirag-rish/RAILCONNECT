
import { test } from '@playwright/test';

test('Take screenshot of fixed Admin Analytics', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/(home|admin)/, { timeout: 15000 });

    await page.goto('/admin/analytics');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'screenshots/admin_analytics_fixed.png', fullPage: true });
    console.log('Screenshot saved to screenshots/admin_analytics_fixed.png');
});
