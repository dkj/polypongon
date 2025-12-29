import { test, expect } from '@playwright/test';

test.describe('Sound Toggle functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should have a sound toggle button', async ({ page }) => {
        const soundToggle = page.locator('#soundToggle');
        await expect(soundToggle).toBeVisible();
    });

    test('should cycle through sound modes on click', async ({ page }) => {

        // Initial state: ALL
        let currentMode = await page.evaluate(() => window.game.audio.mode);
        expect(currentMode).toBe('all');

        // Click once: INTERACTIONS
        await page.click('#soundToggle');
        currentMode = await page.evaluate(() => window.game.audio.mode);
        expect(currentMode).toBe('interactions');

        // Click again: OFF
        await page.click('#soundToggle');
        currentMode = await page.evaluate(() => window.game.audio.mode);
        expect(currentMode).toBe('off');

        // Click again: ALL
        await page.click('#soundToggle');
        currentMode = await page.evaluate(() => window.game.audio.mode);
        expect(currentMode).toBe('all');
    });

    test('should update icon based on mode', async ({ page }) => {
        const soundIcon = page.locator('#soundIcon');

        // Helper to check if icon contains certain SVG elements
        const hasPath = async (svgPart) => {
            const html = await soundIcon.innerHTML();
            return html.includes(svgPart);
        };

        // Mode: ALL (should have speaker + 2 waves)
        expect(await hasPath('M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07')).toBe(true);

        // Mode: INTERACTIONS (should have speaker + 1 wave)
        await page.click('#soundToggle');
        expect(await hasPath('M15.54 8.46a5 5 0 0 1 0 7.07')).toBe(true);
        expect(await hasPath('M19.07 4.93a10 10 0 0 1 0 14.14')).toBe(false);

        // Mode: OFF (should have speaker + cross)
        await page.click('#soundToggle');
        expect(await hasPath('line x1="23" y1="9" x2="17" y2="15"')).toBe(true);
    });
});
