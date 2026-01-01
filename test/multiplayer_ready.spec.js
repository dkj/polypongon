import { test, expect } from '@playwright/test';

test.describe('Multiplayer Readiness', () => {
    test('should wait for all players to be ready before starting', async ({ browser }) => {
        // Create two independent contexts/pages
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();
        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        // 1. First player goes online
        await page1.goto('/');
        await page1.locator('#onlineBtn').click();

        // Get the room URL from page1
        await page1.waitForSelector('#shareUrlInput');
        const roomUrl = await page1.locator('#shareUrlInput').inputValue();

        // 2. Second player joins via the URL
        await page2.goto(roomUrl);

        // Close modal on page 1 so we can see the button easily
        await page1.keyboard.press('Escape');
        await expect(page1.locator('#share-modal')).not.toHaveClass(/visible/);

        // Wait for both to be in SCORING state (waiting room)
        const checkWaiting = async (p) => {
            // Increase timeout for text change
            await expect(p.locator('#restartBtn')).toHaveText("I'M READY", { timeout: 10000 });
            const gameState = await p.evaluate(() => window.game.gameState);
            expect(gameState).toBe('SCORING');
        };

        await checkWaiting(page1);
        await checkWaiting(page2);

        // 3. Player 1 clicks ready
        await page1.locator('#restartBtn').click();
        await expect(page1.locator('#restartBtn')).toHaveText("WAITING...");
        await expect(page1.locator('#restartBtn')).toHaveClass(/btn-ready/);

        // 4. Player 2 should see feedback that others are waiting
        // We'll give it a moment for the state to propagate
        await expect(async () => {
            const feedback = await page2.evaluate(() => {
                // This is hard to check via DOM, so we check the game state object
                return window.game.readyEdges.length;
            });
            expect(feedback).toBe(1);
        }).toPass();

        // 5. Player 2 clicks ready
        await page2.locator('#restartBtn').click();

        // 6. Both should transition to COUNTDOWN and then PLAYING
        const checkStarted = async (p) => {
            await expect(async () => {
                const state = await p.evaluate(() => window.game.gameState);
                expect(['COUNTDOWN', 'PLAYING']).toContain(state);
            }).toPass({ timeout: 10000 });
        };

        await checkStarted(page1);
        await checkStarted(page2);

        await context1.close();
        await context2.close();
    });

    test('should start game if a player disconnects leaving only ready players', async ({ browser }) => {
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

        // Wait for both to be in SCORING state
        await expect(page1.locator('#restartBtn')).toHaveText("I'M READY", { timeout: 10000 });
        await expect(page2.locator('#restartBtn')).toHaveText("I'M READY", { timeout: 10000 });

        // Player 1 clicks ready
        await page1.locator('#restartBtn').click();
        await expect(page1.locator('#restartBtn')).toHaveText("WAITING...");

        // Player 2 disconnects
        await page2.close();
        await context2.close();

        // Player 1 should now see the game start (transition to COUNTDOWN/PLAYING)
        await expect(async () => {
            const state = await page1.evaluate(() => window.game.gameState);
            expect(['COUNTDOWN', 'PLAYING']).toContain(state);
        }).toPass({ timeout: 10000 });

        await context1.close();
    });
});
