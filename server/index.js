import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ServerGame } from './ServerGame.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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
      game.removePlayer(socket.id);
      if (game.players.size === 0) {
        // Optional: Clean up empty rooms after a delay?
        // For now keep it simple.
      }
    });
  });
});

const PORT = 12122;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
