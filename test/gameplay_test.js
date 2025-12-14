
import { ServerGame } from '../server/ServerGame.js';
import { strict as assert } from 'assert';

// Mock IO
const mockIo = {
    to: () => ({ emit: () => { } })
};

console.log('--- Starting Gameplay Logic Tests ---');

function testFreezeAndRestart() {
    console.log('Test: Goal Freeze & Restart');
    const game = new ServerGame(mockIo, 'test_room');
    game.addPlayer('p1');
    game.start();

    // 1. Force state to SCORING (Simulate Goal)
    game.triggerScore(10);
    assert.equal(game.gameState, 'SCORING');
    assert.equal(game.lastScore, 10);

    // 2. Advance time - Verify NO auto-restart and NO update
    const initialRotation = game.polygon.rotation;

    // Simulate 10 seconds passing (way longer than old 5s timer)
    for (let i = 0; i < 600; i++) { // 600 frames * 16ms = ~10s
        game.update(0.016);
    }

    // Verify State is STILL scoring
    if (game.gameState !== 'SCORING') {
        console.error('❌ Failed: Game auto-restarted!');
        process.exit(1);
    } else {
        console.log('✅ Passed: Game stayed frozen in SCORING state.');
    }

    // Verify Rotation did NOT change (Total Freeze)
    if (game.polygon.rotation !== initialRotation) {
        console.error('❌ Failed: Physics updated (rotation changed) during freeze!', game.polygon.rotation, initialRotation);
        process.exit(1);
    } else {
        console.log('✅ Passed: Physics (rotation) frozen.');
    }

    // 3. Trigger Manual Restart
    console.log('Triggering manual restart...');
    game.processRestart();

    if (game.gameState !== 'PLAYING') {
        console.error('❌ Failed: Game did not switch to PLAYING after restart.');
        process.exit(1);
    }

    if (game.score !== 0) {
        console.error('❌ Failed: Score not reset.');
        process.exit(1);
    }

    console.log('✅ Passed: Game restarted successfully.');
    game.stop();
}


function testMultiplayerFreezeAndRestart() {
    console.log('\nTest: Multiplayer Goal Freeze & Any-Player Restart');
    const game = new ServerGame(mockIo, 'test_room_multi');
    game.addPlayer('p1_socket');
    game.addPlayer('p2_socket');
    game.start();

    // 1. Trigger Goal
    game.triggerScore(5);
    assert.equal(game.gameState, 'SCORING');

    // 2. Verify Freeze
    const initialRotation = game.polygon.rotation;
    game.update(0.1);
    assert.equal(game.polygon.rotation, initialRotation, 'Rotation should be frozen for multiplayer game too');

    // 3. Simulating P2 requesting restart
    // In index.js, this calls game.processRestart()
    console.log('Simulating P2 clicking restart...');
    game.processRestart();

    if (game.gameState !== 'PLAYING') {
        console.error('❌ Failed: P2 restart request did not restart normal gameplay.');
        process.exit(1);
    }

    // Verify Players are still there
    assert.equal(game.players.size, 2, 'Both players should remain in game');

    console.log('✅ Passed: Multiplayer restart worked.');
    game.stop();
}

function testGameStartsFrozen() {
    console.log('\nTest: Game Starts Frozen (No Autostart)');

    // 1. Create a new game - should start frozen
    const game = new ServerGame(mockIo, 'test_room_frozen');

    assert.equal(game.gameState, 'SCORING', 'Game should start in SCORING (frozen) state');
    console.log('✅ Passed: Game initial state is SCORING (frozen).');

    // 2. Add a player and start the loop
    game.addPlayer('p1');
    game.start();

    // 3. Verify still frozen after updates
    const initialBallX = game.ball.x;
    const initialBallY = game.ball.y;
    const initialRotation = game.polygon.rotation;

    for (let i = 0; i < 60; i++) { // 1 second of updates
        game.update(0.016);
    }

    assert.equal(game.gameState, 'SCORING', 'Game should remain frozen after updates');
    assert.equal(game.ball.x, initialBallX, 'Ball X should not move while frozen');
    assert.equal(game.ball.y, initialBallY, 'Ball Y should not move while frozen');
    assert.equal(game.polygon.rotation, initialRotation, 'Polygon should not rotate while frozen');
    console.log('✅ Passed: Physics frozen on start - no auto-play.');

    // 4. Player triggers restart - game should start
    game.processRestart();

    assert.equal(game.gameState, 'PLAYING', 'Game should switch to PLAYING after restart');
    console.log('✅ Passed: Game started after manual restart.');

    // 5. Now updates should affect physics
    game.update(0.1);
    assert.notEqual(game.polygon.rotation, initialRotation, 'Polygon should rotate after game starts');
    console.log('✅ Passed: Physics active after restart.');

    game.stop();
}

function testPaddleWidthBroadcast() {
    console.log('\nTest: Paddle Width Broadcast');
    const game = new ServerGame(mockIo, 'test_room_width');
    game.addPlayer('p1');
    game.start();
    game.processRestart(); // Start playing

    // Simulate some time passing to change difficulty/width
    for (let i = 0; i < 60; i++) {
        game.update(0.5); // 30 seconds of game time total
    }

    // Get broadcast state by capturing what would be sent
    let capturedState = null;
    const captureIo = {
        to: () => ({
            emit: (event, data) => {
                if (event === 'gameState') capturedState = data;
            }
        })
    };
    game.io = captureIo;
    game.broadcastState();

    // Verify paddle width is included in broadcast
    assert.ok(capturedState, 'State should be broadcast');
    assert.ok(capturedState.paddles, 'Paddles should be in state');
    assert.ok(capturedState.paddles.length > 0, 'Should have at least one paddle');

    const paddle = capturedState.paddles[0];
    assert.ok(paddle.width !== undefined, 'Paddle width should be broadcast');
    assert.ok(typeof paddle.width === 'number', 'Paddle width should be a number');
    assert.ok(paddle.width > 0 && paddle.width <= 0.25, 'Paddle width should be reasonable (0 < w <= 0.25)');

    console.log('✅ Passed: Paddle width is broadcast:', paddle.width);
    game.stop();
}

function testGoalEventIncludesScore() {
    console.log('\nTest: Goal Event Emits Score');
    const game = new ServerGame(mockIo, 'test_room_goal');
    game.addPlayer('p1');
    game.start();
    game.processRestart();

    // Capture emitted events
    let goalEvent = null;
    const captureIo = {
        to: () => ({
            emit: (event, data) => {
                if (event === 'gameEvent' && data.type === 'goal') {
                    goalEvent = data;
                }
            }
        })
    };
    game.io = captureIo;

    // Trigger a goal
    game.triggerScore(7.5);

    assert.ok(goalEvent, 'Goal event should be emitted');
    assert.equal(goalEvent.type, 'goal', 'Event type should be goal');
    assert.equal(goalEvent.score, 7, 'Score should be included (floored)');

    console.log('✅ Passed: Goal event includes score.');
    game.stop();
}

testGameStartsFrozen();
testFreezeAndRestart();
testMultiplayerFreezeAndRestart();
testPaddleWidthBroadcast();
testGoalEventIncludesScore();

console.log('--- All Gameplay Tests Passed ---');
