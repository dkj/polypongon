import { test, expect } from '@playwright/test';

test.describe('Player Disconnect Notification', () => {
    test('should show responsive REJOIN GAME menu when opponent leaves', async ({ browser }) => {
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();
        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        await page1.goto('/');
        await page1.locator('#onlineBtn').click();
        await page1.waitForSelector('#shareUrlInput');
        const roomUrl = await page1.locator('#shareUrlInput').inputValue();

        await page2.goto(roomUrl);

        // Close modal on page 1
        await page1.keyboard.press('Escape');
        await expect(page1.locator('#share-modal')).not.toHaveClass(/visible/);

        // Both in SCORING state initially
        await expect(page1.locator('#restartBtn')).toHaveText("I'M READY", { timeout: 10000 });
        await expect(page2.locator('#restartBtn')).toHaveText("I'M READY", { timeout: 10000 });

        // Both click Ready
        await page1.locator('#restartBtn').click();
        await page2.locator('#restartBtn').click();

        // Wait for game to start
        await expect(async () => {
            const state = await page1.evaluate(() => window.game.gameState);
            expect(state).toBe('PLAYING');
        }).toPass({ timeout: 10000 });

        // Player 2 disconnects
        await page2.close();
        await context2.close();

        // Player 1 should see game terminated and REJOIN GAME button
        await expect(async () => {
            const state = await page1.evaluate(() => window.game.gameState);
            expect(state).toBe('TERMINATED');
        }).toPass({ timeout: 10000 });

        await expect(page1.locator('#restartBtn')).toHaveText("REJOIN GAME");

        // The button should be clickable and responsive
        // Click the REJOIN GAME button
        await page1.locator('#restartBtn').click();

        // After clicking, the game should attempt to rejoin, moving to SCORING state
        await expect(async () => {
            const state = await page1.evaluate(() => window.game.gameState);
            expect(state).toBe('SCORING');
        }).toPass({ timeout: 10000 });

        // Button should change back to something like "I'M READY" or "WAITING..."
        await expect(page1.locator('#restartBtn')).not.toHaveText("REJOIN GAME", { timeout: 10000 });

        await context1.close();
    });
});
