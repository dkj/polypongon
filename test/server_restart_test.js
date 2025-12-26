import { ServerGame } from '../server/ServerGame.js';

// Mock IO
let lastEmit = null;
const mockIo = {
    to: () => ({
        emit: (event, data) => {
            lastEmit = { event, data };
        }
    })
};

console.log('--- Server Restart Bug Test ---');

function testServerRestart() {
    console.log('Test: Server Reset and First Frame');

    const game = new ServerGame(mockIo, 'test_room');

    // Add a player
    const playerIdx = game.addPlayer('p1');
    console.log('Player added at edge:', playerIdx);

    // Start the game manually (bypass processRestart to control flow)
    game.gameState = 'PLAYING';
    game.ball.x = 0;
    game.ball.y = 0;
    game.ball.vx = 100;
    game.ball.vy = 100;

    // Run a few frames to get ball moving  
    for (let i = 0; i < 10; i++) {
        game.update(0.016);
    }

    console.log('Ball position after 10 frames:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));
    console.log('GameState:', game.gameState);

    // Now force a goal
    console.log('\nTriggering goal...');
    game.triggerScore(15);

    console.log('GameState after goal:', game.gameState);
    console.log('Ball position after goal:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));

    // Simulate a few loop() calls while in SCORING (as would happen in real game)
    for (let i = 0; i < 5; i++) {
        // This is what loop() does essentially
        game.update(0.016);
    }

    console.log('Ball position after SCORING frames:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));

    // Now trigger restart
    console.log('\nProcessing restart...');
    game.processRestart();

    console.log('GameState after restart:', game.gameState);
    console.log('Ball position after restart:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));
    console.log('Ball velocity after restart:', game.ball.vx.toFixed(2), game.ball.vy.toFixed(2));
    console.log('Paddle position:', game.paddles[0].position);
    console.log('Paddle width:', game.paddles[0].width);

    // Run first frame after restart
    console.log('\nRunning first frame after restart...');
    const prevX = game.ball.x;
    const prevY = game.ball.y;

    game.update(0.016);

    console.log('prevX/prevY was:', prevX, prevY);
    console.log('Ball position after first frame:', game.ball.x.toFixed(2), game.ball.y.toFixed(2));
    console.log('GameState after first frame:', game.gameState);
    console.log('Score:', game.score.toFixed(3));

    if (game.gameState === 'SCORING') {
        console.error('❌ BUG: Immediate goal after restart!');
        console.log('Last emit:', lastEmit);
        process.exit(1);
    } else {
        console.log('✅ No immediate goal. Game running normally.');
    }

    // Run a few more frames
    for (let i = 0; i < 30; i++) {
        game.update(0.016);
    }

    console.log('After 30 more frames:');
    console.log('GameState:', game.gameState);
    console.log('Score:', game.score.toFixed(3));

    if (game.gameState === 'SCORING') {
        console.error('❌ Goal triggered within first 30 frames (~0.5s) - suspicious');
        process.exit(1);
    }

    console.log('✅ Test passed');
}

testServerRestart();
console.log('--- Test Complete ---');
