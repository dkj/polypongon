
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
    assert.ok(paddle.width > 0 && paddle.width <= 0.5, 'Paddle width should be reasonable (0 < w <= 0.5)');

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

// ============ Player Disconnect Tests ============

function testPlayerDisconnectTerminatesGame() {
    console.log('\nTest: Player Disconnect Terminates Active Game');
    const game = new ServerGame(mockIo, 'test_room_disconnect');
    game.addPlayer('p1');
    game.addPlayer('p2');
    game.start();
    game.processRestart(); // Start playing

    assert.equal(game.gameState, 'PLAYING', 'Game should be playing');
    assert.equal(game.players.size, 2, 'Should have 2 players');

    // Player 1 disconnects
    game.removePlayer('p1');

    assert.equal(game.gameState, 'TERMINATED', 'Game should be TERMINATED after player leaves');
    assert.equal(game.running, false, 'Game should stop running');

    console.log('✅ Passed: Player disconnect terminates active game.');
    game.stop();
}

function testDisconnectRemovesPaddle() {
    console.log('\nTest: Disconnect Removes Paddle (Edge Becomes Wall)');
    const game = new ServerGame(mockIo, 'test_room_paddle_remove');
    game.addPlayer('p1');
    game.addPlayer('p2');
    game.start();
    game.processRestart();

    assert.equal(game.paddles.length, 2, 'Should start with 2 paddles');

    // Verify paddle edge indices
    const paddleEdges = game.paddles.map(p => p.edgeIndex);
    assert.ok(paddleEdges.includes(0), 'Player 1 should have edge 0');
    assert.ok(paddleEdges.includes(1), 'Player 2 should have edge 1');

    // Player 1 disconnects
    game.removePlayer('p1');

    assert.equal(game.paddles.length, 1, 'Should have 1 paddle after disconnect');
    assert.equal(game.paddles[0].edgeIndex, 1, 'Remaining paddle should be on edge 1');

    console.log('✅ Passed: Disconnected player paddle removed.');
    game.stop();
}

function testDisconnectEmitsTerminatedEvent() {
    console.log('\nTest: Disconnect Emits gameTerminated Event');

    let terminatedEvent = null;
    const captureIo = {
        to: () => ({
            emit: (event, data) => {
                if (event === 'gameTerminated') {
                    terminatedEvent = data;
                }
            }
        })
    };

    const game = new ServerGame(captureIo, 'test_room_event');
    game.addPlayer('p1');
    game.addPlayer('p2');
    game.start();
    game.processRestart();

    // Simulate some game time
    for (let i = 0; i < 60; i++) {
        game.update(0.016);
    }

    // Player disconnects
    game.removePlayer('p1');

    assert.ok(terminatedEvent, 'gameTerminated event should be emitted');
    assert.equal(terminatedEvent.reason, 'A player left the game', 'Should have correct reason');
    assert.ok(typeof terminatedEvent.lastScore === 'number', 'Should include lastScore');

    console.log('✅ Passed: gameTerminated event emitted correctly.');
    game.stop();
}

function testDisconnectDuringScoring() {
    console.log('\nTest: Disconnect During SCORING State Does NOT Terminate');
    const game = new ServerGame(mockIo, 'test_room_scoring_disconnect');
    game.addPlayer('p1');
    game.addPlayer('p2');
    game.start();
    game.processRestart();

    // Trigger a goal - game should be in SCORING state
    game.triggerScore(5);
    assert.equal(game.gameState, 'SCORING', 'Game should be in SCORING state');

    // Player disconnects during scoring state
    game.removePlayer('p1');

    // Game should NOT switch to TERMINATED (was already frozen)
    assert.equal(game.gameState, 'SCORING', 'Game should remain in SCORING state');

    console.log('✅ Passed: Disconnect during SCORING does not trigger termination.');
    game.stop();
}

function testDisconnectNonExistentPlayer() {
    console.log('\nTest: Removing Non-Existent Player Does Nothing');
    const game = new ServerGame(mockIo, 'test_room_nonexistent');
    game.addPlayer('p1');
    game.start();
    game.processRestart();

    const initialState = game.gameState;
    const initialPaddleCount = game.paddles.length;

    // Try to remove player that doesn't exist
    game.removePlayer('nonexistent_socket');

    assert.equal(game.gameState, initialState, 'Game state should not change');
    assert.equal(game.paddles.length, initialPaddleCount, 'Paddle count should not change');

    console.log('✅ Passed: Removing non-existent player has no effect.');
    game.stop();
}

testPlayerDisconnectTerminatesGame();
testDisconnectRemovesPaddle();
testDisconnectEmitsTerminatedEvent();
testDisconnectDuringScoring();
testDisconnectNonExistentPlayer();

console.log('--- All Gameplay Tests Passed ---');
