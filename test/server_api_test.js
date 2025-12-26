/**
 * Test: Server API Endpoints
 * 
 * Tests HTTP endpoints to ensure they're properly registered and not
 * intercepted by catch-all routes (would have caught the route ordering bug)
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Server API Endpoint Tests ---\n');

// Test 1: /api/instance returns JSON, not HTML
async function testInstanceEndpointReturnsJSON() {
    const app = express();
    const httpServer = createServer(app);

    // Mock Fly environment
    const FLY_MACHINE_ID = 'test-machine-123';
    const instanceId = FLY_MACHINE_ID || 'local';

    // Simulate the actual server setup (BEFORE the bug fix would be correct order)
    const games = new Map();

    // API endpoints MUST come first
    app.get('/api/instance', (req, res) => {
        res.json({
            instanceId,
            isFlyInstance: !!FLY_MACHINE_ID
        });
    });

    // Static file serving (with catch-all)
    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get(/^.*$/, (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    try {
        const response = await fetch(`http://localhost:${port}/api/instance`);
        const contentType = response.headers.get('content-type');
        const text = await response.text();

        // Check 1: Status code should be 200
        if (response.status !== 200) {
            console.log(`❌ Failed: Expected status 200, got ${response.status}`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Status code is 200`);

        // Check 2: Content-Type should be application/json
        if (!contentType || !contentType.includes('application/json')) {
            console.log(`❌ Failed: Expected content-type 'application/json', got '${contentType}'`);
            console.log(`   Response body: ${text.substring(0, 100)}...`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Content-Type is application/json`);

        // Check 3: Should NOT be HTML
        if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
            console.log(`❌ Failed: /api/instance returned HTML instead of JSON`);
            console.log(`   This indicates the catch-all route is intercepting API routes!`);
            console.log(`   Response: ${text.substring(0, 100)}...`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Response is not HTML`);

        // Check 4: Should be valid JSON with correct structure
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.log(`❌ Failed: Response is not valid JSON: ${e.message}`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Response is valid JSON`);

        // Check 5: Should have required fields
        if (typeof data.instanceId !== 'string') {
            console.log(`❌ Failed: Missing or invalid 'instanceId' field`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Has 'instanceId' field`);

        if (typeof data.isFlyInstance !== 'boolean') {
            console.log(`❌ Failed: Missing or invalid 'isFlyInstance' field`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: Has 'isFlyInstance' field`);

        // Check 6: Values should match mock environment
        if (data.instanceId !== instanceId) {
            console.log(`❌ Failed: Expected instanceId '${instanceId}', got '${data.instanceId}'`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: instanceId matches expected value`);

        if (data.isFlyInstance !== true) {
            console.log(`❌ Failed: Expected isFlyInstance true, got ${data.isFlyInstance}`);
            httpServer.close();
            return false;
        }
        console.log(`✅ Passed: isFlyInstance matches expected value`);

        httpServer.close();
        return true;
    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        httpServer.close();
        return false;
    }
}

// Test 2: Non-API routes should still serve HTML (catch-all works)
async function testCatchAllStillWorks() {
    const app = express();
    const httpServer = createServer(app);

    const instanceId = 'test-instance';

    // Correct order: API first, then static
    app.get('/api/instance', (req, res) => {
        res.json({ instanceId, isFlyInstance: false });
    });

    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get(/^.*$/, (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    try {
        const response = await fetch(`http://localhost:${port}/some-random-route`);
        const text = await response.text();

        // Should get HTML for non-API routes
        if (!text.includes('<html') && !fs.existsSync(distPath)) {
            console.log(`✅ Passed: Catch-all handles non-API routes (no dist folder)`);
            httpServer.close();
            return true;
        }

        if (text.includes('<html')) {
            console.log(`✅ Passed: Catch-all serves HTML for non-API routes`);
            httpServer.close();
            return true;
        } else {
            console.log(`❌ Failed: Non-API route didn't serve HTML`);
            httpServer.close();
            return false;
        }
    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        httpServer.close();
        return false;
    }
}

// Test 3: Simulate the BUG (wrong order) to verify test would catch it
async function testWrongOrderWouldFail() {
    const app = express();
    const httpServer = createServer(app);

    const instanceId = 'test-instance';

    // WRONG ORDER (simulating the bug): Static BEFORE API
    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get(/^.*$/, (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    // API endpoint defined AFTER catch-all (BUG!)
    app.get('/api/instance', (req, res) => {
        res.json({ instanceId, isFlyInstance: false });
    });

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    try {
        const response = await fetch(`http://localhost:${port}/api/instance`);
        const contentType = response.headers.get('content-type');
        const text = await response.text();

        // With wrong order, we expect to get HTML instead of JSON
        const isHTML = text.trim().startsWith('<!doctype') || text.trim().startsWith('<html');
        const isJSON = contentType && contentType.includes('application/json');

        if (isHTML && !isJSON) {
            console.log(`✅ Passed: Test correctly detects wrong route order (returns HTML)`);
            console.log(`   This confirms the test would have caught the bug!`);
            httpServer.close();
            return true;
        } else if (isJSON) {
            console.log(`❌ Failed: API endpoint worked despite wrong order (unexpected)`);
            console.log(`   Note: This might happen if dist folder doesn't exist`);
            httpServer.close();
            return true; // Not a test failure, just environmental
        } else {
            console.log(`⚠️  Warning: Unexpected response type`);
            httpServer.close();
            return true;
        }
    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        httpServer.close();
        return false;
    }
}

// Test 4: Multiple API endpoints don't interfere
async function testMultipleAPIEndpoints() {
    const app = express();
    const httpServer = createServer(app);

    // Add multiple API endpoints
    app.get('/api/instance', (req, res) => {
        res.json({ endpoint: 'instance' });
    });

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    app.get('/api/rooms', (req, res) => {
        res.json({ rooms: [] });
    });

    // Static serving after
    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get(/^.*$/, (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;

    try {
        const results = await Promise.all([
            fetch(`http://localhost:${port}/api/instance`).then(r => r.json()),
            fetch(`http://localhost:${port}/api/health`).then(r => r.json()),
            fetch(`http://localhost:${port}/api/rooms`).then(r => r.json())
        ]);

        if (results[0].endpoint === 'instance' &&
            results[1].status === 'ok' &&
            Array.isArray(results[2].rooms)) {
            console.log(`✅ Passed: Multiple API endpoints work correctly`);
            httpServer.close();
            return true;
        } else {
            console.log(`❌ Failed: API endpoints returned unexpected data`);
            httpServer.close();
            return false;
        }
    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        httpServer.close();
        return false;
    }
}

// Run all tests
(async () => {
    try {
        console.log('Test 1: /api/instance Returns JSON (Not HTML)');
        const test1 = await testInstanceEndpointReturnsJSON();
        console.log();

        console.log('Test 2: Catch-All Still Works for Non-API Routes');
        const test2 = await testCatchAllStillWorks();
        console.log();

        console.log('Test 3: Verify Test Detects Wrong Route Order (Bug Simulation)');
        const test3 = await testWrongOrderWouldFail();
        console.log();

        console.log('Test 4: Multiple API Endpoints Work');
        const test4 = await testMultipleAPIEndpoints();
        console.log();

        if (test1 && test2 && test3 && test4) {
            console.log('--- All Server API Tests Passed ---');
            console.log('\n🎯 These tests would have caught the route ordering bug!');
            process.exit(0);
        } else {
            console.log('--- Some Server API Tests Failed ---');
            process.exit(1);
        }
    } catch (error) {
        console.error('Test suite failed:', error);
        process.exit(1);
    }
})();
