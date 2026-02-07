
import { ServerGame } from '../server/ServerGame.js';
import { strict as assert } from 'assert';

// Mock IO
const mockIo = {
    to: () => ({ emit: () => { } })
};

console.log('--- Starting Client Authority Tests ---');

function startGame(game) {
    for (const socketId of game.players.keys()) {
        game.toggleReady(socketId, true);
    }
    // Stabilize ball for logic tests to prevent accidental goals from random directions
    game.ball.vx = 100; // Moving
    game.ball.vy = 100;
}

function testPendingGoalCreation() {
    console.log('\nTest: Goal Enters Pending State (Grace Period)');
    const game = new ServerGame(mockIo, 'test_room_pending');
    game.addPlayer('p1'); // Edge 0
    game.running = true;
    startGame(game);

    // Simulate playing state
    for (let i = 0; i < 200; i++) game.update(0.016);
    assert.equal(game.gameState, 'PLAYING');

    // Manually trigger onGoal for edge 0 (p1)
    // ServerGame usually calls onGoal from update(), let's call it directly to simulate physics detection
    game.onGoal(0);

    // Verify it didn't immediately score
    assert.equal(game.gameState, 'PLAYING', 'Game should still be PLAYING during grace period');
    assert.ok(game.pendingGoal, 'Should have a pending goal object');
    assert.equal(game.pendingGoal.edgeIndex, 0, 'Pending goal shoud be for edge 0');
    assert.ok(game.pendingGoal.timer > 0, 'Pending goal timer should be positive');

    console.log('✅ Passed: Goal entered pending state instead of immediate score.');
}

function testBounceClaimCancelsGoal() {
    console.log('\nTest: Valid Bounce Claim Cancels Pending Goal');
    const game = new ServerGame(mockIo, 'test_room_claim');
    game.addPlayer('p1'); // Edge 0
    game.running = true;
    startGame(game);

    // Enter playing
    for (let i = 0; i < 200; i++) game.update(0.016);

    // Trigger potential goal
    game.onGoal(0);
    assert.ok(game.pendingGoal);

    // Use current ball state
    const currentX = game.ball.x;
    const currentY = game.ball.y;

    // Simulate Client Claim: "No, I hit it! Ball is now moving away!"
    // New velocity = reflecting (simulated)
    const claimData = {
        ball: {
            x: currentX,
            y: currentY - 10, // Moved up?
            vx: 50,
            vy: -200 // Moving UP (away from edge 0 presumably, if edge 0 is bottom?)
            // Actually edge 0 is bottom
        },
        edgeIndex: 0
    };

    // Call handleBounceClaim directly (as socket handler would)
    game.handleBounceClaim('p1', claimData);

    // Verify Goal Cancelled
    assert.equal(game.pendingGoal, null, 'Pending goal should be cleared');
    assert.equal(game.gameState, 'PLAYING', 'Game should remain playing');

    // Verify Ball Updated
    // Depending on implementation, ball might snap or lerp. 
    // Server logic sets ball properties directly in handleBounceClaim:
    // this.ball.x = data.ball.x; this.ball.y = data.ball.y; etc.
    assert.equal(game.ball.vx, 50, 'Ball VX should be updated from claim');
    assert.equal(game.ball.vy, -200, 'Ball VY should be updated from claim');

    console.log('✅ Passed: Bounce claim saved the goal.');
}

function testInvalidBounceClaimIgnored() {
    console.log('\nTest: Bounce Claim for WRONG Edge is Ignored');
    const game = new ServerGame(mockIo, 'test_room_invalid_claim');
    const p1 = 'p1';
    const p2 = 'p2';
    game.addPlayer(p1); // Edge 0
    game.addPlayer(p2); // Edge 1
    game.running = true;
    startGame(game);

    // Enter playing
    for (let i = 0; i < 200; i++) game.update(0.016);

    // Trigger goal on P1 (Edge 0)
    game.onGoal(0);
    assert.ok(game.pendingGoal);
    assert.equal(game.pendingGoal.edgeIndex, 0);

    // P2 tries to claim it? (Malicious or confused client)
    const claimData = {
        ball: { x: 0, y: 0, vx: 0, vy: 0 },
        edgeIndex: 0 // Claiming for edge 0 (where goal is), but P2 owns edge 1
    };

    game.handleBounceClaim('p2', claimData);

    // Should NOT clear the goal on edge 0
    assert.ok(game.pendingGoal, 'Pending goal on edge 0 should persist');
    assert.equal(game.pendingGoal.edgeIndex, 0);

    console.log('✅ Passed: Invalid edge claim ignored.');
}

function testPendingGoalExpiration() {
    console.log('\nTest: Pending Goal Expires and Scores');
    const game = new ServerGame(mockIo, 'test_room_expiration');
    game.addPlayer('p1');
    game.running = true;
    startGame(game);
    for (let i = 0; i < 200; i++) game.update(0.016);

    // Trigger goal
    game.onGoal(0);
    assert.ok(game.pendingGoal);

    // Advance time past grace period (e.g. > 0.15s or whatever constant is)
    // Let's advance 1 second to be sure
    for (let i = 0; i < 60; i++) {
        game.update(0.016);
    }

    // Should now be SCORING
    assert.equal(game.gameState, 'SCORING', 'Game should have transitioned to SCORING after timeout');
    assert.equal(game.pendingGoal, null, 'Pending goal should be cleared after execution');

    console.log('✅ Passed: Expired pending goal triggered actual score.');
}


testPendingGoalCreation();
testBounceClaimCancelsGoal();
testInvalidBounceClaimIgnored();
testPendingGoalExpiration();

console.log('--- All Client Authority Tests Passed ---');
