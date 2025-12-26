# Server API Endpoint Tests

## Purpose

The **`test/server_api_test.js`** file was created to catch route ordering bugs in Express that could cause API endpoints to be intercepted by catch-all routes.

## What Bug It Would Have Caught

### The Problem
In the initial implementation, the `/api/instance` endpoint was defined **after** the catch-all route:

```javascript
// ❌ WRONG ORDER (causes bug)
app.use(express.static(distPath));
app.get(/^.*$/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.get('/api/instance', (req, res) => {  // This never gets hit!
  res.json({ instanceId, isFlyInstance });
});
```

This caused:
- `GET /api/instance` → Returned `index.html` (❌)
- Status: 200 OK
- Content-Type: `text/html` instead of `application/json`
- Response body: HTML instead of JSON

### The Fix
API routes must be defined **before** the catch-all:

```javascript
// ✅ CORRECT ORDER
app.get('/api/instance', (req, res) => {
  res.json({ instanceId, isFlyInstance });
});

app.use(express.static(distPath));
app.get(/^.*$/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
```

## What The Tests Check

### Test 1: `/api/instance` Returns JSON (Not HTML)
Tests 8 different assertions:
1. ✅ Status code is 200
2. ✅ Content-Type is `application/json`
3. ✅ Response is NOT HTML
4. ✅ Response is valid JSON
5. ✅ Has `instanceId` field
6. ✅ Has `isFlyInstance` field  
7. ✅ `instanceId` value is correct
8. ✅ `isFlyInstance` value is correct

**This is the key test that would have caught the bug!**

### Test 2: Catch-All Still Works
Verifies that non-API routes (like `/some-page`) still serve the HTML SPA correctly.

### Test 3: Bug Simulation
Intentionally creates the buggy route order and verifies that the test **would detect it**. This proves the test is effective.

### Test 4: Multiple API Endpoints
Tests that having multiple API endpoints doesn't cause interference:
- `/api/instance`
- `/api/health`  
- `/api/rooms`

## How To Run

Run all tests:
```bash
npm test
```

Run only server API tests:
```bash
node test/server_api_test.js
```

## Expected Output

```
--- Starting Server API Endpoint Tests ---

Test 1: /api/instance Returns JSON (Not HTML)
✅ Passed: Status code is 200
✅ Passed: Content-Type is application/json
✅ Passed: Response is not HTML
✅ Passed: Response is valid JSON
✅ Passed: Has 'instanceId' field
✅ Passed: Has 'isFlyInstance' field
✅ Passed: instanceId matches expected value
✅ Passed: isFlyInstance matches expected value

Test 2: Catch-All Still Works for Non-API Routes
✅ Passed: Catch-all serves HTML for non-API routes

Test 3: Verify Test Detects Wrong Route Order (Bug Simulation)
✅ Passed: Test correctly detects wrong route order (returns HTML)
   This confirms the test would have caught the bug!

Test 4: Multiple API Endpoints Work
✅ Passed: Multiple API endpoints work correctly

--- All Server API Tests Passed ---

🎯 These tests would have caught the route ordering bug!
```

## Benefits

1. **Prevents Regression**: Route ordering bugs won't happen again
2. **Documents Expected Behavior**: Clear what the API should return
3. **Fast Feedback**: Catches issues before deployment
4. **Comprehensive**: Tests multiple scenarios and edge cases
5. **Self-Verifying**: Includes a test that proves it would catch the bug

## Integration

The test is now part of the main test suite in `package.json`:

```json
{
  "scripts": {
    "test:unit": "... && node test/server_api_test.js"
  }
}
```

Every `npm test` run will verify API endpoints work correctly!
