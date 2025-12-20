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
const io = new Server(httpServer);

const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^.*$/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(`Static assets not found at ${distPath}. Only socket services will be available.`);
}

const games = new Map(); // roomId -> ServerGame

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    if (!games.has(roomId)) {
      console.log(`Creating new game for room ${roomId}`);
      const game = new ServerGame(io, roomId);
      games.set(roomId, game);
      game.start();
    }

    const game = games.get(roomId);
    const playerIndex = game.addPlayer(socket.id);

    socket.emit('init', { playerIndex, sides: game.polygon.sides });

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
          console.log(`Game for room ${roomId} cleaned up (empty)`);
        }
      }
    });
  });
});

const PORT = resolvePort();
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
