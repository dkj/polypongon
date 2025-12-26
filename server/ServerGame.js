import { Paddle } from '../src/game/Paddle.js';
import { BaseGame } from '../src/game/BaseGame.js';
import { GAME_CONSTANTS } from '../src/game/Constants.js';

export class ServerGame extends BaseGame {
    constructor(io, roomId) {
        super();
        this.io = io;
        this.roomId = roomId;

        this.players = new Map(); // socketId -> edgeIndex
        this.running = false;
        this.interval = null;
        this.lastTime = 0;

        this.scoreDisplayTimer = 0;
    }

    addPlayer(socketId) {
        if (this.paddles.length >= this.polygon.sides) return -1;

        // Find the first available edgeIndex
        const occupiedIndices = new Set(this.paddles.map(p => p.edgeIndex));
        let edgeIndex = 0;
        while (occupiedIndices.has(edgeIndex) && edgeIndex < this.polygon.sides) {
            edgeIndex++;
        }

        if (edgeIndex >= this.polygon.sides) return -1;

        const paddle = new Paddle(edgeIndex);
        this.paddles.push(paddle);
        this.players.set(socketId, edgeIndex);

        return edgeIndex;
    }

    removePlayer(socketId) {
        if (!this.players.has(socketId)) return;
        const edgeIndex = this.players.get(socketId);
        this.players.delete(socketId);

        this.paddles = this.paddles.filter(p => p.edgeIndex !== edgeIndex);

        if (this.running && this.gameState === 'PLAYING') {
            this.terminateGame('A player left the game');
        }
    }

    terminateGame(reason) {
        this.gameState = 'TERMINATED';
        this.running = false;
        clearInterval(this.interval);

        this.io.to(this.roomId).emit('gameTerminated', {
            reason: reason,
            lastScore: this.score,
            finalTime: Math.floor(this.timeElapsed)
        });
    }

    handleInput(socketId, dir) {
        if (this.gameState === 'SCORING') return;

        if (!this.players.has(socketId)) return;
        const index = this.players.get(socketId);
        const paddle = this.paddles.find(p => p.edgeIndex === index);
        if (paddle) {
            paddle.moveDirection = dir;
        }
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        const FPS = GAME_CONSTANTS.GAME_FPS;
        this.interval = setInterval(() => this.loop(), 1000 / FPS);
    }

    stop() {
        this.running = false;
        clearInterval(this.interval);
    }

    loop() {
        try {
            const time = performance.now();
            const dt = (time - this.lastTime) / 1000;
            this.lastTime = time;

            this.update(dt);
            this.broadcastState();
        } catch (e) {
            console.error('ServerGame Loop Error:', e);
            this.stop();
        }
    }

    update(dt) {
        if (this.gameState === 'SCORING') return;

        const prevBallX = this.ball.x;
        const prevBallY = this.ball.y;

        super.updateGameRules(dt);

        if (this.gameState === 'PLAYING') {
            // Move Ball
            this.ball.update(dt);
        }

        // Update Paddles Movement (Server specific)
        this.paddles.forEach(p => {
            if (p.moveDirection) {
                p.move(p.moveDirection, dt);
            }
        });

        if (this.gameState === 'PLAYING') {
            super.checkCollisions(prevBallX, prevBallY);
        }
    }

    // --- Hooks ---
    onPaddleHit(edgeIndex) {
        super.onPaddleHit(edgeIndex);
        this.io.to(this.roomId).emit('gameEvent', { type: 'bounce', edgeIndex });
    }

    onWallBounce(edgeIndex) {
        this.io.to(this.roomId).emit('gameEvent', { type: 'bounce', edgeIndex });
    }

    onGoal(edgeIndex) {
        this.triggerScore(this.score, edgeIndex);
    }
    // -------------

    triggerScore(finalScore, edgeIndex) {
        this.gameState = 'SCORING';
        this.lastScore = finalScore; // This is now bounce count
        this.finalTime = Math.floor(this.timeElapsed);
        this.scoreDisplayTimer = 0;

        this.io.to(this.roomId).emit('gameEvent', {
            type: 'goal',
            score: this.lastScore,
            time: this.finalTime,
            edgeIndex
        });
    }

    processRestart() {
        if (this.gameState === 'SCORING') {
            this.resetGame();
        }
    }

    resetGame() {
        this.resetState(); // BaseGame reset

        // Reset server-specific paddle state
        this.paddles.forEach(p => {
            p.position = 0.5;
            p.moveDirection = 0;
        });

        this.broadcastState();
    }

    broadcastState() {
        this.io.to(this.roomId).emit('gameState', {
            ball: { x: this.ball.x, y: this.ball.y },
            rotation: this.polygon.rotation,
            paddles: this.paddles.map(p => ({ edgeIndex: p.edgeIndex, position: p.position, width: p.width })),
            difficulty: this.difficulty,
            gameState: this.gameState,
            score: this.score,
            lastScore: this.lastScore,
            finalTime: this.finalTime,
            timeElapsed: this.timeElapsed,
            scoreDisplayTimer: this.scoreDisplayTimer,
            countdownTimer: this.countdownTimer,
            timestamp: Date.now()
        });
    }
}
