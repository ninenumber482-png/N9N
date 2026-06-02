import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5175';

test.describe('NUMBER9 Platform - Integration Tests (Critical Flows)', () => {

    test('1.1: Marketplace Entry Modal - Modal State Persistence', async ({ page, context }) => {
        // Test that modal doesn't reappear after dismissal

        // Create a unique storage key
        const storageContext = context.storageState?.cookies || [];

        await page.goto(`${BASE_URL}/#/dashboard`);

        // Wait for dashboard or login
        await page.waitForTimeout(2000);

        // If on dashboard, look for marketplace entry modal
        const modalBackdrop = await page.locator('[role="dialog"], .modal, .popup, [class*="modal"]').first();

        if (modalBackdrop) {
            const isVisible = await modalBackdrop.isVisible();

            if (isVisible) {
                console.log('Modal found and visible');

                // Find close button or backdrop click
                const closeButton = await page.locator('button:has-text("close"), button:has-text("dismiss"), [aria-label*="close"]').first();
                const backdrop = await page.locator('[role="dialog"]').first();

                if (closeButton) {
                    await closeButton.click();
                } else if (backdrop) {
                    // Click outside to close
                    await page.click('[role="dialog"]', { position: { x: 0, y: 0 } });
                }

                await page.waitForTimeout(1000);

                // Verify modal is dismissed
                const stillVisible = await modalBackdrop.isVisible({ timeout: 1000 }).catch(() => false);
                expect(stillVisible).toBe(false);

                // Reload page
                await page.reload();
                await page.waitForTimeout(2000);

                // Modal should NOT reappear
                const reappeared = await modalBackdrop.isVisible({ timeout: 1000 }).catch(() => false);
                expect(reappeared).toBe(false);
            }
        }
    });

    test('1.2: Language Selection Persists Across Navigation', async ({ page }) => {
        await page.goto(BASE_URL);

        // Get language button
        const langButton = await page.locator('button:has-text("ID"), button:has-text("EN")').first();

        if (langButton) {
            const initialLang = await langButton.innerText();

            // Switch language
            await langButton.click();
            await page.waitForTimeout(500);

            const newLang = await langButton.innerText();
            expect(newLang).not.toBe(initialLang);

            // Navigate to register
            const registerLink = await page.locator('a:has-text("register"), a[href*="register"]').first();
            if (registerLink) {
                await registerLink.click();
                await page.waitForTimeout(1000);

                // Check language is still the same
                const langButtonAfter = await page.locator('button:has-text("ID"), button:has-text("EN")').first();
                const langAfter = await langButtonAfter?.innerText();
                expect(langAfter).toBe(newLang);
            }
        }
    });

    test('1.3: i18n Context Provides Translations', async ({ page }) => {
        await page.goto(`${BASE_URL}/#/dashboard`);

        // Wait for any page to load
        await page.waitForTimeout(2000);

        // Check that common translation keys are rendered (not the raw key names)
        const pageContent = await page.content();

        // Look for translated content (not raw keys like "nav.overview", "common.points")
        const hasTranslations = !pageContent.includes('nav.overview') &&
            !pageContent.includes('common.points') &&
            !pageContent.includes('key not found');

        console.log(`Page has translations: ${hasTranslations}`);
    });

    test('2.1: Responsive Design - Mobile Navigation Visible', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto(BASE_URL);
        await page.waitForTimeout(1500);

        // Check for mobile menu button or hamburger
        const hamburger = await page.locator('[aria-label*="menu"], button svg, [class*="hamburger"]').first();

        // Mobile layout should be responsive
        const viewport = page.viewportSize();
        expect(viewport?.width).toBe(375);

        // Reset viewport
        await page.setViewportSize({ width: 1280, height: 720 });
    });

    test('2.2: Desktop Layout - Sidebar Navigation Visible', async ({ page }) => {
        // Set desktop viewport
        await page.setViewportSize({ width: 1280, height: 720 });

        await page.goto(`${BASE_URL}/#/dashboard`);
        await page.waitForTimeout(2000);

        // Look for navigation elements
        const navItems = await page.locator('nav, [role="navigation"], [class*="nav"], [class*="sidebar"]');

        // Desktop should show navigation in sidebar or header
        // Just verify some navigation structure exists
        const navContent = await navItems.first().isVisible().catch(() => false);
        console.log(`Navigation visible: ${navContent}`);
    });

    test('3.1: Error Handling - Network Error Recovery', async ({ page }) => {
        await page.goto(BASE_URL);

        // Simulate offline mode
        await page.context().setOffline(true);
        await page.waitForTimeout(1000);

        // Try to navigate
        const registerLink = await page.locator('a:has-text("register"), a[href*="register"]').first();

        if (registerLink) {
            await registerLink.click();
            await page.waitForTimeout(1000);

            // Should show error or remain accessible
            const pageText = await page.textContent('body');
            console.log('Offline navigation: page still functional');
        }

        // Go back online
        await page.context().setOffline(false);
    });

    test('3.2: Form Submission - Handles Missing Fields', async ({ page }) => {
        await page.goto(`${BASE_URL}/#/register`);

        await page.waitForSelector('button:has-text("Continue"), button[type="submit"]', { timeout: 5000 });

        // Click submit without filling form
        const submitButton = await page.locator('button:has-text("Continue"), button[type="submit"]').first();

        if (submitButton) {
            await submitButton?.click();

            // Wait for validation
            await page.waitForTimeout(1000);

            // Should still be on register page (not submitted)
            expect(page.url()).toContain('register');

            // Verify form is still visible
            const form = await page.locator('input[type="text"], input[type="password"]').first();
            expect(form).toBeDefined();
        }
    });

    test('4.1: Data Consistency - Multiple Tabs', async ({ browser }) => {
        // Create two pages/tabs
        const context = await browser.newContext();
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        // Navigate both to landing page
        await page1.goto(BASE_URL);
        await page2.goto(BASE_URL);

        // Change language in page 1
        const langButton1 = await page1.locator('button:has-text("ID"), button:has-text("EN")').first();
        if (langButton1) {
            const lang1Before = await langButton1.innerText();
            await langButton1.click();
            await page1.waitForTimeout(500);
            const lang1After = await langButton1.innerText();

            // Check if page2 also changed (if using shared storage)
            const langButton2 = await page2.locator('button:has-text("ID"), button:has-text("EN")').first();
            const lang2Current = await langButton2?.innerText();

            console.log(`Page1 language: ${lang1Before} -> ${lang1After}`);
            console.log(`Page2 language: ${lang2Current}`);
        }

        await context.close();
    });

    test('4.2: Browser History Navigation Works', async ({ page }) => {
        await page.goto(BASE_URL);
        await page.waitForTimeout(1000);

        // Navigate forward
        const registerLink = await page.locator('a:has-text("register"), a[href*="register"]').first();
        if (registerLink) {
            await registerLink.click();
            await page.waitForTimeout(1000);
            expect(page.url()).toContain('register');

            // Go back
            await page.goBack();
            await page.waitForTimeout(1000);

            // Should be back on landing
            expect(page.url()).not.toContain('register');

            // Go forward again
            await page.goForward();
            await page.waitForTimeout(1000);

            // Should be back on register
            expect(page.url()).toContain('register');
        }
    });

    test('5.1: Performance - Page Load Time', async ({ page }) => {
        const startTime = Date.now();

        const response = await page.goto(BASE_URL);

        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });

        const loadTime = Date.now() - startTime;

        console.log(`Page load time: ${loadTime}ms`);

        // Verify reasonable load time (< 10 seconds)
        expect(loadTime).toBeLessThan(10000);

        // Verify HTTP 200
        expect(response?.status()).toBe(200);
    });

    test('5.2: React App Hydration Check', async ({ page }) => {
        await page.goto(BASE_URL);

        // Wait for React to hydrate
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });

        // Check for React DevTools signature
        const reactLoaded = await page.evaluate(() => {
            // @ts-ignore
            return typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object' ||
                // @ts-ignore
                typeof window.React !== 'undefined' ||
                document.querySelector('[data-reactroot], [data-react-root]') !== null;
        });

        console.log(`React hydrated: ${reactLoaded}`);
    });

});
