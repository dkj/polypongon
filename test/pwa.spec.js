import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('PWA Features', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should have a manifest link in head', async ({ page }) => {
        const manifestLink = await page.locator('link[rel="manifest"]');
        await expect(manifestLink).toBeAttached();

        // In Vite PWA, manifest is usually /manifest.webmanifest or /manifest.json
        const href = await manifestLink.getAttribute('href');
        expect(href).toMatch(/\/manifest\.(webmanifest|json)/);
    });

    test('should have PWA meta tags in head', async ({ page }) => {
        const themeColor = await page.locator('meta[name="theme-color"]');
        await expect(themeColor).toHaveAttribute('content', '#1a1a1a');

        const appleIcon = await page.locator('link[rel="apple-touch-icon"]');
        await expect(appleIcon).toBeAttached();
    });

    test('should register a service worker', async ({ page }) => {
        // Wait for service worker to register
        await page.waitForFunction(async () => {
            if (!('serviceWorker' in navigator)) return false;
            const registrations = await navigator.serviceWorker.getRegistrations();
            return registrations.length > 0;
        }, { timeout: 5000 });

        const swFound = await page.evaluate(async () => {
            const registrations = await navigator.serviceWorker.getRegistrations();
            return registrations.length > 0;
        });
        expect(swFound).toBe(true);
    });

    test('manifest should have correct properties', async ({ page }) => {
        const manifestLink = await page.locator('link[rel="manifest"]');
        const href = await manifestLink.getAttribute('href');

        // Fetch the manifest content
        const response = await page.request.get(href);
        expect(response.ok()).toBe(true);
        const manifest = await response.json();

        expect(manifest.name).toBe('Polypongon');
        expect(manifest.short_name).toBe('Polypongon');
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('/');
        expect(manifest.icons.length).toBeGreaterThan(0);
    });
});
