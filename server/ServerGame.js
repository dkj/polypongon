import * as Sentry from "@sentry/node";
import { Paddle } from '../src/game/Paddle.js';
import { BaseGame } from '../src/game/BaseGame.js';

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

        this.emitToRoom('gameTerminated', {
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
        // Run slightly faster than 60 FPS to ensure we always have time to process
        // but not too fast to burn CPU. 1000/60 = 16.6ms. We'll aim for ~10ms.
        this.interval = setInterval(() => this.loop(), 10);
    }

    stop() {
        this.running = false;
        this.destroyed = true;
        clearInterval(this.interval);
    }

    loop() {
        try {
            const time = performance.now();
            let dt = (time - this.lastTime) / 1000;
            this.lastTime = time;

            this.step(dt);
            this.broadcastState();
        } catch (e) {
            console.error('ServerGame Loop Error:', e);
            if (process.env.SENTRY_DSN) {
                Sentry.captureException(e);
            }
            this.stop();
        }
    }

    fixedUpdate(dt) {
        // Run full physics on server so ball position is tracked for new joiners
        // We'll make it "silent" by overriding the hooks below
        super.fixedUpdate(dt);

        // Update Paddles Movement based on client input
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

    // --- Hooks (Quiet Server) ---
    onPaddleHit(_edgeIndex) {
        // Silent simulation: do nothing (don't increment score here, 
        // wait for authoritative client paddleHit event)
    }

    onWallBounce(_edgeIndex) {
        // DO NOT emit gameEvent
    }

    onGoal(_edgeIndex) {
        // DO NOT triggerScore on server simulation - server trusts client goalConceded report
        // This prevents "ghost goals" if server simulation differs from predicted client
    }

    // Client-authority: handle paddle hit from client to keep score sync
    onClientPaddleHit(socketId, data) {
        const playerEdge = this.players.get(socketId);
        if (playerEdge === undefined) return;

        // Verify the client is reporting their own edge
        if (data.edgeIndex !== playerEdge) {
            console.warn(`Client ${socketId} reported hit on wrong edge`);
            return;
        }

        // Only count hits if the server is actually in the PLAYING state and not celebrating
        if (this.gameState !== 'PLAYING' || this.celebrationTimer > 0) {
            // Optional: log if hit arrives in COUNTDOWN to help debug sync
            if (this.gameState === 'COUNTDOWN') {
                console.warn(`Client ${socketId} reported hit during COUNTDOWN`);
            }
            return;
        }

        // Increment server score
        this.score++;

        // Update server's ball state to match the authoritative hitter
        // This keeps the server's "joiner baseline" accurate
        if (data.ball) {
            this.ball.x = data.ball.x;
            this.ball.y = data.ball.y;
            this.ball.vx = data.ball.vx;
            this.ball.vy = data.ball.vy;
        }

        // Broadcast the hit to everyone else for sound/particles 
        this.emitToRoom('gameEvent', {
            type: 'bounce',
            edgeIndex: data.edgeIndex
        });
    }
    // -------------

    // Client-authority: handle goal concession from client
    handleGoalConceded(socketId, data) {
        const playerEdge = this.players.get(socketId);
        if (playerEdge === undefined) return;

        const { edgeIndex, score, time } = data;

        // Verify the client is reporting their own edge
        if (edgeIndex !== playerEdge) {
            console.warn(`Client ${socketId} reported goal on wrong edge`);
            return;
        }

        // Only process goals if the server is actually in the PLAYING state
        if (this.gameState !== 'PLAYING') {
            console.warn(`Client ${socketId} reported goal while server is in state ${this.gameState}`);
            return;
        }

        console.log(`Player on edge ${edgeIndex} conceded goal. Server Score: ${this.score}, (Client reported: ${score}), Time: ${time}`);

        // Trigger game over using the server's authoritative score
        this.triggerScore(this.score, edgeIndex);
    }

    triggerScore(finalScore, edgeIndex) {
        this.startCelebration();
        this.lastScore = finalScore;
        this.finalTime = Math.floor(this.timeElapsed);

        this.emitToRoom('gameEvent', {
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
            this.accumulator = 0;

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

    emitToRoom(event, data) {
        if (this.destroyed) return;

        const latency = parseInt(process.env.SIMULATED_LATENCY_MS || '0', 10);
        if (latency > 0) {
            setTimeout(() => {
                if (this.destroyed) return;
                this.io.to(this.roomId).emit(event, data);
            }, latency);
        } else {
            this.io.to(this.roomId).emit(event, data);
        }
    }

    broadcastState() {
        this.emitToRoom('gameState', {
            ball: { x: this.ball.x, y: this.ball.y, vx: this.ball.vx, vy: this.ball.vy },
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
