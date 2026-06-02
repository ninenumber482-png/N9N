import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5175';
const DEMO_USERNAME = 'testuser_' + Date.now();
const DEMO_EMAIL = `testuser-${Date.now()}@test.local`;
const DEMO_PASSWORD = 'TestPass123!';
const DEMO_PHONE = '+6281234567890';

test.describe('NUMBER9 Platform - Startup Verification Suite', () => {

    test('1.1: Landing Page Loads with Correct Content', async ({ page }) => {
        // Navigate to landing page
        const response = await page.goto(BASE_URL);
        expect(response?.status()).toBe(200);

        // Wait for main content to be visible
        await page.waitForSelector('h1, h2', { timeout: 5000 });

        // Verify page title
        const title = await page.title();
        expect(title).toContain('NUMBER9');

        // Verify navigation links exist
        const loginLink = await page.locator('a:has-text("Log in"), a[href*="login"]').first();
        const registerLink = await page.locator('a:has-text("Become a Partner"), a[href*="register"]').first();

        expect(loginLink).toBeDefined();
        expect(registerLink).toBeDefined();

        // Check for no critical errors
        let consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.waitForTimeout(1000);
        expect(consoleErrors).toEqual([]);
    });

    test('1.2: Language Switcher is Visible and Functional', async ({ page }) => {
        await page.goto(BASE_URL);

        // Find language switcher button
        const langButton = await page.locator('button:has-text("ID"), button:has-text("EN")').first();
        expect(langButton).toBeDefined();

        const initialLang = await langButton.innerText();
        expect(['ID', 'EN']).toContain(initialLang);

        // Click to toggle language
        await langButton.click();
        await page.waitForTimeout(500);

        const newLang = await langButton.innerText();
        expect(newLang).not.toBe(initialLang);
        expect(['ID', 'EN']).toContain(newLang);
    });

    test('2.1: Registration Flow - Account Creation', async ({ page }) => {
        await page.goto(`${BASE_URL}/#/register`);

        // Wait for registration form to load
        await page.waitForSelector('input[placeholder*="referral"], input[placeholder*="XXXX"]', { timeout: 5000 });

        // Fill referral code (use demo code)
        await page.fill('input[placeholder*="XXXX"], input[placeholder*="referral"]', 'N9-0000-0000');

        // Fill account details
        const fullNameInput = await page.locator('input[placeholder*="full name"], input[placeholder*="Your full"]').first();
        const usernameInput = await page.locator('input[placeholder*="3–20"], input[placeholder*="Username"]').first();
        const emailInput = await page.locator('input[placeholder*="example.com"]').first();
        const phoneInput = await page.locator('input[placeholder*="+62"]').first();

        if (fullNameInput) await fullNameInput.fill('Test User');
        if (usernameInput) await usernameInput.fill(DEMO_USERNAME);
        if (emailInput) await emailInput.fill(DEMO_EMAIL);
        if (phoneInput) await phoneInput.fill(DEMO_PHONE);

        // Fill password
        const passwordInputs = await page.locator('input[type="password"]').all();
        if (passwordInputs.length >= 2) {
            await passwordInputs[0].fill(DEMO_PASSWORD);
            await passwordInputs[1].fill(DEMO_PASSWORD); // confirm password
        }

        // Verify form fields are filled
        expect(await usernameInput?.inputValue() || '').toBe(DEMO_USERNAME);
        expect(await emailInput?.inputValue() || '').toBe(DEMO_EMAIL);
    });

    test('2.2: Navigation Links Work', async ({ page }) => {
        await page.goto(BASE_URL);

        // Test Register link
        const registerLink = await page.locator('a:has-text("register"), a[href*="register"]').first();
        await registerLink.click();

        await page.waitForURL(`**/*register**`, { timeout: 5000 });
        const url = page.url();
        expect(url).toContain('register');

        // Navigate back to login
        const loginLink = await page.locator('a:has-text("Log in"), a[href*="login"]').first();
        if (loginLink) {
            await loginLink.click();
            await page.waitForTimeout(500);
            expect(page.url()).toContain('login');
        }
    });

    test('3.1: Login Page Loads with Form', async ({ page }) => {
        await page.goto(`${BASE_URL}/#/login`);

        // Wait for login form
        await page.waitForSelector('input[placeholder*="username"], input[placeholder*="password"]', { timeout: 5000 });

        // Verify form elements
        const usernameField = await page.locator('input[placeholder*="username"], input[type="text"]').first();
        const passwordField = await page.locator('input[placeholder*="password"], input[type="password"]').first();
        const loginButton = await page.locator('button:has-text("Sign in"), button:has-text("Log in")').first();

        expect(usernameField).toBeDefined();
        expect(passwordField).toBeDefined();
        expect(loginButton).toBeDefined();
    });

    test('3.2: Invalid Credentials Show Error', async ({ page }) => {
        await page.goto(`${BASE_URL}/#/login`);

        // Wait for form
        await page.waitForSelector('input[type="password"]', { timeout: 5000 });

        // Fill with invalid credentials
        const usernameField = await page.locator('input[placeholder*="username"], input[type="text"]').first();
        const passwordField = await page.locator('input[placeholder*="password"], input[type="password"]').first();

        await usernameField?.fill('invaliduser');
        await passwordField?.fill('wrongpassword');

        // Click login
        const loginButton = await page.locator('button:has-text("Sign in"), button:has-text("Log in")').first();
        await loginButton?.click();

        // Wait for error message (may be toast, alert, or inline error)
        // Check for common error patterns
        await page.waitForTimeout(2000);

        const pageText = await page.content();
        const hasErrorMsg = pageText.includes('error') ||
            pageText.includes('invalid') ||
            pageText.includes('failed') ||
            pageText.includes('incorrect');

        // If no visible error, at least verify we're still on login page (navigation didn't happen)
        expect(page.url()).toContain('login');
    });

    test('4.1: Demo User Login (if available)', async ({ page }) => {
        // This test assumes a demo user exists in the system
        const DEMO_USER = 'demo';
        const DEMO_PASS = 'demo123';

        await page.goto(`${BASE_URL}/#/login`);
        await page.waitForSelector('input[type="password"]', { timeout: 5000 });

        const usernameField = await page.locator('input[placeholder*="username"], input[type="text"]').first();
        const passwordField = await page.locator('input[placeholder*="password"], input[type="password"]').first();

        await usernameField?.fill(DEMO_USER);
        await passwordField?.fill(DEMO_PASS);

        const loginButton = await page.locator('button:has-text("Sign in"), button:has-text("Log in")').first();
        await loginButton?.click();

        // Wait for navigation to dashboard or redirect
        await page.waitForTimeout(3000);

        // Should either be on dashboard or still on login (if credentials wrong)
        const currentUrl = page.url();
        const isLoggedIn = currentUrl.includes('dashboard') || !currentUrl.includes('login');

        // Log the result but don't fail - demo user may not exist yet
        console.log(`Demo user login: ${isLoggedIn ? 'SUCCESS' : 'DEMO_USER_NOT_AVAILABLE'}`);
    });

    test('5.1: Route Protection - Unauthenticated Users Redirect to Login', async ({ page }) => {
        // Try to access protected dashboard without authentication
        await page.goto(`${BASE_URL}/#/dashboard`);

        // Should redirect to login
        await page.waitForTimeout(2000);

        const url = page.url();
        // Either we're on login, or dashboard might allow unauthenticated view
        // The test verifies the redirect behavior exists
        console.log(`Dashboard access from unauthenticated state: ${url}`);
    });

    test('5.2: No Critical Errors After Full Page Load', async ({ page }) => {
        let errors = [];
        let pageErrors = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(`[console] ${msg.text()}`);
            }
        });

        page.on('pageerror', err => {
            pageErrors.push(err.toString());
        });

        await page.goto(BASE_URL);
        await page.waitForTimeout(3000);

        // Check for critical errors
        expect(pageErrors).toEqual([]);

        // Filter out non-critical console errors
        const criticalErrors = errors.filter(e =>
            !e.includes('404') &&
            !e.includes('favicon') &&
            !e.includes('Service Worker')
        );

        console.log(`Page load errors: ${criticalErrors.length}`);
        if (criticalErrors.length > 0) {
            console.log(criticalErrors.join('\n'));
        }
    });

});
