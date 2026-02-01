import express from 'express';
import * as Sentry from "@sentry/node"; // Still need Sentry for error handler setup
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

/**
 * Intercepts Socket.io requests and upgrades to handle Fly.io instance routing.
 * This is necessary because Socket.IO intercepts these events before Express,
 * and Engine.io middleware lacks a functional writeHead() for WebSocket upgrades.
 */
const handleFlyInstanceRouting = (req, resOrSocket, isUpgrade) => {
  try {
    if (!isFlyInstance) return false;

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/socket.io/')) return false;

    const targetInstance = url.searchParams.get('instance') || req.headers['x-fly-instance'];

    if (targetInstance && targetInstance !== instanceId) {
      console.log(`Replaying ${isUpgrade ? 'WebSocket upgrade' : 'polling request'} from ${instanceId} to ${targetInstance}`);

      if (isUpgrade) {
        // Upgrade path provides a raw socket; write raw HTTP response.
        resOrSocket.end(
          'HTTP/1.1 307 Temporary Redirect\r\n' +
          `fly-replay: instance=${targetInstance}\r\n` +
          'Content-Length: 0\r\n' +
          'Connection: close\r\n' +
          '\r\n'
        );
      } else {
        // Standard path provides an http.ServerResponse object.
        resOrSocket.writeHead(307, {
          'fly-replay': `instance=${targetInstance}`,
          'Content-Length': '0',
          'Connection': 'close'
        });
        resOrSocket.end();
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error('Fly.io routing error:', err);
    return false;
  }
};



// Monkey-patch httpServer.emit ONLY on Fly.io to intercept and stop propagation 
// of requests that need to be replayed to a different instance.
if (isFlyInstance) {
  const originalEmit = httpServer.emit;
  httpServer.emit = function (event, req, resOrSocket) {
    if (event === 'request' || event === 'upgrade') {
      if (handleFlyInstanceRouting(req, resOrSocket, event === 'upgrade')) {
        return true;
      }
    }
    return originalEmit.apply(this, arguments);
  };
}

const io = new Server(httpServer, {
  // Allow query parameters to pass through
  allowRequest: (req, callback) => {
    const targetInstance = req._query?.instance || req.headers['x-fly-instance'];

    // If a specific instance is requested and we're not it, reject
    // Only enforced on Fly.io to allow local debugging with production URLs
    if (targetInstance && targetInstance !== instanceId && isFlyInstance) {
      console.log(`Rejecting socket: wrong instance(want ${targetInstance}, running ${instanceId})`);
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

app.get('/api/sentry-config', (req, res) => {
  res.json({
    dsn: process.env.VITE_SENTRY_DSN || '',
    environment: process.env.SENTRY_ENVIRONMENT || ''
  });
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

// Sentry error handler must be after all routes
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} on instance ${instanceId}`);

  socket.on('joinRoom', (data) => {
    try {
      // Support both old string format and new object format
      const roomId = typeof data === 'string' ? data : data.roomId;
      const requestedInstance = typeof data === 'object' ? data.instance : null;

      // Verify we're on the right instance for this room
      // Only enforced on Fly.io to allow local debugging
      if (requestedInstance && requestedInstance !== instanceId && isFlyInstance) {
        console.warn(`Room ${roomId} attempting to join wrong instance. Expected ${requestedInstance}, running ${instanceId}`);
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
      socket.removeAllListeners('input');
      socket.on('input', (data) => {
        try {
          if (game) game.handleInput(socket.id, data.dir);
        } catch (err) {
          console.error('Input error:', err);
          if (process.env.SENTRY_DSN) Sentry.captureException(err);
        }
      });

      socket.removeAllListeners('playerReady');
      socket.on('playerReady', (data) => {
        try {
          if (game) game.toggleReady(socket.id, data.ready);
        } catch (err) {
          console.error('PlayerReady error:', err);
          if (process.env.SENTRY_DSN) Sentry.captureException(err);
        }
      });

      // Handle disconnect specifically for this room context
      socket.on('disconnect', () => {
        try {
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
        } catch (err) {
          console.error('Disconnect error:', err);
          if (process.env.SENTRY_DSN) Sentry.captureException(err);
        }
      });
    } catch (err) {
      console.error('JoinRoom error:', err);
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
    }
  });
});

const PORT = resolvePort();
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Instance ID: ${instanceId}`);
});
