import { Polygon } from './Polygon.js';
import { Ball } from './Ball.js';
import { Paddle } from './Paddle.js';
import { AudioManager } from './Audio.js';
import { io } from 'socket.io-client';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();

        // Game Objects
        this.polygon = new Polygon(250, 5);
        this.ball = new Ball(0, 0);
        this.paddles = [new Paddle(0)];
        this.audio = new AudioManager();

        // State
        this.mode = 'local'; // 'local' or 'online'
        this.socket = null;
        this.playerIndex = -1;

        this.gameState = 'SCORING'; // 'PLAYING' | 'SCORING' - Start frozen, user clicks to begin
        this.score = 0; // Current time survived
        this.lastScore = 0; // Score of last round
        this.scoreDisplayTimer = 0;

        // Loop State
        this.timeElapsed = 0;
        this.difficulty = 1.0;
        this.rotationDirection = 1; // Default
        this.lastTime = 0;

        window.addEventListener('resize', () => this.resize());

        // Input
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if ((e.code === 'Space' || e.code === 'Enter')) {
                this.audio.init();
                if (this.gameState === 'SCORING') {
                    if (this.socket) {
                        this.socket.emit('requestRestart');
                    } else {
                        this.resetLocalGame();
                    }
                } else if (this.gameState === 'TERMINATED' && this.socket) {
                    this.rejoinMultiplayer();
                }
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Touch
        this.touchDir = 0;
        window.addEventListener('touchstart', (e) => this.handleTouch(e));
        window.addEventListener('touchmove', (e) => this.handleTouch(e));
        window.addEventListener('touchend', () => this.touchDir = 0);

        // Audio & Visual init
        // Audio & Visual init
        window.addEventListener('click', () => {
            this.audio.init();
            if (this.gameState === 'SCORING') {
                if (this.socket) {
                    this.socket.emit('requestRestart');
                } else {
                    this.resetLocalGame();
                }
            } else if (this.gameState === 'TERMINATED' && this.socket) {
                this.rejoinMultiplayer();
            }
        });
        window.addEventListener('touchstart', () => {
            this.audio.init();
            if (this.gameState === 'SCORING') {
                if (this.socket) {
                    this.socket.emit('requestRestart');
                } else {
                    this.resetLocalGame();
                }
            } else if (this.gameState === 'TERMINATED' && this.socket) {
                this.rejoinMultiplayer();
            }
        });

        this.flashTime = 0;
    }

    flashEffect() {
        this.flashTime = 0.2; // 200ms red flash
    }

    triggerScore(finalScore) {
        this.gameState = 'SCORING';
        this.lastScore = Math.floor(finalScore);
        this.scoreDisplayTimer = 5.0; // 5 seconds celebration
        this.flashEffect();

        // Reset Difficulty
        this.difficulty = 1.0;
        this.score = 0;
        this.timeElapsed = 0;

        // In local mode, we need to stop physics now, which update() does.
        // But we need a way to restart.
    }

    resetLocalGame() {
        this.gameState = 'PLAYING';
        this.resetBall();
        this.difficulty = 1.0;
        this.score = 0;
        this.timeElapsed = 0;
        // Randomize rotation direction: 1 or -1
        this.rotationDirection = Math.random() < 0.5 ? 1 : -1;
        this.polygon.rotationSpeed = 0.5 * this.rotationDirection;
        this.paddles.forEach(p => p.width = 0.2);
    }

    startMultiplayer(roomId) {
        console.log('Attempting to connect to server...');
        this.mode = 'online';
        this.socket = io({
            path: '/socket.io',
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('Connected to server successfully with ID:', this.socket.id);
            this.socket.emit('joinRoom', roomId);
        });

        this.socket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
        });

        this.socket.on('init', (data) => {
            this.playerIndex = data.playerIndex;
            if (this.polygon.sides !== data.sides) {
                this.polygon.updateSides(data.sides); // Assuming this method exists or I use direct set
                this.polygon.sides = data.sides;
                this.polygon.updateVertices();
            }
        });

        this.stateBuffer = [];

        this.socket.on('gameState', (state) => {
            // Push to buffer
            this.stateBuffer.push(state);
            // Keep buffer small (e.g. 1 second worth approx 20-30 states)
            if (this.stateBuffer.length > 30) {
                this.stateBuffer.shift();
            }

            // Sync Non-Physics State Immediately (Score, GameState) for responsiveness
            // (Or we could delay this too, but immediate is usually fine for UI)
            const now = performance.now();
            if (now - this.lastStateLogTime > 1000) {
                console.log('Received State:', state.difficulty, 'Player Index:', this.playerIndex);
                this.lastStateLogTime = now;
            }

            this.difficulty = state.difficulty;
            this.gameState = state.gameState;
            this.score = state.score;
            this.lastScore = state.lastScore;
            this.scoreDisplayTimer = state.scoreDisplayTimer;
            this.audio.setDifficulty(this.difficulty);
        });

        this.socket.on('gameEvent', (event) => {
            if (event.type === 'bounce') this.audio.playBounce();
            if (event.type === 'miss') {
                this.audio.playBounce();
                this.flashEffect();
            }
            if (event.type === 'goal') {
                // Snap to latest state immediately on goal (no interpolation delay)
                this.stateBuffer = [];
                this.flashEffect();
                this.audio.playBounce();
            }
        });

        this.socket.on('gameTerminated', (data) => {
            this.gameState = 'TERMINATED';
            this.terminationReason = data.reason;
            this.lastScore = data.lastScore;
            this.stateBuffer = [];
        });

        // Store roomId for potential rejoin
        this.currentRoomId = roomId;
    }

    rejoinMultiplayer() {
        if (!this.currentRoomId) return;

        // Disconnect old socket
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Reset state
        this.playerIndex = -1;
        this.gameState = 'SCORING';
        this.terminationReason = null;
        this.stateBuffer = [];

        // Reconnect
        this.startMultiplayer(this.currentRoomId);
    }

    handleTouch(e) {
        e.preventDefault();
        const touchX = e.touches[0].clientX;
        if (touchX < window.innerWidth / 2) {
            this.touchDir = -1;
        } else {
            this.touchDir = 1;
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;

        // Scale to fit: 600px is the "safe" logical size (250px radius + padding)
        const minDim = Math.min(this.canvas.width, this.canvas.height);
        this.gameScale = minDim / 600;
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(time) {
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.mode === 'local') {
            this.update(dt);
        } else {
            // Predict local movement + Send Input
            this.handleOnlineInput(dt);
            // We still might want to update other things like interpolated ball? 
            // For now ball is purely server-synced (jumpy is ok for ball, bad for paddle).
        }

        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    handleOnlineInput(dt) {
        if (!this.socket) return;
        if (this.gameState === 'SCORING') return; // Block input during freeze


        // --- Interpolation Logic ---
        this.applyInterpolation();
        // ---------------------------

        let dir = 0;
        if (this.keys['ArrowLeft']) dir = -1;
        if (this.keys['ArrowRight']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

        // Visual Prediction: Move my paddle immediately
        if (this.playerIndex !== -1 && this.paddles.length > 0) {
            const myPaddle = this.paddles.find(p => p.edgeIndex === this.playerIndex);
            if (myPaddle) {
                myPaddle.move(dir, dt);
            }
        }

        if (this.lastDir !== dir) {
            this.socket.emit('input', { dir });
            this.lastDir = dir;
        }
    }

    applyInterpolation() {
        if (this.stateBuffer.length < 2) return;

        const now = Date.now();
        const renderTimestamp = now - 100; // 100ms buffering delay

        // Find the two states surrounding renderTimestamp
        let s0 = this.stateBuffer[0];
        let s1 = this.stateBuffer[1];
        let i = 0;

        // Loop to find correct window
        while (i < this.stateBuffer.length - 1 && this.stateBuffer[i + 1].timestamp <= renderTimestamp) {
            s0 = this.stateBuffer[i];
            s1 = this.stateBuffer[i + 1];
            i++;
        }

        // If we are past the newest state, clamp to newest
        if (renderTimestamp > s1.timestamp) {
            s0 = s1;
        }
        // If we are before the oldest state, clamp to oldest (s0)
        else if (renderTimestamp < s0.timestamp) {
            // Just use s0
            s1 = s0;
        }

        // Interpolation Factor
        let t = 0;
        if (s1.timestamp > s0.timestamp) {
            t = (renderTimestamp - s0.timestamp) / (s1.timestamp - s0.timestamp);
        }
        t = Math.max(0, Math.min(1, t));

        // Use Linear Interpolation (Lerp)
        const lerp = (a, b, t) => a + (b - a) * t;

        // 1. Ball
        this.ball.x = lerp(s0.ball.x, s1.ball.x, t);
        this.ball.y = lerp(s0.ball.y, s1.ball.y, t);
        this.ball.updateTrail();

        // 2. Rotation
        // Handle angle wrap-around if needed? (0 -> 2PI). Currently generic float, should suffice.
        this.polygon.rotation = lerp(s0.rotation, s1.rotation, t);
        this.polygon.updateVertices();

        // 3. Paddles
        // We reconstruct the paddles array based on s1 (Target State) structure mostly
        // But we need to handle "My Paddle" separately (Prediction).

        // Map of previous positions for ID tracking? 
        // We assume edgeIndex is the ID.

        this.paddles = s1.paddles.map(pData1 => {
            // Is this me?
            if (this.playerIndex !== -1 && pData1.edgeIndex === this.playerIndex) {
                // Keep my existing paddle instance to preserve some local prediction
                let myPaddle = this.paddles.find(p => p.edgeIndex === this.playerIndex);
                if (!myPaddle) myPaddle = new Paddle(pData1.edgeIndex);

                // Update width from server (gameplay sync)
                myPaddle.width = pData1.width ?? Math.max(0.1, 0.2 / (this.difficulty * 0.8));

                // RECONCILIATION: Blend predicted position towards server position
                // This prevents drift while still allowing responsive local movement
                const serverPos = pData1.position;
                const drift = Math.abs(myPaddle.position - serverPos);
                if (drift > 0.01) {
                    // Blend towards server position (faster correction for larger drift)
                    const blendFactor = Math.min(0.3, drift * 2);
                    myPaddle.position = myPaddle.position + (serverPos - myPaddle.position) * blendFactor;
                }

                return myPaddle;
            }

            // Remote Player
            const p = new Paddle(pData1.edgeIndex);

            // Find corresponding paddle in s0
            const pData0 = s0.paddles.find(pp => pp.edgeIndex === pData1.edgeIndex);

            if (pData0) {
                p.position = lerp(pData0.position, pData1.position, t);
            } else {
                p.position = pData1.position; // No history, snap to target
            }

            p.width = pData1.width ?? Math.max(0.1, 0.2 / (this.difficulty * 0.8));
            return p;
        });
    }

    update(dt) {
        if (this.gameState === 'SCORING') {
            // TOTAL FREEZE on client too
            return;
        }

        const prevBallX = this.ball.x;
        const prevBallY = this.ball.y;

        this.timeElapsed += dt;
        this.score += dt; // Score is time in seconds

        this.difficulty = 1 + this.timeElapsed / 30;

        this.audio.setDifficulty(this.difficulty);

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

        const targetWidth = Math.max(0.1, 0.2 / (this.difficulty * 0.8));
        this.paddles.forEach(p => p.width = targetWidth);

        let dir = 0;
        if (this.keys['ArrowLeft']) dir = -1;
        if (this.keys['ArrowRight']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

        if (dir !== 0) this.paddles[0].move(dir, dt);

        this.checkCollisions(prevBallX, prevBallY);
    }

    checkCollisions(prevX, prevY) {
        const vertices = this.polygon.vertices;
        const ball = this.ball;
        let collided = false;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            // 1. Segment Intersection (Tunneling Prevention)
            const intersect = this.getLineIntersection(prevX, prevY, ball.x, ball.y, p1.x, p1.y, p2.x, p2.y);

            // 2. Point-Line Distance (Glancing Blow protection)
            const dist = this.getDistanceFromSegment(ball, p1, p2);
            const isGlancing = dist < ball.radius + 2;

            if (intersect || isGlancing) {
                let checkPoint = ball;
                if (intersect) {
                    checkPoint = intersect;
                    // Snap ball to collision point to prevent tunneling!
                    ball.x = checkPoint.x;
                    ball.y = checkPoint.y;
                } else {
                    checkPoint = this.getClosestPointOnSegment(p1, p2, ball);
                }

                const hasPaddle = this.paddles.some(p => p.edgeIndex === i);

                if (hasPaddle) {
                    const paddle = this.paddles.find(p => p.edgeIndex === i);
                    // Use 1.1 grace multiplier (10% extra width) to be lenient to player
                    if (this.checkPaddleHit(checkPoint, p1, p2, paddle, 1.1)) {
                        this.reflectBall(p1, p2);
                        this.pushBallOut(p1, p2);
                        this.audio.playBounce();
                        collided = true;
                    } else {
                        this.audio.playBounce(); // Fail sound?
                        this.triggerScore(this.score);
                        return;
                    }
                } else {
                    this.reflectBall(p1, p2);
                    this.pushBallOut(p1, p2);
                    this.audio.playBounce();
                    collided = true;
                }
            }
            if (collided) break;
        }
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

    getClosestPointOnSegment(p1, p2, p) {
        const edgeX = p2.x - p1.x;
        const edgeY = p2.y - p1.y;
        const len2 = edgeX * edgeX + edgeY * edgeY;
        let t = ((p.x - p1.x) * edgeX + (p.y - p1.y) * edgeY) / len2;
        t = Math.max(0, Math.min(1, t));
        return { x: p1.x + t * edgeX, y: p1.y + t * edgeY };
    }

    checkPaddleHit(ball, p1, p2, paddle, graceMultiplier = 1.0) {
        const edgeX = p2.x - p1.x;
        const edgeY = p2.y - p1.y;
        const len2 = edgeX * edgeX + edgeY * edgeY;
        const t = ((ball.x - p1.x) * edgeX + (ball.y - p1.y) * edgeY) / len2;

        const w = paddle.width * graceMultiplier;
        const pStart = paddle.position - w / 2;
        const pEnd = paddle.position + w / 2;
        return t >= pStart && t <= pEnd;
    }

    pushBallOut(p1, p2) {
        let nx = -(p2.y - p1.y);
        let ny = (p2.x - p1.x);
        const len = Math.sqrt(nx * nx + ny * ny);
        nx /= len;
        ny /= len;

        // Push 2 units along normal
        this.ball.x += nx * 2;
        this.ball.y += ny * 2;
    }

    getPlayerColor(index, alpha = 1) {
        const total = this.polygon.sides;
        const hue = (index / total) * 360;
        return `hsla(${hue}, 80%, 60%, ${alpha})`;
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

    draw() {
        // Clear screen with background tint if player is assigned
        this.ctx.fillStyle = '#0f172a'; // Default slate-900
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.playerIndex !== -1) {
            const myColor = this.getPlayerColor(this.playerIndex, 0.15);
            this.ctx.fillStyle = myColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.gameScale, this.gameScale);

        // Draw Polygon Edges (Walls)
        const vertices = this.polygon.vertices;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            const hasPaddle = this.paddles.some(p => p.edgeIndex === i);

            if (hasPaddle) {
                // "Goal" line - thinner, dimmer, behind paddle
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = this.getPlayerColor(i, 0.2);
                this.ctx.shadowBlur = 0;
            } else {
                // "Solid Wall" - thick as paddle, brighter to indicate bounce
                this.ctx.lineWidth = 6;
                this.ctx.strokeStyle = this.getPlayerColor(i, 0.8);
                this.ctx.shadowColor = this.getPlayerColor(i, 0.5);
                this.ctx.shadowBlur = 15;
            }

            // If FLASH effect is hitting this wall? 
            if (this.flashActive && this.gameState === 'SCORING') {
                // Not implementing specific wall flash yet
            }

            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        }

        // Draw Paddles
        this.paddles.forEach(paddle => {
            const p1 = vertices[paddle.edgeIndex];
            const p2 = vertices[(paddle.edgeIndex + 1) % vertices.length];

            const edgeX = p2.x - p1.x;
            const edgeY = p2.y - p1.y;

            const startT = paddle.position - paddle.width / 2;
            const endT = paddle.position + paddle.width / 2;

            const startX = p1.x + edgeX * startT;
            const startY = p1.y + edgeY * startT;
            const endX = p1.x + edgeX * endT;
            const endY = p1.y + edgeY * endT;

            this.ctx.strokeStyle = this.getPlayerColor(paddle.edgeIndex, 1);
            this.ctx.shadowColor = this.getPlayerColor(paddle.edgeIndex, 1);
            this.ctx.shadowBlur = 20;
            this.ctx.lineWidth = 6;

            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        });

        // Draw Ball

        // Draw Ball
        this.ball.draw(this.ctx, 0, 0); // Context is already translated


        this.ctx.restore();

        // UI Overlays...
        if (this.flashActive) {
            this.ctx.fillStyle = this.flashColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.flashActive = false;
        }

        // draw UI (Score, etc.)
        const s = this.gameScale || 1;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${24 * s}px Inter, sans-serif`;
        this.ctx.textAlign = 'left';

        if (this.gameState === 'PLAYING') {
            this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 20 * s, 40 * s);
        } else if (this.gameState === 'SCORING') {
            // ... existing scoring UI
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#38bdf8';
            this.ctx.shadowColor = '#38bdf8';
            this.ctx.shadowBlur = 20;
            this.ctx.font = `bold ${48 * s}px Inter, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText("YOU'VE BEEN PONGED!", this.canvas.width / 2, this.canvas.height / 2 - 50 * s);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${32 * s}px Inter, sans-serif`;
            this.ctx.fillText(`SURVIVED: ${this.lastScore} SECONDS`, this.canvas.width / 2, this.canvas.height / 2 + 10 * s);

            this.ctx.font = `${24 * s}px Inter, sans-serif`;
            // this.ctx.fillText(`Restarting in ${Math.ceil(this.scoreDisplayTimer)}...`, this.canvas.width / 2, this.canvas.height / 2 + 60);
            this.ctx.fillText(`CLICK OR PRESS SPACE TO RESTART`, this.canvas.width / 2, this.canvas.height / 2 + 60 * s);
        } else if (this.gameState === 'TERMINATED') {
            // Game terminated overlay (player left, etc.)
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#ef4444'; // Red color for termination
            this.ctx.shadowColor = '#ef4444';
            this.ctx.shadowBlur = 20;
            this.ctx.font = `bold ${48 * s}px Inter, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText("GAME ENDED", this.canvas.width / 2, this.canvas.height / 2 - 50 * s);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${28 * s}px Inter, sans-serif`;
            this.ctx.fillText(this.terminationReason || 'A player disconnected', this.canvas.width / 2, this.canvas.height / 2 + 10 * s);

            this.ctx.font = `${24 * s}px Inter, sans-serif`;
            this.ctx.fillText(`FINAL SCORE: ${this.lastScore} SECONDS`, this.canvas.width / 2, this.canvas.height / 2 + 60 * s);

            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = `${20 * s}px Inter, sans-serif`;
            this.ctx.fillText('CLICK OR PRESS SPACE TO REJOIN', this.canvas.width / 2, this.canvas.height / 2 + 110 * s);
        }
    }
}
