
// @ts-check
import { test, expect } from '@playwright/test';

test('Ball has a trail', async ({ page }) => {
    // 1. Go to game page
    await page.goto('/');

    // 2. Wait for game to initialize and start
    await page.waitForTimeout(1000);

    // 3. Start game if not started (it auto-starts loop, but we might need to click to start "PLAYING" state)
    // Actually, for the physical ball info to update, we need the loop running.
    // Based on Game.js: game.start() is called in main.js.
    // game.loop() updates ball.

    // Let's verify we have access to window.game
    const hasGame = await page.evaluate(() => !!window.game);
    expect(hasGame).toBe(true);

    // 4. Wait for a bit of time for physics to run and trail to populate
    // Click to start actual gameplay to ensure ball moves?
    // Game starts in 'SCORING' (frozen) state usually? 
    // Checking Game.js: constructor sets gameState = 'SCORING'.
    // In SCORING, update() returns early (Total Freeze).

    // So we MUST click to start.
    await page.locator('body').click();

    // Wait for ball to move
    await page.waitForTimeout(1000);

    // 5. Evaluate trail length
    const trailLength = await page.evaluate(() => {
        return window.game.ball.trail.length;
    });

    console.log(`Trail length detected: ${trailLength}`);

    // 6. Assert trail logic
    expect(trailLength).toBeGreaterThan(0);
    expect(trailLength).toBeLessThanOrEqual(20);

    // Verify trail structure
    const trailPoints = await page.evaluate(() => window.game.ball.trail);
    expect(trailPoints[0]).toHaveProperty('x');
    expect(trailPoints[0]).toHaveProperty('y');
});
