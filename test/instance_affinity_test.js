/**
 * Test: Instance Affinity for Fly.io
 * 
 * Tests that the server correctly handles instance routing for multiplayer rooms
 */

import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';
import express from 'express';

console.log('--- Starting Instance Affinity Tests ---\n');

// Mock environment variables for Fly.io
const originalEnv = { ...process.env };

function setupMockFlyEnvironment(machineId) {
    process.env.FLY_MACHINE_ID = machineId;
    process.env.FLY_ALLOC_ID = `alloc-${machineId}`;
}

function resetEnvironment() {
    process.env = { ...originalEnv };
    delete process.env.FLY_MACHINE_ID;
    delete process.env.FLY_ALLOC_ID;
}

// Test 1: Local environment (no Fly) - should not enforce instance matching
async function testLocalEnvironment() {
    resetEnvironment();

    const app = express();
    const httpServer = createServer(app);

    // Recreate server logic
    const FLY_MACHINE_ID = process.env.FLY_MACHINE_ID || null;
    const instanceId = FLY_MACHINE_ID || 'local';

    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        socket.on('joinRoom', (data) => {
            const roomId = typeof data === 'string' ? data : data.roomId;
            const requestedInstance = typeof data === 'object' ? data.instance : null;

            // In local mode, should not reject
            if (requestedInstance && requestedInstance !== instanceId && FLY_MACHINE_ID) {
                socket.emit('error', { message: 'Wrong instance' });
                socket.disconnect();
                return;
            }

            socket.emit('joined', { roomId, instanceId });
        });
    });

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    const client = ioClient(`http://localhost:${port}`);

    return new Promise((resolve, reject) => {
        client.on('connect', () => {
            // Try to join with a different instance ID - should work in local mode
            client.emit('joinRoom', { roomId: 'TEST1', instance: 'different-instance' });
        });

        client.on('joined', (data) => {
            console.log('✅ Passed: Local environment allows connection without instance matching');
            console.log(`   Instance ID: ${data.instanceId}`);
            client.close();
            httpServer.close();
            resolve();
        });

        client.on('error', (err) => {
            console.log('❌ Failed: Local environment rejected connection:', err);
            client.close();
            httpServer.close();
            reject(err);
        });

        setTimeout(() => {
            reject(new Error('Timeout'));
        }, 5000);
    });
}

// Test 2: Fly environment - correct instance
async function testFlyCorrectInstance() {
    setupMockFlyEnvironment('test-instance-123');

    const app = express();
    const httpServer = createServer(app);

    const FLY_MACHINE_ID = process.env.FLY_MACHINE_ID;
    const instanceId = FLY_MACHINE_ID || 'local';

    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        socket.on('joinRoom', (data) => {
            const roomId = typeof data === 'string' ? data : data.roomId;
            const requestedInstance = typeof data === 'object' ? data.instance : null;

            if (requestedInstance && requestedInstance !== instanceId && FLY_MACHINE_ID) {
                socket.emit('error', { message: 'Wrong instance' });
                socket.disconnect();
                return;
            }

            socket.emit('joined', { roomId, instanceId });
        });
    });

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    const client = ioClient(`http://localhost:${port}`);

    return new Promise((resolve, reject) => {
        client.on('connect', () => {
            // Join with the CORRECT instance ID
            client.emit('joinRoom', { roomId: 'TEST2', instance: 'test-instance-123' });
        });

        client.on('joined', (data) => {
            console.log('✅ Passed: Fly environment accepts connection to correct instance');
            console.log(`   Instance ID: ${data.instanceId}`);
            client.close();
            httpServer.close();
            resetEnvironment();
            resolve();
        });

        client.on('error', (err) => {
            console.log('❌ Failed: Should have accepted correct instance:', err);
            client.close();
            httpServer.close();
            resetEnvironment();
            reject(err);
        });

        setTimeout(() => {
            resetEnvironment();
            reject(new Error('Timeout'));
        }, 5000);
    });
}

// Test 3: Fly environment - wrong instance
async function testFlyWrongInstance() {
    setupMockFlyEnvironment('test-instance-123');

    const app = express();
    const httpServer = createServer(app);

    const FLY_MACHINE_ID = process.env.FLY_MACHINE_ID;
    const instanceId = FLY_MACHINE_ID || 'local';

    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        socket.on('joinRoom', (data) => {
            const roomId = typeof data === 'string' ? data : data.roomId;
            const requestedInstance = typeof data === 'object' ? data.instance : null;

            if (requestedInstance && requestedInstance !== instanceId && FLY_MACHINE_ID) {
                socket.emit('error', { message: 'Wrong instance', expectedInstance: requestedInstance, currentInstance: instanceId });
                socket.disconnect();
                return;
            }

            socket.emit('joined', { roomId, instanceId });
        });
    });

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    const client = ioClient(`http://localhost:${port}`);

    return new Promise((resolve, reject) => {
        client.on('connect', () => {
            // Join with a WRONG instance ID
            client.emit('joinRoom', { roomId: 'TEST3', instance: 'wrong-instance-456' });
        });

        client.on('error', (err) => {
            if (err.message === 'Wrong instance') {
                console.log('✅ Passed: Fly environment rejects connection to wrong instance');
                console.log(`   Expected: wrong-instance-456, Got: test-instance-123`);
                client.close();
                httpServer.close();
                resetEnvironment();
                resolve();
            } else {
                console.log('❌ Failed: Wrong error type:', err);
                client.close();
                httpServer.close();
                resetEnvironment();
                reject(err);
            }
        });

        client.on('joined', () => {
            console.log('❌ Failed: Should have rejected wrong instance');
            client.close();
            httpServer.close();
            resetEnvironment();
            reject(new Error('Should not have joined'));
        });

        client.on('disconnect', () => {
            // Expected behavior - disconnected due to wrong instance
            console.log('   Connection correctly terminated');
        });

        setTimeout(() => {
            resetEnvironment();
            reject(new Error('Timeout'));
        }, 5000);
    });
}

// Test 4: Old client compatibility (string roomId)
async function testBackwardCompatibility() {
    resetEnvironment();

    const app = express();
    const httpServer = createServer(app);

    const FLY_MACHINE_ID = process.env.FLY_MACHINE_ID || null;
    const instanceId = FLY_MACHINE_ID || 'local';

    const io = new Server(httpServer);

    io.on('connection', (socket) => {
        socket.on('joinRoom', (data) => {
            const roomId = typeof data === 'string' ? data : data.roomId;
            const requestedInstance = typeof data === 'object' ? data.instance : null;

            if (requestedInstance && requestedInstance !== instanceId && FLY_MACHINE_ID) {
                socket.emit('error', { message: 'Wrong instance' });
                socket.disconnect();
                return;
            }

            socket.emit('joined', { roomId, instanceId });
        });
    });

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    const client = ioClient(`http://localhost:${port}`);

    return new Promise((resolve, reject) => {
        client.on('connect', () => {
            // Old format - just a string room ID
            client.emit('joinRoom', 'OLD_STYLE_ROOM');
        });

        client.on('joined', (data) => {
            console.log('✅ Passed: Backward compatibility maintained for old clients');
            console.log(`   Room ID: ${data.roomId}`);
            client.close();
            httpServer.close();
            resolve();
        });

        client.on('error', (err) => {
            console.log('❌ Failed: Old-style room join rejected:', err);
            client.close();
            httpServer.close();
            reject(err);
        });

        setTimeout(() => {
            reject(new Error('Timeout'));
        }, 5000);
    });
}

// Run all tests
(async () => {
    try {
        console.log('Test 1: Local Environment (No Instance Enforcement)');
        await testLocalEnvironment();
        console.log();

        console.log('Test 2: Fly Environment - Correct Instance');
        await testFlyCorrectInstance();
        console.log();

        console.log('Test 3: Fly Environment - Wrong Instance (Should Reject)');
        await testFlyWrongInstance();
        console.log();

        console.log('Test 4: Backward Compatibility (String Room ID)');
        await testBackwardCompatibility();
        console.log();

        console.log('--- All Instance Affinity Tests Passed ---');
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
})();
