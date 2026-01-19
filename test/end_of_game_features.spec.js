import { test, expect } from '@playwright/test';

test.describe('End of Game Features', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test.describe('Local Celebration', () => {
        test('should show celebration phase and delay menu', async ({ page }) => {
            // 1. Simulate a goal in local mode
            await page.evaluate(() => {
                window.game.mode = 'local';
                window.game.triggerScore(5, 10);
            });

            // 2. Overlay is drawn on canvas, check State
            // Actually, Game.js draws the scoring overlay directly on canvas.
            // We can check if Game State is SCORING
            const gameState = await page.evaluate(() => window.game.gameState);
            expect(gameState).toBe('SCORING');

            // 3. Menu should be hidden during celebration (2.5s)
            await expect(page.locator('#game-menu')).toBeHidden();

            // 4. After delay, menu appears
            await page.waitForFunction(() => {
                const menu = document.getElementById('game-menu');
                return menu && window.getComputedStyle(menu).display === 'flex';
            }, { timeout: 5000 });

            const restartBtn = page.locator('#restartBtn');
            await expect(restartBtn).toBeVisible();
            await expect(restartBtn).toHaveText('PLAY AGAIN');

            // 4. Share App button should be visible in menu
            await expect(page.locator('#shareMenuBtn')).toBeVisible();
        });

        test('should have correct sharing message for local mode', async ({ page }) => {
            await page.evaluate(() => {
                window.game.mode = 'local';
                window.game.triggerScore(5, 15);
            });

            await page.waitForTimeout(3000);
            await page.locator('#shareMenuBtn').click();

            const twitterLink = await page.locator('#shareTwitter').getAttribute('href');
            expect(twitterLink).toContain(encodeURIComponent('I survived 15 seconds with a score of 5 !'));
            const decodedLink = decodeURIComponent(twitterLink);
            expect(decodedLink).toContain('http://localhost:');
        });
    });

    test.describe('Multiplayer Celebration', () => {
        test('should sync celebration and sharing from server', async ({ page }) => {
            // Handle prompt
            page.on('dialog', dialog => dialog.accept('ROOM123'));

            // Mock online toggle
            await page.route('/api/instance', async route => {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instanceId: 'test-inst', isFlyInstance: true }) });
            });
            await page.locator('#onlineBtn').click();
            // Wait for the async goOnline handler to finish setting the mode
            await page.waitForFunction(() => window.game.mode === 'online');

            // Simulate receiving goal event and states
            await page.evaluate(() => {
                // Ensure share modal from going online is closed
                document.getElementById('share-modal').classList.remove('visible');

                // Mock starting the celebration
                window.game.startCelebration();
                window.game.gameState = 'SCORING';
                window.game.lastScore = 8;
                window.game.finalTime = 45;
                window.game.hasPlayed = true;

                // Keep socket listeners active to trigger them manually

                window.game.setMenuVisible(false);
            });

            // 1. Menu hidden
            await expect(page.locator('#game-menu')).toBeHidden();

            // 2. Ball moves when receiving state

            await page.evaluate(() => {
                const handler = window.game.socket.listeners('gameState')[0];
                handler({
                    ball: { x: 100, y: 100 },
                    paddles: [],
                    rotation: 0.1,
                    difficulty: 1,
                    gameState: 'SCORING'
                });
            });

            const pos1 = await page.evaluate(() => ({ x: window.game.ball.x, y: window.game.ball.y }));
            expect(pos1.x).toBe(100);
            expect(pos1.y).toBe(100);

            // 3. Trigger menu via socket state update (celebration finished)
            await page.evaluate(() => {
                const handler = window.game.socket.listeners('gameState')[0];
                handler({
                    ball: { x: 0, y: 0 },
                    rotation: 0,
                    gameState: 'SCORING',
                    celebrationTimer: 0,
                    lastScore: 8,
                    finalTime: 45,
                    readyEdges: [],
                    paddles: []
                });
            });

            // 3. Share button appears after celebration
            await page.waitForFunction(() => {
                const btn = document.getElementById('shareMenuBtn');
                const menu = document.getElementById('game-menu');
                return btn && window.getComputedStyle(menu).display !== 'none';
            }, { timeout: 5000 });

            await expect(page.locator('#shareMenuBtn')).toBeVisible();

            // 4. Correct "We" message with join suggestion
            await page.evaluate(() => {
                window.game.lastScore = 8;
                window.game.finalTime = 45;
                window.game.hasPlayed = true;
                document.getElementById('shareMenuBtn').click();
            });

            await page.waitForFunction(() => {
                const href = document.getElementById('shareTwitter').getAttribute('href');
                return href && href.includes('score%20of%208');
            }, { timeout: 10000 });

            const twitterLink = await page.locator('#shareTwitter').getAttribute('href');
            expect(twitterLink).toContain(encodeURIComponent('score of 8'));
        });

        test('should reset sharing state when switching modes', async ({ page }) => {
            // 1. Play local game to set score
            await page.evaluate(() => {
                window.game.mode = 'local';
                window.game.triggerScore(10, 30);
            });

            // 2. Open share modal - should have score
            await page.locator('#shareMenuBtn').click();
            let twitterLink = await page.locator('#shareTwitter').getAttribute('href');
            expect(twitterLink).toContain(encodeURIComponent('I survived 30 seconds with a score of 10 !'));

            await page.locator('#closeShareBtn').click();

            // 3. Go Online
            page.on('dialog', dialog => dialog.accept('ROOM_RESET'));
            await page.route('/api/instance', async route => {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instanceId: 'test-inst', isFlyInstance: true }) });
            });
            await page.locator('#onlineBtn').click();
            // Wait for the async goOnline handler to finish
            await page.waitForFunction(() => window.game.mode === 'online');

            // 4. Open share modal (Invite) - should be default invite text, NOT the previous score
            // The modal is auto-opened by main.js on online toggle.
            // We wait for the URL to change to ensure the async goOnline handler has finished.
            await expect(page.locator('#shareTwitter')).toHaveAttribute('href', /Care%20to%20join%20us%20for%20our%20imminent%20game%20of%20Polypongon%3F/);

            twitterLink = await page.locator('#shareTwitter').getAttribute('href');
            expect(twitterLink).not.toContain(encodeURIComponent('I survived 30 seconds with a score of 10 !'));

            await page.locator('#closeShareBtn').click();

            // 5. Go Offline
            await page.locator('#onlineBtn').click();

            // 6. Open share modal - should be default app text
            await page.locator('#shareMenuBtn').click();
            twitterLink = await page.locator('#shareTwitter').getAttribute('href');
            expect(twitterLink).not.toContain(encodeURIComponent('I survived 30 seconds with a score of 10 !'));
            expect(twitterLink).toContain(encodeURIComponent('For your consideration, I am sharing this polygon pong game.'));
        });

        test('should gate "I\'M READY" button on server celebration timer', async ({ page }) => {
            // Handle prompt
            page.on('dialog', dialog => dialog.accept('ROOMSYNC'));
            await page.route('/api/instance', async route => {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instanceId: 'test-inst', isFlyInstance: true }) });
            });
            await page.locator('#onlineBtn').click();
            // Wait for the transition to finish
            await page.waitForFunction(() => window.game.mode === 'online');

            // Simulate server state where celebration is ongoing
            await page.evaluate(() => {
                // Close auto-opened share modal
                document.getElementById('share-modal').classList.remove('visible');

                window.game.socket.disconnect();

                // Manually trigger the gameState handler as if it came from socket
                // We use the same object structure that Game.js expects
                const mockState = {
                    ball: { x: 0, y: 0 },
                    rotation: 0,
                    gameState: 'SCORING',
                    celebrationTimer: 2.0,
                    readyEdges: [],
                    score: 5,
                    lastScore: 5,
                    difficulty: 1.0,
                    paddles: [{ edgeIndex: window.game.playerIndex, position: 0.5, width: 0.5 }]
                };

                // Directly call the handler that's attached to the socket
                const handler = window.game.socket.listeners('gameState')[0];
                handler(mockState);
            });

            // 1. Menu should be hidden while celebrationTimer > 0 (even if local decrement happens)
            await expect(page.locator('#game-menu')).toBeHidden();

            // 2. Advance server state to celebration finished
            await page.evaluate(() => {
                const mockState = {
                    ball: { x: 0, y: 0 },
                    rotation: 0,
                    gameState: 'SCORING',
                    celebrationTimer: 0,
                    readyEdges: [],
                    score: 5,
                    lastScore: 5,
                    difficulty: 1.0,
                    paddles: [{ edgeIndex: window.game.playerIndex, position: 0.5, width: 0.5 }]
                };
                const handler = window.game.socket.listeners('gameState')[1] || window.game.socket.listeners('gameState')[0];
                handler(mockState);
            });

            // 3. Menu should now appear
            await expect(page.locator('#game-menu')).toBeVisible();
            await expect(page.locator('#restartBtn')).toHaveText("I'M READY");
        });
    });
});
