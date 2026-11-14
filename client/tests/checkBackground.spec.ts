import { test, expect } from '@playwright/test';

test('Verify /admin/users has white background', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
  await page.fill('input[placeholder="••••••••"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin');
  
  await page.goto('/admin/users');
  await page.waitForLoadState('networkidle');

  const bgCol = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  console.log('Body background color:', bgCol);
  
  // Checking the main container I added 'bg-white' to
  const containerBg = await page.evaluate(() => {
    const el = document.querySelector('div[class*="min-h-screen"]');
    return el ? window.getComputedStyle(el).backgroundColor : '';
  });
  console.log('Container background color:', containerBg);
  
  expect(containerBg).toBe('rgb(255, 255, 255)');
});
