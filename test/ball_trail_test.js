
import { Ball } from '../src/game/Ball.js';
import { strict as assert } from 'assert';

console.log('--- Starting Ball Trail Tests ---');

function testTrailInitialization() {
    console.log('Test: Trail Initialization');
    const ball = new Ball(0, 0);

    assert.ok(Array.isArray(ball.trail), 'Trail should be an array');
    assert.equal(ball.trail.length, 0, 'Trail should start empty');
    assert.equal(ball.maxTrailLength, 20, 'Max trail length should be 20');
}

function testUpdateAddsToTrail() {
    console.log('Test: Update Adds To Trail');
    const ball = new Ball(0, 0);

    // Simulate one update
    ball.update(0.1);

    assert.equal(ball.trail.length, 1, 'Trail should have 1 point after update');
    // Trail stores POSITION (x,y), which update() changes.
    // However, update() puts the NEW position into the trail?
    // Let's check logic: update moves x/y, then unshift(x,y). So trail[0] == current pos.

    assert.equal(ball.trail[0].x, ball.x, 'Trail point should match current ball position');
    assert.equal(ball.trail[0].y, ball.y, 'Trail point should match current ball position');
}

function testTrailMaxLengthCapping() {
    console.log('Test: Trail Max Length Capping');
    const ball = new Ball(0, 0);

    // Check initial max
    assert.equal(ball.maxTrailLength, 20);

    // Simulate more updates than max length
    for (let i = 0; i < 30; i++) {
        ball.update(0.1);
    }

    assert.equal(ball.trail.length, 20, 'Trail length should be capped at 20');
}

function testManualUpdateTrail() {
    console.log('Test: Manual updateTrail() Call');
    const ball = new Ball(0, 0);

    // Move ball manually without physics update
    ball.x = 100;
    ball.y = 100;

    // Manually register trail point (like in online interpolation)
    ball.updateTrail();

    assert.equal(ball.trail.length, 1, 'Should add point manually');
    assert.equal(ball.trail[0].x, 100, 'Should record correct position');
    assert.equal(ball.trail[0].y, 100, 'Should record correct position');
}

testTrailInitialization();
testUpdateAddsToTrail();
testTrailMaxLengthCapping();
testManualUpdateTrail();

console.log('--- All Ball Trail Tests Passed ---');
