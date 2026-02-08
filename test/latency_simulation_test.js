
import { spawn } from 'child_process';
import { io } from 'socket.io-client';

// Helper for waiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const LATENCY = 200; // 200ms one-way latency -> ~400ms RTT
const PORT = 12123;

console.log('Starting Latency Simulation Test...');
console.log(`Expecting RTT >= ${LATENCY * 2}ms`);

// Start server with latency env var
const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: PORT.toString(), SIMULATED_LATENCY_MS: LATENCY.toString() },
    // stdio: 'inherit' // Uncomment to see server logs
});

let socket;
let timeout;

// Cleanup helper
function cleanup(code) {
    if (code === 0) {
        console.log('✅ PASS: Latency simulation verified.');
    } else {
        console.error('❌ FAIL: Latency simulation check failed.');
    }

    if (socket) socket.close();
    server.kill();
    clearTimeout(timeout);
    process.exit(code);
}

// Timeout fail-safe
timeout = setTimeout(() => {
    console.error('Test timed out!');
    cleanup(1);
}, 10000);

// Main test logic
async function runTest() {
    // Give server 2s to start
    await sleep(2000);

    console.log(`Connecting client to http://localhost:${PORT}...`);
    socket = io(`http://localhost:${PORT}`, {
        transports: ['websocket'],
        forceNew: true
    });

    socket.on('connect', () => {
        console.log('Connected!');
        socket.emit('joinRoom', 'latency_test_room');
    });

    socket.on('init', (data) => {
        const myIndex = data.playerIndex;
        console.log('Initialized, player index:', myIndex);

        // Wait a bit for things to settle
        setTimeout(() => {
            console.log('Sending playerReady...');
            const start = Date.now();
            socket.emit('playerReady', { ready: true });

            const checkReady = (state) => {
                if (state.readyEdges && state.readyEdges.includes(myIndex)) {
                    const end = Date.now();
                    const diff = end - start;
                    console.log(`Round trip time: ${diff}ms`);

                    // We expect input delay (200ms) + output delay (200ms) = 400ms minimum
                    // Add a small buffer for processing time
                    if (diff >= LATENCY * 2) {
                        cleanup(0);
                    } else {
                        console.error(`RTT too fast! Expected >= ${LATENCY * 2}ms, got ${diff}ms`);
                        cleanup(1);
                    }
                }
            };
            socket.on('gameState', checkReady);
        }, 500);
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        cleanup(1);
    });
}

runTest().catch(err => {
    console.error('Test error:', err);
    cleanup(1);
});
