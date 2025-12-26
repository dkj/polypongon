# Fly.io Instance Affinity for Multiplayer Rooms

## Overview

This document explains how Polypongon ensures that all players in a multiplayer room connect to the same Fly.io instance, even when Fly's global proxy might initially route connections to different instances.

## Why Instance Affinity Matters

In a multiplayer game, the game state (ball position, paddle positions, scores, etc.) is maintained on a specific server instance. If players connect to different instances, they would be playing in separate game rooms despite sharing the same room ID. Instance affinity solves this by:

1. **Assigning each room to a specific Fly instance**
2. **Encoding the instance ID in shareable room URLs**
3. **Using Fly's routing mechanisms to direct all traffic to the correct instance**

## Implementation Details

### 1. Server-Side (server/index.js)

#### Instance Detection
```javascript
const FLY_ALLOC_ID = process.env.FLY_ALLOC_ID || null;
const FLY_MACHINE_ID = process.env.FLY_MACHINE_ID || null;
const instanceId = FLY_MACHINE_ID || FLY_ALLOC_ID || 'local';
```

Fly.io provides these environment variables automatically:
- `FLY_MACHINE_ID`: The unique ID of the machine running the code
- `FLY_ALLOC_ID`: Alternative allocation ID (fallback)

#### HTTP Middleware for WebSocket Upgrades
```javascript
app.use((req, res, next) => {
  const isWebSocketUpgrade = req.headers.upgrade === 'websocket';
  
  if (isWebSocketUpgrade) {
    const targetInstance = req.query.instance || req.headers['x-fly-instance'];
    
    if (targetInstance && targetInstance !== instanceId && FLY_MACHINE_ID) {
      console.log(`Replaying WebSocket connection from ${instanceId} to ${targetInstance}`);
      res.set('fly-replay', `instance=${targetInstance}`);
      return res.status(307).end();
    }
  }
  
  next();
});
```

The `fly-replay` header tells Fly's proxy to redirect the request to the specified instance.

#### Socket.io Configuration
```javascript
const io = new Server(httpServer, {
  allowRequest: (req, callback) => {
    const targetInstance = req._query?.instance || req.headers['x-fly-instance'];
    
    if (targetInstance && targetInstance !== instanceId && FLY_MACHINE_ID) {
      console.log(`Rejecting WebSocket: wrong instance`);
      callback('Wrong instance', false);
      return;
    }
    
    callback(null, true);
  }
});
```

This provides a second layer of validation at the Socket.io level.

#### Room Creation
```javascript
socket.on('joinRoom', (data) => {
  const roomId = typeof data === 'string' ? data : data.roomId;
  const requestedInstance = typeof data === 'object' ? data.instance : null;
  
  // Verify instance match
  if (requestedInstance && requestedInstance !== instanceId && FLY_MACHINE_ID) {
    socket.emit('error', { 
      message: 'Connected to wrong instance',
      expectedInstance: requestedInstance,
      currentInstance: instanceId
    });
    socket.disconnect();
    return;
  }
  
  // Create or join game...
});
```

#### Instance Info API
```javascript
app.get('/api/instance', (req, res) => {
  res.json({ 
    instanceId,
    isFlyInstance: !!FLY_MACHINE_ID
  });
});
```

This endpoint allows clients to discover which instance they're currently connected to.

### 2. Frontend (src/main.js)

#### Fetching Instance Info
```javascript
async function getInstanceInfo() {
  try {
    const response = await fetch('/api/instance');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch instance info:', error);
    return { instanceId: null, isFlyInstance: false };
  }
}
```

#### Creating a Room with Instance
```javascript
// Get instance info from server
const instanceInfo = await getInstanceInfo();
const instanceId = instanceInfo.instanceId;

// Update URL with both room and instance
let newUrl = `${window.location.pathname}?room=${roomId}`;
if (instanceId && instanceInfo.isFlyInstance) {
  newUrl += `&instance=${instanceId}`;
}
window.history.pushState({ path: newUrl }, '', newUrl);

game.startMultiplayer(roomId, instanceId);
```

#### Joining via URL
```javascript
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
const instanceFromUrl = urlParams.get('instance');

if (roomFromUrl) {
  game.startMultiplayer(roomFromUrl, instanceFromUrl);
}
```

### 3. Game Client (src/game/Game.js)

#### WebSocket Connection with Instance
```javascript
startMultiplayer(roomId, instanceId = null) {
  const query = {};
  if (instanceId) {
    query.instance = instanceId;
  }
  
  this.socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    forceNew: true,
    multiplex: false,
    query  // Pass instance in query string
  });
  
  this.socket.on('connect', () => {
    const joinData = instanceId ? { roomId, instance: instanceId } : roomId;
    this.socket.emit('joinRoom', joinData);
  });
  
  // Store for reconnection
  this.currentRoomId = roomId;
  this.currentInstanceId = instanceId;
}
```

#### Reconnection Logic
```javascript
rejoinMultiplayer() {
  if (!this.currentRoomId) return;
  // Reuse the same instance ID when rejoining
  this.startMultiplayer(this.currentRoomId, this.currentInstanceId);
}
```

## Flow Diagrams

### Creating a New Room

```
User clicks "GO ONLINE"
    ↓
Frontend calls /api/instance
    ↓
Server responds with instanceId (e.g., "abc123")
    ↓
Frontend generates roomId (e.g., "XY4Z")
    ↓
URL becomes: /?room=XY4Z&instance=abc123
    ↓
Frontend connects WebSocket with query: { instance: "abc123" }
    ↓
Server verifies instance match → Accept connection
    ↓
Game created on instance abc123
```

### Joining an Existing Room

```
User opens URL: /?room=XY4Z&instance=abc123
    ↓
Frontend extracts: roomId="XY4Z", instanceId="abc123"
    ↓
Frontend connects WebSocket with query: { instance: "abc123" }
    ↓
Fly proxy routes to instance abc123 (via fly-replay if needed)
    ↓
Server verifies instance match → Accept connection
    ↓
User joins existing game on instance abc123
```

### Instance Mismatch Scenario

```
User connects to instance xyz789
    ↓
WebSocket query includes: { instance: "abc123" }
    ↓
Server detects mismatch (wants abc123, running xyz789)
    ↓
Server sends fly-replay header: instance=abc123
    ↓
Fly proxy redirects connection to instance abc123
    ↓
Connection succeeds on correct instance
```

## Testing Locally

When running locally (not on Fly.io):
- `instanceId` will be `"local"`
- Instance matching is **disabled** (all checks skip if not on Fly)
- Multiple tabs can connect to the same local server
- URLs won't include `instance` parameter

## Testing on Fly.io

To test instance affinity on Fly:

1. **Deploy to Fly** with multiple instances:
   ```bash
   fly scale count 2
   ```

2. **Create a room** on instance A:
   - URL will be like: `https://yourapp.fly.dev/?room=ABC1&instance=abc123`

3. **Share the URL** and open in another device/browser:
   - Connection should route to instance abc123
   - Both players should see each other

4. **Check logs** to verify routing:
   ```bash
   fly logs
   ```
   
   Look for messages like:
   - `"Replaying WebSocket connection from xyz789 to abc123"`
   - `"User joined room ABC1 on instance abc123"`

## Benefits

1. **Consistent Game State**: All players see the same game
2. **Reliable Multiplayer**: No split-brain scenarios
3. **Seamless Sharing**: Room URLs work across all devices
4. **Auto-Routing**: Fly automatically redirects to correct instance
5. **Graceful Fallback**: Works locally and on single-instance deployments

## Limitations

1. **Instance Stickiness**: Rooms are tied to specific instances
2. **Instance Shutdown**: If an instance stops, its rooms are lost
3. **No Cross-Instance Migration**: Games can't move between instances
4. **Scale Considerations**: Many rooms on one instance could overload it

## Future Improvements

- **Persistent Storage**: Store game state in a shared database
- **Load Balancing**: Distribute new rooms across instances
- **Migration Support**: Move active games between instances
- **Health Checks**: Automatically migrate rooms from unhealthy instances
