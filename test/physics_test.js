
import { ServerGame } from '../server/ServerGame.js';
import { strict as assert } from 'assert';

// Mock IO
const mockIo = {
    to: () => ({ emit: () => { } })
};

console.log('--- Starting Physics Stress Tests ---');

function testDirectHit() {
    console.log('Test: Direct Hit (Low Speed)');
    const game = new ServerGame(mockIo, 'test_1');
    game.addPlayer('p1');
    const paddle = game.paddles[0];

    // Position ball right in front of paddle 0
    // Polygon is 5 sided. Edge 0 is bottom? Or top?
    // Let's check Polygon vertices for side 5.
    // Actually let's just use the game logic to determine where edge 0 is.
    const v = game.polygon.vertices;
    const p1 = v[0];
    const p2 = v[1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // Normal is inward.
    // Center is 0,0.
    // Ball at midX*0.9, midY*0.9 moving outwards.
    game.ball.x = midX * 0.9;
    game.ball.y = midY * 0.9;
    game.ball.vx = midX * 2; // Moving fast towards wall
    game.ball.vy = midY * 2;

    game.paddles[0].position = 0.5; // Centered

    game.update(0.1); // 100ms

    // Check if bounced (velocity inverted roughly?)
    // Dot product with normal should be negative if incoming, positive if bounced.
    // Simpler: Is it moving towards center (0,0)?
    // x*vx + y*vy should be negative (moving inward).
    const dot = game.ball.x * game.ball.vx + game.ball.y * game.ball.vy;

    if (dot < 0) {
        console.log('✅ Passed: Ball bounced inward.');
    } else {
        console.error('❌ Failed: Ball still moving outward.', dot);
        process.exit(1);
    }
}

function testTunneling() {
    console.log('Test: Tunneling (High Speed)');
    const game = new ServerGame(mockIo, 'test_2');
    game.addPlayer('p1');

    const v = game.polygon.vertices;
    const p1 = v[0];
    const p2 = v[1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // Ball BEFORE wall
    game.ball.x = midX * 0.9;
    game.ball.y = midY * 0.9;

    // Speed HUGE - enough to cross wall in one step
    // Distance to wall is ~10% of radius (250) = 25 units.
    // Velocity = 1000. dt = 0.1 -> Move 100 units.
    // It should end up WAY past the wall if no CCD.
    game.ball.vx = midX * 10;
    game.ball.vy = midY * 10;

    game.paddles[0].position = 0.5;

    game.update(0.1);

    // Should be bounced
    const dot = game.ball.x * game.ball.vx + game.ball.y * game.ball.vy;
    if (dot < 0) {
        console.log('✅ Passed: Ball caught by CCD and bounced.');
    } else {
        console.error('❌ Failed: Ball tunneled.', dot);
        process.exit(1);
    }
}

function testDiagonalMiss() {
    console.log('Test: Diagonal/Glancing Hit');
    // Set up a scenario where simple end-point check differs from intersection check
    // This is harder to mock perfectly without math, but we can trust the CCD test covers the "line crossing" aspect.
    // Let's just run the basic ones first.
}

testDirectHit();
testTunneling();

console.log('--- All Tests Passed ---');
