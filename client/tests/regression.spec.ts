import { test, expect } from '@playwright/test';

test.describe('RailConnect Regression Test Suite', () => {
  test.setTimeout(120000);

  test('End-to-end regression: registration, login, admin user audit, booking, and admin ledger audit', async ({ page }) => {
    const timestamp = Date.now();
    const uniqueEmail = `user_${timestamp}@example.com`;
    const password = 'Password123!';
    const name = `Regression User ${timestamp}`;
    const mobile = '9876543210';

    // 1. Register a NEW real user through http://localhost:3000/register
    console.log(`[Regression] Registering new user: ${uniqueEmail}`);
    await page.goto('/register');
    await page.fill('#name', name);
    await page.fill('#email', uniqueEmail);
    await page.fill('#mobile', mobile);
    await page.fill('#password', password);
    await page.waitForTimeout(1000);
    
    // Using click on locator to ensure it works
    const signUpButton = page.locator('button:has-text("Sign up")');
    await expect(signUpButton).toBeEnabled();
    await signUpButton.click();

    // After registration, user is automatically logged in and redirected to /home
    await page.waitForURL('**/home', { timeout: 30000 });
    console.log('[Regression] Registration successful and redirected to home.');

    // 2. Verifies the user can login explicitly
    console.log('[Regression] Verifying user can login explicitly...');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', uniqueEmail);
    await page.fill('input[placeholder="••••••••"]', password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL('**/home', { timeout: 15000 });
    console.log('[Regression] User login verification successful.');

    // 3. Go to /admin/users (as admin), search for the new user, and verify they appear
    console.log('[Regression] Logging in as admin to verify user in /admin/users...');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/(home|admin)/, { timeout: 15000 });

    await page.goto('/admin/users');
    await page.waitForTimeout(3000);
    
    await page.fill('input[placeholder*="SEARCH ENTITY"]', uniqueEmail);
    await page.waitForTimeout(1000);
    
    const userRow = page.locator(`text=${uniqueEmail}`);
    await expect(userRow).toBeVisible({ timeout: 10000 });
    console.log('[Regression] New user found in Admin User Registry.');

    // 4. Book a ticket through the normal portal (/search -> select train -> booking page) for this user.
    console.log('[Regression] Logging in as the new user to book a ticket...');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', uniqueEmail);
    await page.fill('input[placeholder="••••••••"]', password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL('**/home', { timeout: 15000 });

    await page.goto('/home');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await page.fill('input[placeholder="E.G. NDLS"]', 'NDLS');
    await page.fill('input[placeholder="E.G. BCT"]', 'BCT');
    await page.fill('input[type="date"]', tomorrowStr);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/search**', { timeout: 15000 });
    console.log('[Regression] Searched trains successfully.');

    // Select train from search results (click class button)
    await page.locator('button:has-text("SL"), button:has-text("Available")').first().click();
    await page.waitForURL('**/book/**', { timeout: 15000 });
    console.log('[Regression] Navigated to booking page from search.');

    await page.waitForTimeout(3000);
    await page.fill('input[placeholder="PASSENGER NAME"]', name);
    await page.fill('input[placeholder="YRS"]', '30');

    await page.click('button:has-text("Confirm Booking")');
    await page.waitForURL('**/booking/confirmed/**', { timeout: 20000 });
    console.log('[Regression] Ticket booked successfully.');

    // 5. Goes to /admin and verifies the booking appears in the "Recent Transit Ledger".
    console.log('[Regression] Logging in as admin to verify booking in Recent Transit Ledger...');
    await page.goto('/login');
    await page.fill('input[placeholder="name@organization.com"]', 'admin@railconnect.com');
    await page.fill('input[placeholder="••••••••"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/(home|admin)/, { timeout: 15000 });

    await page.goto('/admin');
    await page.waitForTimeout(3000);

    const ledgerHeader = page.locator('text=Recent Transit Ledger');
    await expect(ledgerHeader).toBeVisible();

    const bookingEntry = page.locator(`text=${uniqueEmail}`);
    await expect(bookingEntry).toBeVisible({ timeout: 10000 });
    console.log('[Regression] Booking verified in Recent Transit Ledger successfully!');
  });
});
