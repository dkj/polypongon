import { ServerGame } from '../server/ServerGame.js';

// Mock IO
let emittedEvents = [];
const mockIo = {
    to: () => ({
        emit: (event, data) => {
            emittedEvents.push({ event, data });
        }
    })
};

console.log('--- Server First Start Bug Test ---');

function testServerFirstStart() {
    console.log('Test: Server First Start (mimicking real flow)');
    emittedEvents = [];

    // 1. Create game and start (like server/index.js does)
    const game = new ServerGame(mockIo, 'test_room');
    game.start();  // Starts the loop, but we won't use the real loop
    game.stop();   // Stop the interval so we can control frames manually

    console.log('After creation:');
    console.log('  GameState:', game.gameState);  // Should be SCORING
    console.log('  Ball pos:', game.ball.x, game.ball.y);  // Should be 0, 0
    console.log('  Ball vel:', game.ball.vx.toFixed(2), game.ball.vy.toFixed(2));  // Random
    console.log('  Paddles count:', game.paddles.length);  // 0

    // 2. Player joins
    const playerIdx = game.addPlayer('p1');
    console.log('\nAfter player joins:');
    console.log('  Player index:', playerIdx);  // 0
    console.log('  Paddles count:', game.paddles.length);  // 1
    console.log('  Paddle position:', game.paddles[0].position);  // 0.5
    console.log('  Paddle width:', game.paddles[0].width);  // 0.2 (default in Paddle constructor)

    // 3. Simulate some frames while in SCORING (game hasn't started yet)
    console.log('\nSimulating 10 frames in SCORING state...');
    for (let i = 0; i < 10; i++) {
        // Simulate loop() without the interval
        const prevTime = game.lastTime;
        game.lastTime = performance.now();
        const dt = (game.lastTime - prevTime) / 1000;
        game.update(dt);  // Should return early
    }

    console.log('After 10 SCORING frames:');
    console.log('  GameState:', game.gameState);  // Still SCORING
    console.log('  Ball pos:', game.ball.x, game.ball.y);  // Still 0, 0 (frozen)
    console.log('  Score:', game.score);  // 0

    // 4. Player clicks to start (triggers playerReady)
    console.log('\nPlayer clicking to start (toggleReady)...');
    game.toggleReady('p1', true);

    console.log('After processRestart:');
    console.log('  GameState:', game.gameState);  // PLAYING
    console.log('  Ball pos:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));  // Reset to 0, 0
    console.log('  Ball vel:', game.ball.vx.toFixed(2), game.ball.vy.toFixed(2));  // New random
    console.log('  Paddle position:', game.paddles[0].position);  // 0.5
    console.log('  Paddle width:', game.paddles[0].width);  // 0.5 (set by resetState)

    // 5. Run first frame after restart
    console.log('\nRunning first frame after start...');
    const prevTime = game.lastTime;
    game.lastTime = performance.now();
    const dt = (game.lastTime - prevTime) / 1000;

    console.log('  dt:', dt.toFixed(4), 'seconds');

    const prevBallX = game.ball.x;
    const prevBallY = game.ball.y;

    game.update(dt);

    console.log('After first PLAYING frame:');
    console.log('  GameState:', game.gameState);
    console.log('  Score:', game.score.toFixed(4));
    console.log('  Ball moved from', prevBallX.toFixed(2), prevBallY.toFixed(2),
        'to', game.ball.x.toFixed(2), game.ball.y.toFixed(2));

    // Check for immediate goal
    if (game.gameState === 'SCORING' && game.score < 0.1) {
        console.error('\n❌ BUG: Immediate goal on first frame!');
        console.error('  Last score:', game.lastScore);

        // Check what events were emitted
        const goalEvents = emittedEvents.filter(e => e.event === 'gameEvent' && e.data.type === 'goal');
        if (goalEvents.length > 0) {
            console.error('  Goal events:', goalEvents);
        }

        process.exit(1);
    }

    // Run a few more frames
    for (let i = 0; i < 30; i++) {
        const prev = game.lastTime;
        game.lastTime = performance.now();
        game.update((game.lastTime - prev) / 1000);
    }

    console.log('\nAfter 30 more frames:');
    console.log('  GameState:', game.gameState);
    console.log('  Score:', game.score.toFixed(3));

    if (game.gameState === 'SCORING') {
        console.error('❌ Goal triggered too quickly!');
        process.exit(1);
    }

    console.log('✅ Test passed');
}

testServerFirstStart();
console.log('--- Test Complete ---');
