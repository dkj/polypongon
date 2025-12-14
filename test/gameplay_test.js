
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

testFreezeAndRestart();
testMultiplayerFreezeAndRestart();

console.log('--- All Gameplay Tests Passed ---');
