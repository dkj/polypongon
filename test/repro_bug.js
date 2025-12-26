
import { Game } from '../src/game/Game.js';
import { Paddle } from '../src/game/Paddle.js';

// Mock Canvas
const canvas = {
    getContext: () => ({
        save: () => { },
        restore: () => { },
        translate: () => { },
        scale: () => { },
        rotate: () => { },
        beginPath: () => { },
        moveTo: () => { },
        lineTo: () => { },
        stroke: () => { },
        fill: () => { },
        fillRect: () => { },
        fillText: () => { },
        measureText: () => ({ width: 0 }),
        arc: () => { },
        closePath: () => { },
    }),
    width: 800,
    height: 600,
    addEventListener: () => { }
};
global.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: () => { },
    removeEventListener: () => { },
    AudioContext: class {
        createOscillator() { return { connect: () => { }, start: () => { }, stop: () => { }, frequency: { value: 0 }, type: '' }; }
        createGain() { return { connect: () => { }, gain: { value: 0, linearRampToValueAtTime: () => { }, setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { } } }; }
        destination = {};
        currentTime = 0;
    },
    webkitAudioContext: class { }
};
global.document = {
    addEventListener: () => { },
    documentElement: {
        style: {
            setProperty: () => { }
        }
    },
    getElementById: () => ({
        addEventListener: () => { },
        style: {},
        focus: () => { }
    }),
    querySelector: () => ({
        getContext: () => ({}),
        addEventListener: () => { },
        style: {}
    })
};
// Fake requestAnimationFrame
global.requestAnimationFrame = (_cb) => { }; // No op, we drive loop manually

console.log('--- Starting Repro Test ---');

const game = new Game(canvas);

// 1. Simulate running game
game.start();
game.gameState = 'PLAYING';
game.paddles = [new Paddle(0)];
game.paddles[0].width = 0.5;

// Move ball to wall to cause goal
game.ball.x = 240;
game.ball.y = 0;
game.ball.vx = 100;
game.ball.vy = 0;

console.log('1. Simulation: Causing Goal...');
// Run update to trigger goal
game.update(0.1);
// Check collision should trigger goal
if (game.gameState === 'SCORING') {
    console.log('Goal triggered correctly. GameState:', game.gameState);
} else {
    console.error('Goal failed to trigger? GameState:', game.gameState);
    game.checkCollisions(240, 0); // debug
    console.log('Retrying check... State:', game.gameState);
}

// 2. Simulate User clicking reset
console.log('2. User clicks Reset/Space...');
game.resetLocalGame();

console.log('State after reset:');
console.log('GameState:', game.gameState); // Should be PLAYING
console.log('Ball:', game.ball.x, game.ball.y); // Should be 0,0
console.log('Score:', game.score); // 0

// 3. Run first frame of new game
console.log('3. Running first frame of new game...');
const dt = 0.016;
game.update(dt);

console.log('State after frame 1:');
console.log('Score:', game.score); // Should be ~0.016
console.log('Ball:', game.ball.x, game.ball.y);
console.log('GameState:', game.gameState); // Should still be PLAYING!

if (game.gameState === 'SCORING') {
    console.error('❌ BUG REPRODUCED: Immediate goal conceded!');
    process.exit(1);
} else {
    console.log('✅ Passed: Game continued normally.');
}

console.log('--- End Repro Test ---');
