# Instance Affinity Implementation - Quick Reference

## What Was Implemented

✅ **Fly.io Instance-Specific Routing** for multiplayer game rooms

Every multiplayer room is now tied to a specific Fly.io instance, ensuring all players connect to the same server instance that hosts the game state.

## Files Modified

### Server-Side
- **`server/index.js`**
  - Added instance ID detection from Fly environment variables
  - Added HTTP middleware to handle `fly-replay` headers
  - Added Socket.io `allowRequest` validation
  - Added `/api/instance` endpoint to expose instance info
  - Updated `joinRoom` handler to verify instance matching

### Client-Side
- **`src/main.js`**
  - Added `getInstanceInfo()` function to fetch instance from server
  - Updated room creation to include instance in URL
  - Updated URL parsing to extract instance parameter
  - Modified multiplayer connection to pass instance ID

- **`src/game/Game.js`**
  - Updated `startMultiplayer()` to accept and use instance parameter
  - Added instance to WebSocket query parameters
  - Added instance to `joinRoom` event data
  - Updated `stopMultiplayer()` to clear instance
  - Updated `rejoinMultiplayer()` to reuse stored instance
  - Added error handler for instance mismatch

### Documentation & Tests
- **`FLY_INSTANCE_AFFINITY.md`** (new)
  - Comprehensive documentation of the implementation
  - Flow diagrams and examples
  - Testing instructions

- **`test/instance_affinity_test.js`** (new)
  - Tests for local environment (no enforcement)
  - Tests for Fly environment (correct instance)
  - Tests for Fly environment (wrong instance rejection)
  - Tests for backward compatibility

- **`package.json`**
  - Added instance affinity test to test suite

## How It Works

### 1. Creating a Room

```
User clicks "GO ONLINE"
    ↓
Frontend calls /api/instance → Gets instanceId (e.g., "abc123")
    ↓
URL: /?room=XY4Z&instance=abc123
    ↓
WebSocket connects with query: { instance: "abc123" }
    ↓
Server verifies match → Game created on instance abc123
```

### 2. Joining a Room

```
User opens /?room=XY4Z&instance=abc123
    ↓
WebSocket connects with query: { instance: "abc123" }
    ↓
Fly proxy routes to instance abc123 (via fly-replay)
    ↓
User joins existing game
```

## Key Features

✅ **Instance Affinity**: All room participants connect to the same instance  
✅ **Automatic Routing**: Fly.io's `fly-replay` redirects to correct instance  
✅ **Backward Compatible**: Old clients without instance still work  
✅ **Local Development**: Works seamlessly on localhost (no enforcement)  
✅ **Reconnection Support**: Stores instance for rejoining after disconnect  
✅ **Full Test Coverage**: All existing + new tests pass ✅

## Testing

Run all tests including instance affinity:
```bash
npm test
```

Run only instance affinity tests:
```bash
node test/instance_affinity_test.js
```

## URLs

**Before (not instance-aware):**
```
https://polypongon.fly.dev/?room=ABC1
```

**After (instance-aware on Fly):**
```
https://polypongon.fly.dev/?room=ABC1&instance=73d8d28d6ee438
```

**Locally (instance enforcement disabled):**
```
http://localhost:12122/?room=ABC1
```

## Environment Variables

The server automatically reads these Fly.io variables:
- `FLY_MACHINE_ID`: Primary instance identifier
- `FLY_ALLOC_ID`: Fallback instance identifier

No manual configuration needed!

## Deployment

Simply deploy to Fly.io as usual:
```bash
fly deploy
```

The instance affinity will work automatically on Fly.io. On other platforms or localhost, it gracefully degrades (no enforcement).

## For More Details

See **`FLY_INSTANCE_AFFINITY.md`** for comprehensive documentation including:
- Detailed implementation breakdown
- Flow diagrams
- Testing procedures
- Limitations and future improvements
