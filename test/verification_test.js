
import { ServerGame } from '../server/ServerGame.js';
import { strict as assert } from 'assert';

// Mock IO
const mockIo = {
    to: () => ({ emit: () => { } })
};

console.log('--- Starting Verification Tests: Player Mapping Robustness ---');

function testRemainingPlayerControl() {
    console.log('Test: Remaining Player Input Control (Fix Verification)');

    // 1. Setup Game with 2 Players
    const game = new ServerGame(mockIo, 'verify_room_1');
    const p1Socket = 'socket_p1';
    const p2Socket = 'socket_p2';

    game.addPlayer(p1Socket); // edgeIndex 0
    game.addPlayer(p2Socket); // edgeIndex 1

    game.start();
    game.toggleReady(p1Socket, true);
    game.toggleReady(p2Socket, true);

    // Safety check: Both paddles exist
    assert.equal(game.paddles.length, 2, 'Should start with 2 paddles');
    assert.equal(game.players.get(p1Socket), 0, 'P1 should be on edge 0');
    assert.equal(game.players.get(p2Socket), 1, 'P2 should be on edge 1');

    // 2. Remove Player 1
    // This shifts the paddles array length to 1. 
    // The previous bug was: game.paddles[1] would be undefined.
    // The fix is: find paddle with edgeIndex 1.
    game.removePlayer(p1Socket);

    // NOTE: In current logic, game terminates on leave during PLAYING. 
    // However, the input handling logic should still work regardless of game state 
    // IF the game were running (or if we relax the rule later).
    // Let's force the game to be "running" again for this test to verify the INPUT logic specifically.
    // Or we simply check handleInput's effect.

    // Force game state back to playing for test purposes (simulation)
    game.gameState = 'PLAYING';
    game.running = true;

    // Verify Paddle 0 is gone, Paddle 1 remains
    const paddle1 = game.paddles.find(p => p.edgeIndex === 0);
    const paddle2 = game.paddles.find(p => p.edgeIndex === 1);

    assert.ok(!paddle1, 'Paddle 0 should be removed');
    assert.ok(paddle2, 'Paddle 1 should remain');
    assert.equal(game.paddles.length, 1, 'Paddles array should have length 1');

    // 3. Player 2 Sends Input
    // If bug exists: index=1, paddles[1] is undefined (length=1). Error or ignored.
    // If fix works: index=1, find(p => p.edgeIndex===1) works.

    const moveDir = 1;
    game.handleInput(p2Socket, moveDir);

    // 4. Verify Input Applied
    assert.equal(paddle2.moveDirection, moveDir, 'Input should be applied to Player 2 paddle');

    console.log('✅ Passed: Remaining player (P2) can control paddle after P1 left.');
    game.stop();
}

function testSparseArrayHandling() {
    console.log('\nTest: Sparse/Unordered Paddle Array');
    // More complex scenario: 3 players, remove middle one.

    const game = new ServerGame(mockIo, 'verify_room_2');
    game.addPlayer('p1'); // 0
    game.addPlayer('p2'); // 1
    game.addPlayer('p3'); // 2

    // Remove P2 (index 1)
    game.removePlayer('p2');

    // Paddles should have edgeIndex 0 and 2. Array length 2.
    assert.equal(game.paddles.length, 2);
    const p1 = game.paddles.find(p => p.edgeIndex === 0);
    const p3 = game.paddles.find(p => p.edgeIndex === 2);

    assert.ok(p1, 'Player 1 paddle exists');
    assert.ok(p3, 'Player 3 paddle exists');

    // Fix check: Does p3 input work?
    // P3 -> edgeIndex 2.
    // If using array index: paddles[2] -> undefined (length 2).
    // Force game state to PLAYING so input is processed
    game.gameState = 'PLAYING';

    game.handleInput('p3', -1);
    assert.equal(p3.moveDirection, -1, 'Player 3 input should work despite sparse indices');

    console.log('✅ Passed: Sparse paddle indices handled correctly.');
    game.stop();
}

try {
    testRemainingPlayerControl();
    testSparseArrayHandling();
    console.log('--- All Verification Tests Passed ---');
} catch (e) {
    console.error('Test Failed:', e);
    process.exit(1);
}
