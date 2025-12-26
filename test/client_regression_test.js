
import { Game } from '../src/game/Game.js';
import { Paddle } from '../src/game/Paddle.js';
import { strict as assert } from 'assert';

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
global.requestAnimationFrame = (_cb) => { };

console.log('--- Starting Client Regression Tests ---');

function testMultiplayerToLocalPaddleReset() {
    console.log('Test: Multiplayer to Local Paddle Reset');
    const game = new Game(canvas);

    // 1. Simulate Multiplayer state with multiple paddles
    game.mode = 'online';
    game.paddles = [
        new Paddle(0),
        new Paddle(1),
        new Paddle(2)
    ];

    assert.equal(game.paddles.length, 3, 'Should start with 3 paddles');

    // 2. Stop Multiplayer (revert to local)
    game.stopMultiplayer();

    assert.equal(game.paddles.length, 1, 'Only 1 paddle should remain after reverting to local');
    assert.equal(game.paddles[0].edgeIndex, 0, 'Remaining paddle should be at edge 0');
    assert.equal(game.gameState, 'SCORING', 'Game should be in SCORING (frozen) state after stopping multiplayer');
    assert.equal(game.hasPlayed, false, 'hasPlayed should be false to show Welcome screen');

    console.log('✅ Passed: Multiplayer to local paddle reset.');
}

try {
    testMultiplayerToLocalPaddleReset();
    console.log('--- All Client Regression Tests Passed ---');
} catch (e) {
    console.error('❌ Test Failed:', e);
    process.exit(1);
}
