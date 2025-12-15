import { Polygon } from '../src/game/Polygon.js';
import { Ball } from '../src/game/Ball.js';
import { Paddle } from '../src/game/Paddle.js';

export class ServerGame {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;

        // Game Objects
        this.polygon = new Polygon(250, 5); // Default 5 sides
        this.ball = new Ball(0, 0);
        this.paddles = [];
        // Players mapping: socketId -> edgeIndex
        this.players = new Map();

        this.lastTime = performance.now();
        this.timeElapsed = 0;
        this.difficulty = 1.0;
        this.rotationDirection = 1;

        this.gameState = 'SCORING'; // 'PLAYING' | 'SCORING' - Start frozen, player clicks to begin
        this.score = 0;
        this.lastScore = 0;
        this.scoreDisplayTimer = 0;

        this.running = false;

        // Loop interval
        this.interval = null;
    }

    addPlayer(socketId) {
        // Find next available edge
        if (this.paddles.length >= this.polygon.sides) return -1;

        const edgeIndex = this.paddles.length;
        const paddle = new Paddle(edgeIndex);
        this.paddles.push(paddle);
        this.players.set(socketId, edgeIndex);

        return edgeIndex;
    }

    removePlayer(socketId) {
        if (!this.players.has(socketId)) return;
        const edgeIndex = this.players.get(socketId);
        this.players.delete(socketId);

        // Remove the paddle for this player - their edge becomes a normal bouncing wall
        this.paddles = this.paddles.filter(p => p.edgeIndex !== edgeIndex);

        // If the game was running (PLAYING), terminate it since a player left
        if (this.running && this.gameState === 'PLAYING') {
            this.terminateGame('A player left the game');
        }
    }

    terminateGame(reason) {
        this.gameState = 'TERMINATED';
        this.running = false;
        clearInterval(this.interval);

        // Notify all clients
        this.io.to(this.roomId).emit('gameTerminated', {
            reason: reason,
            lastScore: Math.floor(this.score)
        });
    }

    handleInput(socketId, dir) {
        if (this.gameState === 'SCORING') return; // Ignore input during freeze

        if (!this.players.has(socketId)) return;
        const index = this.players.get(socketId);
        // Find paddle with this edgeIndex? 
        // Actually paddles array might not be ordered by edgeIndex if we removed some?
        // I used edgeIndex = paddles.length.
        // Let's assume paddles[index] corresponds if we don't delete.
        const paddle = this.paddles.find(p => p.edgeIndex === index);
        if (paddle) {
            paddle.moveDirection = dir; // Storing input state
        }
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        const FPS = 60;
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
        if (this.gameState === 'SCORING') {
            // TOTAL FREEZE: No physics updates, no rotation, no timer decrement.
            // Just wait for explicit restart signal.
            return;
        }

        const prevBallX = this.ball.x;
        const prevBallY = this.ball.y;

        this.timeElapsed += dt;
        this.score += dt;

        this.difficulty = 1 + this.timeElapsed / 30;

        this.polygon.rotationSpeed = 0.5 * this.difficulty * this.rotationDirection;
        this.polygon.update(dt);

        const currentSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
        const targetSpeed = 200 * this.difficulty;
        if (currentSpeed < targetSpeed) {
            const scale = targetSpeed / currentSpeed;
            this.ball.vx *= scale;
            this.ball.vy *= scale;
        }

        this.ball.update(dt);

        // Update Paddles
        const targetWidth = Math.max(0.1, 0.2 / (this.difficulty * 0.8));
        this.paddles.forEach(p => {
            p.width = targetWidth;
            if (p.moveDirection) {
                p.move(p.moveDirection, dt);
                // NOTE: Don't reset moveDirection! Client sends dir=0 when key is released.
            }
        });

        this.checkCollisions(prevBallX, prevBallY);
    }

    checkCollisions(prevX, prevY) {
        const vertices = this.polygon.vertices;
        const ball = this.ball;
        let collided = false;

        // CCD: Raycast from Prev -> Curr
        const ballDist = Math.sqrt((ball.x - prevX) ** 2 + (ball.y - prevY) ** 2);
        // If movement is tiny, fallback to simple radius check to avoid precision issues
        // But for reliability with fast balls, we combine both:
        // 1. Raycast for tunneling.
        // 2. Radius check for glancing blows (optional, but good for accuracy).

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            // 1. Segment Intersection (Tunneling Prevention)
            const intersect = this.getLineIntersection(prevX, prevY, ball.x, ball.y, p1.x, p1.y, p2.x, p2.y);

            // 2. Point-Line Distance (Glancing Blow protection)
            // 2. Point-Line Distance (Glancing Blow protection)
            const dist = this.getDistanceFromSegment(ball, p1, p2);
            const isGlancing = dist < ball.radius + 2;

            if (intersect || isGlancing) {
                // Determine collision point for paddle check
                // If we tunneled, use the exact intersection point on the wall line.
                // If glancing, project the ball onto the line (closest point).
                let checkPoint = ball;
                if (intersect) {
                    checkPoint = intersect;
                    // Snap ball to collision point to prevent tunneling!
                    ball.x = checkPoint.x;
                    ball.y = checkPoint.y;
                } else {
                    // Project ball onto line segment for glancing check
                    checkPoint = this.getClosestPointOnSegment(p1, p2, ball);
                }

                const hasPaddle = this.paddles.some(p => p.edgeIndex === i);

                if (hasPaddle) {
                    const paddle = this.paddles.find(p => p.edgeIndex === i);
                    // GRACE MARGIN: Reduced to 1.1x (10% extra per side) to reduce phantom hits
                    // Using checkPoint instead of ball ensures finding correct position on the line
                    if (this.checkPaddleHit(checkPoint, p1, p2, paddle, 1.1)) {
                        this.reflectBall(p1, p2);
                        // Push ball out of wall slightly along normal to prevent sticking
                        this.pushBallOut(p1, p2);
                        collided = true;
                    } else {
                        // Missed - DEBUG LOG
                        const edgeX = p2.x - p1.x;
                        const edgeY = p2.y - p1.y;
                        const len2 = edgeX * edgeX + edgeY * edgeY;
                        const t = ((checkPoint.x - p1.x) * edgeX + (checkPoint.y - p1.y) * edgeY) / len2;
                        const w = paddle.width * 1.1;
                        const pStart = paddle.position - w / 2;
                        const pEnd = paddle.position + w / 2;
                        console.log(`[GOAL] Edge ${i}: checkPoint t=${t.toFixed(3)}, paddle range=[${pStart.toFixed(3)}, ${pEnd.toFixed(3)}], paddle.position=${paddle.position.toFixed(3)}, paddle.width=${paddle.width.toFixed(3)}`);
                        this.triggerScore(this.score);
                        return;
                    }
                } else {
                    this.reflectBall(p1, p2);
                    this.pushBallOut(p1, p2);
                    collided = true;
                }
            }
            if (collided) {
                this.io.to(this.roomId).emit('gameEvent', { type: 'bounce' });
                break;
            }
        }
    }

    // Helper: Move ball slightly away from wall along normal to fix 'stuck' or 're-trigger' issues
    pushBallOut(p1, p2) {
        let nx = -(p2.y - p1.y);
        let ny = (p2.x - p1.x);
        const len = Math.sqrt(nx * nx + ny * ny);
        nx /= len;
        ny /= len;
        // Ensure normal points INWARD (towards 0,0) - polygon vertices are usually CCW?
        // Just check dprod with center. Center is 0,0.
        // Current center of polygon is 0,0.
        // The p1->p2 vector. Normal is (-dy, dx).
        // If poly is centered at 0,0, we want to push towards 0,0 if inside? 
        // Actually reflectBall logic assumes normal.
        // Let's just push based on current velocity? Push 'back' along velocity?
        // Or just push 2 units along calculated reflection normal.
        this.ball.x += nx * 2;
        this.ball.y += ny * 2;
    }

    getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return null;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
        }
        return null;
    }

    getClosestPointOnSegment(p1, p2, p) {
        const edgeX = p2.x - p1.x;
        const edgeY = p2.y - p1.y;
        const len2 = edgeX * edgeX + edgeY * edgeY;
        let t = ((p.x - p1.x) * edgeX + (p.y - p1.y) * edgeY) / len2;
        t = Math.max(0, Math.min(1, t));
        return { x: p1.x + t * edgeX, y: p1.y + t * edgeY };
    }

    getDistanceFromSegment(p, p1, p2) {
        const edgeX = p2.x - p1.x;
        const edgeY = p2.y - p1.y;
        const len2 = edgeX * edgeX + edgeY * edgeY;
        if (len2 === 0) return Math.sqrt((p.x - p1.x) ** 2 + (p.y - p1.y) ** 2);

        let t = ((p.x - p1.x) * edgeX + (p.y - p1.y) * edgeY) / len2;
        t = Math.max(0, Math.min(1, t));

        const closeX = p1.x + t * edgeX;
        const closeY = p1.y + t * edgeY;
        return Math.sqrt((p.x - closeX) ** 2 + (p.y - closeY) ** 2);
    }

    checkPaddleHit(point, p1, p2, paddle, graceMultiplier = 1.0) {
        const edgeX = p2.x - p1.x;
        const edgeY = p2.y - p1.y;
        const len2 = edgeX * edgeX + edgeY * edgeY;
        const t = ((point.x - p1.x) * edgeX + (point.y - p1.y) * edgeY) / len2;

        const w = paddle.width * graceMultiplier;
        const pStart = paddle.position - w / 2;
        const pEnd = paddle.position + w / 2;
        return t >= pStart && t <= pEnd;
    }

    reflectBall(p1, p2) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        let nx = -(p2.y - p1.y);
        let ny = (p2.x - p1.x);
        const len = Math.sqrt(nx * nx + ny * ny);
        nx /= len;
        ny /= len;

        if (nx * (-mx) + ny * (-my) < 0) {
            nx = -nx;
            ny = -ny;
        }

        const dot = this.ball.vx * nx + this.ball.vy * ny;
        this.ball.vx = this.ball.vx - 2 * dot * nx;
        this.ball.vy = this.ball.vy - 2 * dot * ny;

        this.ball.x += nx * 2;
        this.ball.y += ny * 2;

        this.ball.vx *= 1.05;
        this.ball.vy *= 1.05;
    }

    resetBall() {
        this.ball.x = 0;
        this.ball.y = 0;
        const speed = 200;
        const angle = Math.random() * Math.PI * 2;
        this.ball.vx = Math.cos(angle) * speed;
        this.ball.vy = Math.sin(angle) * speed;
    }

    triggerScore(finalScore) {
        this.gameState = 'SCORING';
        this.lastScore = Math.floor(finalScore);
        this.scoreDisplayTimer = 0; // Not used for auto-restart anymore, but maybe for UI flashing?

        // Broadcast Goal event
        this.io.to(this.roomId).emit('gameEvent', { type: 'goal', score: this.lastScore });
    }

    processRestart() {
        if (this.gameState === 'SCORING') {
            this.resetGame();
        }
    }

    resetGame() {
        this.gameState = 'PLAYING';
        this.resetBall();

        // Reset physics params
        this.difficulty = 1.0;
        this.score = 0;
        this.timeElapsed = 0;
        // Randomize rotation direction: 1 or -1
        this.rotationDirection = Math.random() < 0.5 ? 1 : -1;
        this.polygon.rotationSpeed = 0.5 * this.rotationDirection;
        this.paddles.forEach(p => {
            p.width = 0.2;
            p.position = 0.5; // Reset to center
            p.moveDirection = 0; // Clear any pending movement
        });

        // Broadcast immediate state update to ensure clients unfreeze
        this.broadcastState();
    }

    broadcastState() {
        // Send compressed state
        // if (Math.random() < 0.01) console.log('Broadcasting state for room', this.roomId);
        this.io.to(this.roomId).emit('gameState', {
            ball: { x: this.ball.x, y: this.ball.y },
            rotation: this.polygon.rotation,
            paddles: this.paddles.map(p => ({ edgeIndex: p.edgeIndex, position: p.position, width: p.width })),
            difficulty: this.difficulty,
            gameState: this.gameState,
            score: this.score,
            lastScore: this.lastScore,
            scoreDisplayTimer: this.scoreDisplayTimer,
            timestamp: Date.now()
        });
    }
}
