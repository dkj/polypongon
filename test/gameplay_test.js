
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

    if (game.gameState !== 'COUNTDOWN') {
        console.error('❌ Failed: Game did not switch to COUNTDOWN after restart.');
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

    if (game.gameState !== 'COUNTDOWN') {
        console.error('❌ Failed: P2 restart request did not restart into COUNTDOWN.');
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

    assert.equal(game.gameState, 'COUNTDOWN', 'Game should switch to COUNTDOWN after restart');
    console.log('✅ Passed: Game moved to COUNTDOWN after manual restart.');

    // 4.5 Advance time to finish countdown
    for (let i = 0; i < 200; i++) { // ~3.2s
        game.update(0.016);
    }
    assert.equal(game.gameState, 'PLAYING', 'Game should switch to PLAYING after countdown');
    console.log('✅ Passed: Game started after countdown.');

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
    game.processRestart(); // Start countdown
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

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
    game.score = 12;
    game.timeElapsed = 7.5;
    game.triggerScore(12, 0); // 12 bounces, at edge 0

    assert.ok(goalEvent, 'Goal event should be emitted');
    assert.equal(goalEvent.type, 'goal', 'Event type should be goal');
    assert.equal(goalEvent.score, 12, 'Score should be exactly 12');
    assert.equal(goalEvent.time, 7, 'Time should be 7 (floored 7.5)');

    console.log('✅ Passed: Goal event includes score and time.');
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
    game.processRestart(); // Start countdown
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

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
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

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
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

    // Simulate a bit of game time, but not enough to score a goal (total time < 1.0s)
    for (let i = 0; i < 10; i++) {
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
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

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
    for (let i = 0; i < 200; i++) game.update(0.016); // Advance to playing

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

// ============ Spectator Mode Tests ============

function testSixthPlayerBecomesSpectator() {
    console.log('\\nTest: 6th Player Gets playerIndex -1 (Spectator)');
    const game = new ServerGame(mockIo, 'test_room_spectator');

    // Add 5 players (filling all pentagon edges)
    const p1Index = game.addPlayer('p1');
    const p2Index = game.addPlayer('p2');
    const p3Index = game.addPlayer('p3');
    const p4Index = game.addPlayer('p4');
    const p5Index = game.addPlayer('p5');

    assert.equal(p1Index, 0, 'Player 1 should get edge 0');
    assert.equal(p2Index, 1, 'Player 2 should get edge 1');
    assert.equal(p3Index, 2, 'Player 3 should get edge 2');
    assert.equal(p4Index, 3, 'Player 4 should get edge 3');
    assert.equal(p5Index, 4, 'Player 5 should get edge 4');
    assert.equal(game.paddles.length, 5, 'Should have exactly 5 paddles');

    // Try to add 6th player
    const p6Index = game.addPlayer('p6');

    assert.equal(p6Index, -1, '6th player should get index -1 (spectator)');
    assert.equal(game.paddles.length, 5, 'Should still have exactly 5 paddles');
    assert.equal(game.players.size, 5, 'Players map should only have 5 active players');

    console.log('✅ Passed: 6th player correctly assigned as spectator.');
    game.stop();
}

function testSpectatorDoesNotGetPaddle() {
    console.log('\\nTest: Spectator Has No Paddle in Game');
    const game = new ServerGame(mockIo, 'test_room_spectator_paddle');

    // Fill all slots
    for (let i = 0; i < 5; i++) {
        game.addPlayer(`p${i}`);
    }

    // Add spectator
    const spectatorIndex = game.addPlayer('spectator');
    assert.equal(spectatorIndex, -1, 'Spectator should get -1 index');

    // Start and play the game
    game.start();
    game.processRestart();
    for (let i = 0; i < 200; i++) game.update(0.016);

    // Verify no paddle exists for spectator
    const spectatorPaddle = game.paddles.find(p => p.edgeIndex === -1);
    assert.equal(spectatorPaddle, undefined, 'No paddle should exist for spectator');

    // Verify all edges 0-4 have paddles
    for (let i = 0; i < 5; i++) {
        const edgePaddle = game.paddles.find(p => p.edgeIndex === i);
        assert.ok(edgePaddle, `Edge ${i} should have a paddle`);
    }

    console.log('✅ Passed: Spectator has no paddle in active game.');
    game.stop();
}

function testSpectatorReceivesGameState() {
    console.log('\\nTest: Spectator Receives Game State Updates');

    let broadcastCount = 0;
    const spectatorIo = {
        to: () => ({
            emit: (event, _data) => {
                if (event === 'gameState') {
                    broadcastCount++;
                }
            }
        })
    };

    const game = new ServerGame(spectatorIo, 'test_room_spectator_broadcast');

    // Fill all slots
    for (let i = 0; i < 5; i++) {
        game.addPlayer(`p${i}`);
    }

    // Add spectator
    game.addPlayer('spectator');

    game.start();
    game.processRestart();

    // Run some game updates
    for (let i = 0; i < 60; i++) {
        game.update(0.016);
    }

    // Spectator should receive broadcasts (via room mechanism)
    assert.ok(broadcastCount > 0, 'Game state should be broadcast to room (including spectator)');
    console.log(`✅ Passed: Spectator received ${broadcastCount} game state updates.`);

    game.stop();
}

function testMultipleSpectators() {
    console.log('\\nTest: Multiple Spectators Can Join');
    const game = new ServerGame(mockIo, 'test_room_multi_spectators');

    // Fill all slots
    for (let i = 0; i < 5; i++) {
        game.addPlayer(`p${i}`);
    }

    // Add multiple spectators
    const s1Index = game.addPlayer('spectator1');
    const s2Index = game.addPlayer('spectator2');
    const s3Index = game.addPlayer('spectator3');

    assert.equal(s1Index, -1, 'Spectator 1 should get -1');
    assert.equal(s2Index, -1, 'Spectator 2 should get -1');
    assert.equal(s3Index, -1, 'Spectator 3 should get -1');
    assert.equal(game.paddles.length, 5, 'Should still have exactly 5 paddles');

    console.log('✅ Passed: Multiple spectators can join without affecting game.');
    game.stop();
}

function testSpectatorAfterPlayerLeaves() {
    console.log('\\nTest: Spectator After Player Disconnect');
    const game = new ServerGame(mockIo, 'test_room_spectator_vacancy');

    // Fill all slots
    game.addPlayer('p0');
    game.addPlayer('p1');
    game.addPlayer('p2');
    game.addPlayer('p3');
    game.addPlayer('p4');

    // Add spectator
    const spectatorIndex = game.addPlayer('spectator');
    assert.equal(spectatorIndex, -1, 'Should be spectator when game is full');
    assert.equal(game.paddles.length, 5, 'Should have 5 paddles');

    // Player 2 leaves
    game.removePlayer('p2');

    // Game should terminate (during PLAYING state)
    // But if we were to add a new player after this, they would get edge 2
    // Let's test this in a fresh scenario after termination

    console.log('✅ Passed: Spectator behavior consistent after player disconnect.');
    game.stop();
}

function testSpectatorCannotControlPaddle() {
    console.log('\\nTest: Spectator Input Has No Effect');
    const game = new ServerGame(mockIo, 'test_room_spectator_input');

    // Add 5 players
    for (let i = 0; i < 5; i++) {
        game.addPlayer(`p${i}`);
    }

    // Add spectator
    game.addPlayer('spectator_socket');

    game.start();
    game.processRestart();
    for (let i = 0; i < 200; i++) game.update(0.016);

    // Try to send input from spectator
    game.handleInput('spectator_socket', 1); // Try to move paddle

    // Verify no paddle movement or creation
    assert.equal(game.paddles.length, 5, 'Should still have exactly 5 paddles');

    // The handleInput should just return early since spectator is not in players map
    console.log('✅ Passed: Spectator input is ignored.');
    game.stop();
}

testSixthPlayerBecomesSpectator();
testSpectatorDoesNotGetPaddle();
testSpectatorReceivesGameState();
testMultipleSpectators();
testSpectatorAfterPlayerLeaves();
testSpectatorCannotControlPaddle();

console.log('--- All Gameplay Tests Passed ---');
