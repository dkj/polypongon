import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { resolvePort } from './config.js';
import { ServerGame } from './ServerGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Get Fly.io instance information
const instanceId = process.env.FLY_MACHINE_ID || 'local';
const isFlyInstance = !!process.env.FLY_MACHINE_ID;

console.log(`Running on instance: ${instanceId}${isFlyInstance ? ' (Fly.io)' : ''}`);

// Middleware to handle Fly.io instance routing for WebSocket upgrades
app.use((req, res, next) => {
  // Check if this is a WebSocket upgrade request
  const isWebSocketUpgrade = req.headers.upgrade === 'websocket';

  if (isWebSocketUpgrade) {
    const targetInstance = req.query.instance || req.headers['x-fly-instance'];

    // If a specific instance is requested and we're not it, replay to the correct instance
    if (targetInstance && targetInstance !== instanceId && isFlyInstance) {
      console.log(`Replaying WebSocket connection from ${instanceId} to ${targetInstance}`);
      res.set('fly-replay', `instance = ${targetInstance}`);
      return res.status(307).end();
    }
  }

  next();
});

const io = new Server(httpServer, {
  // Allow query parameters to pass through
  allowRequest: (req, callback) => {
    const targetInstance = req._query?.instance || req.headers['x-fly-instance'];

    // If a specific instance is requested and we're not it, reject
    if (targetInstance && targetInstance !== instanceId) {
      console.log(`Rejecting WebSocket: wrong instance(want ${targetInstance}, running ${instanceId})`);
      callback('Wrong instance', false);
      return;
    }

    callback(null, true);
  }
});

const games = new Map(); // roomId -> ServerGame

// API endpoints (must be defined BEFORE static file serving)
app.get('/api/instance', (req, res) => {
  res.json({ instanceId, isFlyInstance });
});

// Static file serving (catch-all routes last)
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^.*$/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(`Static assets not found at ${distPath}.Only socket services will be available.`);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} on instance ${instanceId}`);

  socket.on('joinRoom', (data) => {
    // Support both old string format and new object format
    const roomId = typeof data === 'string' ? data : data.roomId;
    const requestedInstance = typeof data === 'object' ? data.instance : null;

    // Verify we're on the right instance for this room
    if (requestedInstance && requestedInstance !== instanceId) {
      console.warn(`Room ${roomId} attempting to join wrong instance.Expected ${requestedInstance}, running ${instanceId}`);
      socket.emit('error', {
        message: 'Connected to wrong instance',
        expectedInstance: requestedInstance,
        currentInstance: instanceId
      });
      socket.disconnect();
      return;
    }

    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId} on instance ${instanceId}`);

    if (!games.has(roomId)) {
      console.log(`Creating new game for room ${roomId} on instance ${instanceId} `);
      const game = new ServerGame(io, roomId);
      games.set(roomId, game);
      game.start();
    }

    const game = games.get(roomId);
    const playerIndex = game.addPlayer(socket.id);

    socket.emit('init', {
      playerIndex,
      sides: game.polygon.sides,
      instanceId // Send back the instance ID for confirmation
    });

    // Handle input for this specific game
    socket.on('input', (data) => {
      if (game) game.handleInput(socket.id, data.dir);
    });

    socket.on('requestRestart', () => {
      if (game) game.processRestart();
    });

    // Handle disconnect specifically for this room context
    socket.on('disconnect', () => {
      console.log('user disconnected', socket.id);
      if (game) {
        game.removePlayer(socket.id);

        // Clean up the game ONLY if no players remain
        if (game.players.size === 0) {
          game.stop();
          games.delete(roomId);
          console.log(`Game for room ${roomId} cleaned up(empty)`);
        }
      }
    });
  });
});

const PORT = resolvePort();
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Instance ID: ${instanceId}`);
});
