import * as Sentry from "@sentry/node";
import { Paddle } from '../src/game/Paddle.js';
import { BaseGame } from '../src/game/BaseGame.js';
import { GAME_CONSTANTS } from '../src/game/Constants.js';

export class ServerGame extends BaseGame {
    constructor(io, roomId) {
        super();
        this.io = io;
        this.roomId = roomId;

        this.players = new Map(); // socketId -> edgeIndex
        this.readyEdges = new Set(); // Set of edgeIndex
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

        this.broadcastState();

        return edgeIndex;
    }

    removePlayer(socketId) {
        if (!this.players.has(socketId)) return;
        const edgeIndex = this.players.get(socketId);
        this.players.delete(socketId);
        this.readyEdges.delete(edgeIndex);

        this.paddles = this.paddles.filter(p => p.edgeIndex !== edgeIndex);

        this.broadcastState();
        this.checkAllReady();

        if (this.running && this.gameState === 'PLAYING') {
            this.terminateGame('A player left the game');
        }
    }

    toggleReady(socketId, isReady) {
        if (!this.players.has(socketId)) return;
        const edgeIndex = this.players.get(socketId);

        if (isReady) {
            this.readyEdges.add(edgeIndex);
        } else {
            this.readyEdges.delete(edgeIndex);
        }

        console.log(`Player ${socketId} (edge ${edgeIndex}) ready: ${isReady}. Ready edges:`, Array.from(this.readyEdges));

        this.broadcastState();
        this.checkAllReady();
    }

    checkAllReady() {
        if (this.restarting) return;
        if (this.gameState !== 'SCORING' || this.players.size === 0) return;
        if (this.celebrationTimer > 0) return;

        // Check if all players are ready
        const allReady = Array.from(this.players.values()).every(idx => this.readyEdges.has(idx));

        if (allReady) {
            this.resetGame();
        }
    }

    terminateGame(reason) {
        this.setGameState('TERMINATED');
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
            let dt = (time - this.lastTime) / 1000;
            this.lastTime = time;

            // Clamp dt to prevent simulation explosion (e.g. after pauses or lags)
            if (dt > 0.1) {
                // console.warn(`[ServerGame] Excessive dt detected: ${dt.toFixed(4)}s. Clamping to 0.1s.`);
                dt = 0.1;
            }

            this.update(dt);
            this.broadcastState();
        } catch (e) {
            console.error('ServerGame Loop Error:', e);
            if (process.env.SENTRY_DSN) {
                Sentry.captureException(e);
            }
            this.stop();
        }
    }

    update(dt) {
        super.update(dt);

        // Update Paddles Movement (Server specific)
        this.paddles.forEach(p => {
            if (p.moveDirection) {
                p.move(p.moveDirection, dt);
            }
        });
    }

    onCelebrationEnd() {
        super.onCelebrationEnd();
        this.checkAllReady();
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
        this.startCelebration();
        this.lastScore = finalScore;
        this.finalTime = Math.floor(this.timeElapsed);

        this.io.to(this.roomId).emit('gameEvent', {
            type: 'goal',
            score: this.lastScore,
            time: this.finalTime,
            edgeIndex
        });
    }


    resetGame() {
        if (this.restarting) return;
        this.restarting = true;

        try {
            // Force state update immediately
            this.setGameState('COUNTDOWN');

            this.resetState(); // BaseGame reset
            this.readyEdges.clear();

            // Reset server-specific paddle state
            this.paddles.forEach(p => {
                p.position = 0.5;
                p.moveDirection = 0;
            });

            // Critical: Reset loop timer to prevent massive dt frame on next loop
            this.lastTime = performance.now();

            this.broadcastState();
        } catch (e) {
            console.error(`[ServerGame] CRITICAL ERROR in resetGame:`, e);
            if (process.env.SENTRY_DSN) {
                Sentry.captureException(e);
            }
        } finally {
            this.restarting = false;
        }
    }

    broadcastState() {
        this.io.to(this.roomId).emit('gameState', {
            ball: { x: this.ball.x, y: this.ball.y },
            rotation: this.polygon.rotation,
            rotationDirection: this.rotationDirection,
            paddles: this.paddles.map(p => ({ edgeIndex: p.edgeIndex, position: p.position, width: p.width })),
            readyEdges: Array.from(this.readyEdges),
            difficulty: this.difficulty,
            gameState: this.gameState,
            score: this.score,
            lastScore: this.lastScore,
            finalTime: this.finalTime,
            timeElapsed: this.timeElapsed,
            scoreDisplayTimer: this.scoreDisplayTimer,
            countdownTimer: this.countdownTimer,
            celebrationTimer: this.celebrationTimer
        });
    }
}
