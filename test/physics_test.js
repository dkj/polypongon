
import { ServerGame } from '../server/ServerGame.js';
import { strict as assert } from 'assert';

// Mock IO
const mockIo = {
    to: () => ({ emit: () => { } })
};

console.log('--- Starting Physics Tests ---');

function testWallReflection() {
    console.log('Test: Wall Reflection');
    const game = new ServerGame(mockIo, 'test_room');

    // Set up: 4-sided polygon (Square) for easy math
    // 0: (-250, -250) -> (250, -250) (Top)
    // 1: (250, -250) -> (250, 250) (Right)
    // 2: (250, 250) -> (-250, 250) (Bottom)
    // 3: (-250, 250) -> (-250, -250) (Left)
    // Note: Default Polygon starts at angle -PI/2? Let's check Polygon.js or just force vertices.
    game.polygon.sides = 4;
    game.polygon.rotation = Math.PI / 4; // Rotate to align with axes if needed, or just specific vertices.
    // Easier: Just force vertices for the test context
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    // Case 1: Hitting Top Wall (y = -100) moving Up
    game.ball.x = 0;
    game.ball.y = -95;
    game.ball.vx = 0;
    game.ball.vy = -50;
    game.ball.radius = 5;

    // Simulate update
    // We need to call checkCollisions. It requires prev position.
    const prevX = 0;
    const prevY = -90;
    game.checkCollisions(prevX, prevY);

    // Expect velocity flip in Y
    if (game.ball.vy > 0) {
        console.log('✅ Passed: Ball reflected off top wall (vy > 0).');
    } else {
        console.error('❌ Failed: Ball did not reflect.', game.ball.vy);
        process.exit(1);
    }
}

function testPaddleHit() {
    console.log('Test: Paddle Hit');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;

    // Define Wall 0 as Top: (-100, -100) -> (100, -100)
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    // Add Paddle to Wall 0 (Top)
    const edgeIndex = game.addPlayer('p1'); // Should be 0
    assert.equal(edgeIndex, 0);

    const paddle = game.paddles[0];
    paddle.position = 0.5; // Center
    paddle.width = 0.2; // 20% width => 200 * 0.2 = 40 units wide. Center at 0. Range [-20, 20].

    // Ball hitting Paddle
    game.ball.x = 0;
    game.ball.y = -95;
    game.ball.vx = 0;
    game.ball.vy = -50;

    const prevX = 0;
    const prevY = -90;
    game.checkCollisions(prevX, prevY);

    if (game.ball.vy > 0) {
        console.log('✅ Passed: Ball hit paddle and reflected.');
    } else {
        console.error('❌ Failed: Ball passed through paddle?', game.ball.vy);
        process.exit(1);
    }
}

function testPaddleMiss() {
    console.log('Test: Paddle Miss (Goal)');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    game.addPlayer('p1'); // Wall 0
    const paddle = game.paddles[0];
    paddle.position = 0.5; // Center (0)
    paddle.width = 0.2; // Rad [-20, 20]

    // Ball hitting Wall 0 at x = 50 (Outside paddle range)
    game.ball.x = 50;
    game.ball.y = -95;
    game.ball.vx = 0;
    game.ball.vy = -50;

    const prevX = 50;
    const prevY = -90;

    game.checkCollisions(prevX, prevY);

    if (game.gameState === 'SCORING') {
        console.log('✅ Passed: Ball missed paddle and triggered goal.');
    } else {
        console.error('❌ Failed: Game state did not change to SCORING.', game.gameState);
        // Maybe it reflected nicely?
        process.exit(1);
    }
}

function testTunneling() {
    console.log('Test: Tunneling (Fast Ball)');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    // Ball moves FAST from inside to outside in one frame
    // Start: (0, -50)
    // End: (0, -150) (Past wall at -100)
    game.ball.x = 0;
    game.ball.y = -150;
    game.ball.vx = 0;
    game.ball.vy = -1000; // Very fast

    const prevX = 0;
    const prevY = -50;

    // We rely on checkCollisions using previous position
    game.checkCollisions(prevX, prevY);

    // Should detect collision and reflect/clamp
    // In ServerGame it reflects.
    if (game.ball.y > -100 && game.ball.vy > 0) {
        console.log('✅ Passed: Fast ball tunnel detected and resolved.');
    } else {
        console.error('❌ Failed: Tunneling not prevented.', game.ball.y, game.ball.vy);
        process.exit(1);
    }
}

function testVertexCollision() {
    console.log('Test: Vertex Collision (Join of two walls)');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;
    game.polygon.vertices = [
        { x: -100, y: -100 }, // Vertex 0
        { x: 100, y: -100 },  // Vertex 1
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    // Target Vertex 1 (Top-Right): (100, -100)
    // Ball moving towards it at 45 degrees
    game.ball.x = 98;
    game.ball.y = -98;
    game.ball.radius = 5;
    game.ball.vx = 100;
    game.ball.vy = -100;

    const prevX = 90;
    const prevY = -90;

    game.checkCollisions(prevX, prevY);

    // It should hit EITHER wall 0 (Top) or wall 1 (Right).
    // The key is that it doesn't pass through or crash.
    (game.ball.vx < 0 && game.ball.vy < 0) || (game.ball.vx > 0 && game.ball.vy > 0);
    // Actually if it hits corner, it might reflect back (-vx, -vy) or glance off one side.

    // Simply check it's strictly inside the bounds or has reflected inward
    // Since we pushBallOut, it should be safe.

    // Let's check if it reflected.
    // If it hit top wall -> vy becomes positive
    // If it hit right wall -> vx becomes negative
    // If it hit corner perfectly -> both might flip?

    if (game.ball.vx < 0 || game.ball.vy > 0) {
        console.log('✅ Passed: Vertex collision handled (Reflected).');
    } else {
        console.error('❌ Failed: Ball stuck or passed through vertex?', game.ball.vx, game.ball.vy);
        process.exit(1);
    }
}

function testInfiniteLineGlitch() {
    console.log('Test: Infinite Line Glitch');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    // Case: Ball is at (200, -100).
    // This is far outside the Right Wall (x=100).
    // But it lies exactly on the infinite line of the Top Wall (y=-100).
    game.ball.x = 200;
    game.ball.y = -100;
    game.ball.radius = 5;
    game.ball.vx = -10; // Moving left
    game.ball.vy = 0;

    const prevX = 205;
    const prevY = -100;

    // Check collisions
    // We expect NO collision with Top Wall (Wall 0).
    // Depending on logic, it might detect nothing (valid) or collision with Wall 0 (Bug).

    // We spy on 'reflectBall' or check if collided
    let reflected = false;
    game.reflectBall = () => { reflected = true; };

    game.checkCollisions(prevX, prevY);

    if (reflected) {
        console.error('❌ Failed: Ghost collision detected on infinite line extension!');
        process.exit(1);
    } else {
        console.log('✅ Passed: No ghost collision (Infinite Line ignored).');
    }
}

function testGraceMargin() {
    console.log('Test: Grace Margin (Near Miss should be Hit)');
    const game = new ServerGame(mockIo, 'test_room');
    game.polygon.sides = 4;
    game.polygon.vertices = [
        { x: -100, y: -100 },
        { x: 100, y: -100 },
        { x: 100, y: 100 },
        { x: -100, y: 100 }
    ];

    game.addPlayer('p1'); // Wall 0
    const paddle = game.paddles[0];
    paddle.position = 0.5;
    paddle.width = 0.2;
    // Wall len = 200. Width = 0.2 * 200 = 40. Radius = 20.
    // Center at (0, -100). X range [-20, 20].

    // Strict max X = 20.
    // Grace 1.1 => Width * 1.1 = 44. Radius = 22.
    // X range [-22, 22].

    // Hit at X = 21. Should be a HIT with grace, MISS without.

    game.ball.x = 21;
    game.ball.y = -95;
    game.ball.vx = 0;
    game.ball.vy = -50;

    const prevX = 21;
    const prevY = -90;

    game.checkCollisions(prevX, prevY);

    if (game.ball.vy > 0) {
        console.log('✅ Passed: Near-miss hit detected due to grace margin.');
    } else {
        console.error('❌ Failed: Grace margin did not catch the ball.', game.ball.x);
        process.exit(1);
    }
}

// Run Tests
try {
    testWallReflection();
    testPaddleHit();
    testPaddleMiss();
    testTunneling();
    testVertexCollision();
    testVertexCollision();
    testInfiniteLineGlitch();
    testGraceMargin();
    console.log('--- All Physics Tests Passed ---');
} catch (e) {
    console.error('Test Suite Failed:', e);
    process.exit(1);
}
