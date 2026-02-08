import { Paddle } from './Paddle.js';
import { AudioManager } from './Audio.js';
import { BaseGame } from './BaseGame.js';
import { io } from 'socket.io-client';
import { GAME_CONSTANTS } from './Constants.js';

export class Game extends BaseGame {
    constructor(canvas) {
        super();
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();

        this.audio = new AudioManager();

        // State
        this.mode = 'local'; // 'local' or 'online'
        this.socket = null;
        this.playerIndex = -1;

        this.finalTime = 0;
        this.hasPlayed = false;

        this.readyEdges = [];

        this.onStateChange = null;

        window.addEventListener('resize', () => this.resize());

        // Input
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            // Ignore game inputs if a modal is open
            if (document.querySelector('.modal-overlay.visible')) return;

            this.keys[e.code] = true;

            // Restart actions: only handle if target is NOT an interactive element (buttons handle their own)
            if ((e.code === 'Space' || e.code === 'Enter')) {
                const isUIElement = ['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(e.target.tagName);
                if (!isUIElement) {
                    this.audio.init();
                    this.handleRestartAction();
                }
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Touch
        this.touchDir = 0;
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.touchDir = 0);

        // Audio & Visual init
        const initAudio = () => {
            this.audio.init();
            // Note: We don't auto-restart on global click anymore, 
            // relying on the specific button or space/enter key.
        };
        window.addEventListener('click', initAudio);
        window.addEventListener('touchstart', initAudio);

        this.flashTime = 0;

        this.menuContainer = document.getElementById('game-menu');
        this.restartBtn = document.getElementById('restartBtn');
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', (_e) => {
                this.audio.init();
                this.handleRestartAction();
            });
        }

        // Visual Effects
        this.particles = [];
        this.flashActive = false;
        this.flashColor = '';

        // Initial State
        if (this.gameState === 'SCORING') {
            this.refreshMenu();
        }

        // Hint persistence
        this.leftHintTimer = 0;
        this.rightHintTimer = 0;

        // Client-side paddle prediction
        this.myPaddlePosition = null; // Store predicted position
    }

    addParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 400,
                vy: (Math.random() - 0.5) * 400,
                life: 1.0,
                color: color,
                size: Math.random() * 4 + 2
            });
        }
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 2;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    refreshMenu() {
        const isOnline = this.mode === 'online';
        const show = this.gameState === 'TERMINATED' || (this.gameState === 'SCORING' && this.celebrationTimer <= 0);

        if (!show) return this.setMenuVisible(false);

        let text = 'START GAME';
        if (this.gameState === 'TERMINATED') text = 'REJOIN GAME';
        else if (isOnline) text = (this.readyEdges || []).includes(this.playerIndex) ? 'WAITING...' : "I'M READY";
        else if (this.hasPlayed) text = 'PLAY AGAIN';

        this.setMenuVisible(true, text);
    }

    setMenuVisible(visible, text = '') {
        if (!this.menuContainer) return;
        this.menuContainer.style.display = visible ? 'flex' : 'none';
        if (visible && this.restartBtn) {
            if (this.restartBtn.innerText !== text) {
                this.restartBtn.innerText = text;
                this.restartBtn.focus();
            }
            this.restartBtn.classList.toggle('btn-ready', text === 'WAITING...');
        } else if (!visible && this.restartBtn) {
            this.restartBtn.classList.remove('btn-ready');
        }
    }

    handleRestartAction() {
        if (this.gameState === 'SCORING' || this.gameState === 'TERMINATED') {
            if (this.socket) {
                if (this.gameState === 'TERMINATED') {
                    this.rejoinMultiplayer();
                } else {
                    // In multiplayer, toggle ready state instead of immediate restart
                    const isReady = !this.readyEdges.includes(this.playerIndex);
                    this.socket.emit('playerReady', { ready: isReady });
                }
            } else {
                this.resetLocalGame();
            }
        }
    }

    flashEffect(color = 'rgba(239, 68, 68, 0.2)') {
        this.flashActive = true;
        this.flashColor = color;
    }

    setGameState(newState) {
        if (this.gameState !== newState) {
            super.setGameState(newState);
            if (this.onStateChange) {
                this.onStateChange(newState);
            }
        }
    }

    startCelebration() {
        super.startCelebration();
        this.hasPlayed = true;
        if (this.ball) {
            this.ball.maxTrailLength = 200;
        }
        this.refreshMenu();
    }

    triggerScore(score, time) {
        this.startCelebration();
        this.lastScore = score;
        this.finalTime = time ?? Math.floor(this.timeElapsed);
    }

    onCelebrationEnd() {
        super.onCelebrationEnd();
        if (this.ball) {
            this.ball.maxTrailLength = 20;
        }
        this.refreshMenu();
    }


    resetLocalGame() {
        this.resetState(); // BaseGame reset
        this.lastTime = performance.now(); // Reset timer to prevent dt spikes

        // In local, we have 1 paddle at edge 0.
        this.paddles = [new Paddle(0)];
        this.paddles[0].width = 0.5;

        this.setMenuVisible(false);
    }

    startMultiplayer(roomId, instanceId = null) {
        console.log('Attempting to connect to server...');
        this.clearResults();
        this.mode = 'online';
        this.lastTime = performance.now();

        // Build query parameters for instance routing
        const query = {};
        if (instanceId) {
            query.instance = instanceId;
            console.log(`Connecting to instance: ${instanceId}`);
        }

        this.socket = io({
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            forceNew: true,
            multiplex: false,
            query
        });

        this.socket.on('connect', () => {
            console.log('Connected to server successfully with ID:', this.socket.id);
            // Send instance info with room join request
            const joinData = instanceId ? { roomId, instance: instanceId } : roomId;
            this.socket.emit('joinRoom', joinData);
        });

        this.socket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
        });

        this.socket.on('init', (data) => {
            this.playerIndex = data.playerIndex;
            if (this.polygon.sides !== data.sides) {
                this.polygon.updateSides(data.sides);
            }
            if (data.instanceId) {
                console.log(`Confirmed connected to instance: ${data.instanceId}`);
            }
        });


        this.socket.on('gameState', (state) => {
            // Client-side physics: only ignore ball updates during PLAYING
            // Accept ball updates during SCORING, COUNTDOWN, etc.
            if (state.gameState !== 'PLAYING') {
                this.ball.x = state.ball.x;
                this.ball.y = state.ball.y;
                this.ball.updateTrail();
            }

            this.polygon.rotation = state.rotation;
            this.polygon.updateVertices();

            // Setup paddles from server data
            // Preserve local player's paddle for client-side prediction, 
            // BUT NOT during transitions to COUNTDOWN (restart)
            const isRestarting = state.gameState === 'COUNTDOWN' && this.gameState !== 'COUNTDOWN';

            const myCurrentPaddle = (this.playerIndex !== -1 && !isRestarting) ?
                this.paddles.find(p => p.edgeIndex === this.playerIndex) : null;

            this.paddles = state.paddles.map(pData => {
                // Keep our local paddle position (client-side prediction)
                if (this.playerIndex !== -1 && pData.edgeIndex === this.playerIndex && myCurrentPaddle) {
                    myCurrentPaddle.width = pData.width ?? 0.5;
                    return myCurrentPaddle;
                }

                // Use server position for other players (and for ourself if restarting)
                const p = new Paddle(pData.edgeIndex);
                p.position = pData.position;
                p.width = pData.width ?? Math.max(0.1, 0.4 / (this.difficulty * 0.8));

                // If this is OUR paddle and we are restarting, sync the local prediction tracker
                if (this.playerIndex !== -1 && pData.edgeIndex === this.playerIndex) {
                    this.myPaddlePosition = p.position;
                }

                return p;
            });

            this.difficulty = state.difficulty;
            this.rotationDirection = state.rotationDirection;
            const oldTimer = this.celebrationTimer;
            if (state.celebrationTimer !== undefined) {
                this.celebrationTimer = state.celebrationTimer;
                if (oldTimer > 0 && this.celebrationTimer === 0) {
                    this.onCelebrationEnd();
                }
            }

            const previousState = this.gameState;
            this.setGameState(state.gameState);
            this.score = state.score;
            this.lastScore = state.lastScore;
            this.finalTime = state.finalTime || 0;
            this.timeElapsed = state.timeElapsed || 0;
            this.readyEdges = state.readyEdges || [];

            if (this.lastScore > 0 || this.finalTime > 0) {
                this.hasPlayed = true;
            }
            this.audio.setDifficulty(this.difficulty);

            this.refreshMenu();
            if (state.countdownTimer !== undefined && state.countdownTimer !== null) {
                this.countdownTimer = state.countdownTimer;
            } else if (state.gameState === 'COUNTDOWN' && previousState !== 'COUNTDOWN') {
                this.countdownTimer = 3;
            }

            // Sync ball state when transitioning to COUNTDOWN (game restart)
            // This ensures all clients start with identical initial conditions
            if (state.gameState === 'COUNTDOWN' && previousState !== 'COUNTDOWN') {
                this.ball.x = state.ball.x;
                this.ball.y = state.ball.y;
                this.ball.vx = state.ball.vx;
                this.ball.vy = state.ball.vy;
                this.ball.updateTrail();
            }
        });

        this.socket.on('gameEvent', (event) => {
            if (event.type === 'bounce') {
                this.audio.playBounce();
                if (event.edgeIndex !== undefined) {
                    this.addParticles(this.ball.x, this.ball.y, this.getPlayerColor(event.edgeIndex));
                }
            }
            if (event.type === 'goal') {
                this.flashEffect('rgba(239, 68, 68, 0.4)');
                this.audio.playGoal();
                if (this.ball) {
                    this.ball.maxTrailLength = 200;
                }
                this.lastScore = event.score;
                this.finalTime = event.time;
                this.hasPlayed = true;
                this.startCelebration();
                this.setMenuVisible(false);
            }
        });

        this.socket.on('gameTerminated', (data) => {
            this.setGameState('TERMINATED');
            this.terminationReason = data.reason;
            this.lastScore = data.lastScore;
            this.finalTime = data.finalTime || 0;

            this.refreshMenu();
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            if (error.message === 'Connected to wrong instance') {
                console.error(`Instance mismatch: Expected ${error.expectedInstance}, got ${error.currentInstance}`);
                // Could show user-facing error here
            }
        });

        this.currentRoomId = roomId;
        this.currentInstanceId = instanceId;
    }

    stopMultiplayer() {
        console.log('Stopping multiplayer, reverting to local...');
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.mode = 'local';
        this.playerIndex = -1;
        this.currentRoomId = null;
        this.currentInstanceId = null;

        // Reset to initial menu state instead of immediately starting
        this.setGameState('SCORING');
        this.clearResults();
        this.setMenuVisible(true, 'START GAME');

        // Reset polygon and paddles for local play
        this.polygon.updateSides(5);
        this.paddles = [new Paddle(0)];
        this.paddles[0].width = 0.5;
    }

    rejoinMultiplayer() {
        if (!this.currentRoomId) return;
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.playerIndex = -1;
        this.setGameState('SCORING');
        this.terminationReason = null;
        this.clearResults();
        this.startMultiplayer(this.currentRoomId, this.currentInstanceId);
    }

    handleTouch(e) {
        if (e.cancelable) {
            e.preventDefault();
        }


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
        const minDim = Math.min(this.canvas.width, this.canvas.height);
        this.gameScale = minDim / 600;
        document.documentElement.style.setProperty('--game-scale', this.gameScale);
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(time) {
        let dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.step(dt);

        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }

    fixedUpdate(dt) {
        // Update visual hint timers for both local and online
        if (this.leftHintTimer > 0) this.leftHintTimer -= dt;
        if (this.rightHintTimer > 0) this.rightHintTimer -= dt;

        // Only show hints for players (not spectators)
        if (this.gameState === 'COUNTDOWN' && (this.playerIndex !== -1 || this.mode === 'local')) {
            const leftInput = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touchDir === -1;
            const rightInput = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touchDir === 1;
            if (leftInput) this.leftHintTimer = 0.5;
            if (rightInput) this.rightHintTimer = 0.5;
        }

        if (this.mode === 'local') {
            this.update(dt);
        } else {
            this.updateOnlinePhysics(dt);
        }

        this.updateParticles(dt);
    }

    update(dt) {
        // Handle Input (Local Paddle)
        let dir = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dir = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

        if (this.paddles.length > 0 && dir !== 0 && (this.gameState === 'PLAYING' || this.gameState === 'COUNTDOWN')) {
            this.paddles[0].move(dir, dt);
        }

        super.update(dt);
        this.audio.setDifficulty(this.difficulty);
    }

    // --- Hooks for BaseGame ---

    onPaddleHit(edgeIndex) {
        super.onPaddleHit(edgeIndex);
        this.audio.playBounce();
        this.addParticles(this.ball.x, this.ball.y, this.getPlayerColor(edgeIndex));
    }

    onWallBounce(edgeIndex) {
        this.audio.playBounce();
        this.addParticles(this.ball.x, this.ball.y, this.getPlayerColor(edgeIndex), 5);
    }

    onGoal(_edgeIndex) {
        this.audio.playGoal();
        this.flashEffect('rgba(239, 68, 68, 0.4)');
        if (this.ball) {
            this.ball.maxTrailLength = 200;
        }
        this.triggerScore(this.score, Math.floor(this.timeElapsed));
    }

    // --------------------------



    updateOnlinePhysics(dt) {
        if (!this.socket) return;

        super.updateGameRules(dt);

        if (this.gameState === 'SCORING') return;

        // Handle local paddle input
        let dir = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dir = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

        // Move local paddle immediately
        if (this.playerIndex !== -1 && this.paddles.length > 0) {
            const myPaddle = this.paddles.find(p => p.edgeIndex === this.playerIndex);
            if (myPaddle) {
                myPaddle.move(dir, dt);
                // Store predicted position to survive server state updates
                this.myPaddlePosition = myPaddle.position;
            }
        }

        // Send input to server
        if (this.lastDir !== dir) {
            this.socket.emit('input', { dir });
            this.lastDir = dir;
        }

        // Run client-side physics (optimistic bounces)
        if (this.gameState === 'PLAYING') {
            const prevBallX = this.ball.x;
            const prevBallY = this.ball.y;

            this.ball.update(dt);
            this.checkCollisionsOptimistic(prevBallX, prevBallY);
        }
    }

    // Client-side collision detection with optimistic bounces
    checkCollisionsOptimistic(prevX, prevY) {
        const vertices = this.polygon.vertices;
        const ball = this.ball;
        let collided = false;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            const intersect = this.getLineIntersection(prevX, prevY, ball.x, ball.y, p1.x, p1.y, p2.x, p2.y);
            const dist = this.getDistanceFromSegment(ball, p1, p2);
            const isGlancing = dist < ball.radius + 2;

            if (intersect || isGlancing) {
                let checkPoint = ball;
                if (intersect) {
                    checkPoint = intersect;
                    ball.x = checkPoint.x;
                    ball.y = checkPoint.y;
                } else {
                    checkPoint = this.getClosestPointOnSegment(p1, p2, ball);
                }

                const hasPaddle = this.paddles.some(p => p.edgeIndex === i);

                let nx = -(p2.y - p1.y);
                let ny = (p2.x - p1.x);
                const len = Math.sqrt(nx * nx + ny * ny);
                nx /= len; ny /= len;
                if (nx * (-(p1.x + p2.x) / 2) + ny * (-(p1.y + p2.y) / 2) < 0) {
                    nx = -nx; ny = -ny;
                }
                const dot = this.ball.vx * nx + this.ball.vy * ny;

                if (dot < 0) { // Moving outward
                    if (hasPaddle) {
                        let paddle = this.paddles.find(p => p.edgeIndex === i);

                        // For MY edge, use predicted position to avoid race conditions
                        if (i === this.playerIndex && this.myPaddlePosition !== null) {
                            paddle = { ...paddle, position: this.myPaddlePosition };
                        }

                        const hitPaddle = this.checkPaddleHit(checkPoint, p1, p2, paddle, GAME_CONSTANTS.COLLISION_GRACE);

                        if (i === this.playerIndex) {
                            // MY edge: I have authority
                            if (hitPaddle) {
                                this.reflectBall(p1, p2);
                                this.onPaddleHit(i);
                                // Inform server of successful hit (optional logging)
                                this.socket.emit('paddleHit', {
                                    edgeIndex: i,
                                    timestamp: this.timeElapsed
                                });
                            } else {
                                // I missed - concede goal
                                // Prevent duplicate goal reports by checking state
                                if (this.gameState === 'PLAYING') {
                                    this.onGoal(i);
                                    // Inform server of goal
                                    this.socket.emit('goalConceded', {
                                        edgeIndex: i,
                                        score: this.score,
                                        time: Math.floor(this.timeElapsed)
                                    });
                                }
                                return;
                            }
                        } else {
                            // OTHER player's edge: optimistic bounce
                            this.reflectBall(p1, p2);
                            this.onPaddleHit(i);
                        }
                    } else {
                        // Wall bounce
                        this.reflectBall(p1, p2);
                        this.onWallBounce(i);
                    }
                    collided = true;
                }
            }
            if (collided) break;
        }
    }




    getPlayerColor(index, alpha = 1) {
        const total = this.polygon.sides;
        const hue = (index / total) * 360;
        return `hsla(${hue}, 80%, 60%, ${alpha})`;
    }

    draw() {
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.playerIndex !== -1) {
            const myColor = this.getPlayerColor(this.playerIndex, 0.15);
            this.ctx.fillStyle = myColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.gameScale, this.gameScale);

        const vertices = this.polygon.vertices;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];
            const hasPaddle = this.paddles.some(p => p.edgeIndex === i);

            if (hasPaddle) {
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = this.getPlayerColor(i, 0.2);
                this.ctx.shadowBlur = 0;
            } else {
                this.ctx.lineWidth = 6;
                this.ctx.strokeStyle = this.getPlayerColor(i, 0.8);
                this.ctx.shadowColor = this.getPlayerColor(i, 0.5);
                this.ctx.shadowBlur = 15;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        }

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

            // Visual indicator for local player to distinguish their paddle
            const isLocalPlayer = (this.mode === 'online' && paddle.edgeIndex === this.playerIndex) ||
                (this.mode === 'local');

            if (isLocalPlayer) {
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const angle = Math.atan2(midY, midX);

                this.ctx.save();
                this.ctx.translate(midX, midY);
                this.ctx.rotate(angle);

                this.ctx.beginPath();
                // Small semicircle "bump" on the outer side of the paddle
                this.ctx.arc(0, 0, 12, -Math.PI / 2, Math.PI / 2);
                this.ctx.fillStyle = this.getPlayerColor(paddle.edgeIndex, 1);
                this.ctx.fill();

                // Add a subtle highlight highlight
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                this.ctx.restore();
            }

            // Ready Indicator for Multiplayer
            if (this.gameState === 'SCORING' && this.mode === 'online' && this.readyEdges.includes(paddle.edgeIndex)) {
                this.ctx.save();
                this.ctx.translate((startX + endX) / 2, (startY + endY) / 2);

                // Normal direction (away from center)
                const nx = (startX + endX) / 2;
                const ny = (startY + endY) / 2;
                const angle = Math.atan2(ny, nx);
                this.ctx.rotate(angle + Math.PI / 2);

                this.ctx.fillStyle = this.getPlayerColor(paddle.edgeIndex, 1);
                this.ctx.font = `800 ${14}px 'Outfit', sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = this.ctx.fillStyle;
                this.ctx.fillText('READY', 0, 25);
                this.ctx.restore();

                // Glow effect on ready paddle
                this.ctx.save();
                this.ctx.strokeStyle = this.getPlayerColor(paddle.edgeIndex, 0.4);
                this.ctx.lineWidth = 15;
                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
                this.ctx.restore();
            }
        });

        this.ball.draw(this.ctx, 0, 0);

        // Draw Particles
        this.ctx.shadowBlur = 0;
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, Math.max(0, p.size), 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        this.ctx.restore();

        if (this.flashActive) {
            this.ctx.fillStyle = this.flashColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.flashActive = false;
        }

        const s = this.gameScale || 1;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `600 ${20 * s}px 'Outfit', sans-serif`;
        this.ctx.textAlign = 'left';

        if (this.gameState === 'PLAYING') {
            const timeStr = `TIME: ${Math.floor(this.timeElapsed || 0)}S`;
            const scoreStr = `SCORE: ${this.score || 0}`;
            const fullStr = `${scoreStr} | ${timeStr}`;

            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';

            if (s < 0.8) {
                // Mobile: Center below the title
                this.ctx.font = `600 ${16 * s}px 'Outfit', sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(fullStr, this.canvas.width / 2, 70 * s);
            } else {
                // Desktop: Top Left
                this.ctx.font = `600 ${20 * s}px 'Outfit', sans-serif`;
                this.ctx.textAlign = 'left';
                this.ctx.fillText(fullStr, 20 * s, 30 * s);
            }
            this.ctx.shadowBlur = 0;
        } else if (this.gameState === 'SCORING') {
            const overlayAlpha = this.celebrationTimer > 0 ? 0.3 : 0.7;
            this.ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#38bdf8';
            this.ctx.shadowColor = '#38bdf8';

            // Pulsate effect during celebration
            const pulsate = this.celebrationTimer > 0 ? Math.sin(this.celebrationTimer * 10) * 10 : 0;
            this.ctx.shadowBlur = 20 + pulsate;
            this.ctx.font = `800 ${(64 + pulsate / 2) * s}px 'Outfit', sans-serif`;
            this.ctx.textAlign = 'center';

            if (this.hasPlayed) {
                this.ctx.fillText("PONGED!", this.canvas.width / 2, this.canvas.height / 2 - 80 * s);
                this.ctx.fillStyle = '#fff';
                this.ctx.font = `600 ${32 * s}px 'Outfit', sans-serif`;
                this.ctx.shadowBlur = 0;
                this.ctx.fillText(`SCORE: ${this.lastScore} | TIME: ${this.finalTime}S`, this.canvas.width / 2, this.canvas.height / 2 - 20 * s);
            } else {
                this.ctx.fillText("Anyone for Pong?", this.canvas.width / 2, this.canvas.height / 2 - 20 * s);
            }
            this.ctx.font = `400 ${24 * s}px 'Outfit', sans-serif`;

            if (this.mode === 'online') {
                const isReady = this.readyEdges.includes(this.playerIndex);
                if (isReady) {
                    this.ctx.fillStyle = '#94a3b8';
                    this.ctx.fillText("Waiting for others to say they are ready...", this.canvas.width / 2, this.canvas.height / 2 + 50 * s);
                } else if (this.readyEdges.length > 0) {
                    this.ctx.fillStyle = '#38bdf8';
                    this.ctx.shadowColor = '#38bdf8';
                    this.ctx.shadowBlur = 15;
                    this.ctx.fillText("Other players are waiting for you!", this.canvas.width / 2, this.canvas.height / 2 + 50 * s);
                    this.ctx.shadowBlur = 0;
                }
            }
            // this.ctx.fillText(`CLICK OR PRESS SPACE TO RESTART`, this.canvas.width / 2, this.canvas.height / 2 + 60 * s);
        } else if (this.gameState === 'TERMINATED') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ef4444';
            this.ctx.shadowColor = '#ef4444';
            this.ctx.shadowBlur = 20;
            this.ctx.font = `800 ${64 * s}px 'Outfit', sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 80 * s);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `600 ${28 * s}px 'Outfit', sans-serif`;
            this.ctx.fillText(this.terminationReason || 'A player disconnected', this.canvas.width / 2, this.canvas.height / 2 - 20 * s);
            this.ctx.font = `400 ${24 * s}px 'Outfit', sans-serif`;
            this.ctx.fillText(`SCORE: ${this.lastScore} | TIME: ${this.finalTime}S`, this.canvas.width / 2, this.canvas.height / 2 + 20 * s);
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = `${20 * s}px 'Outfit', sans-serif`;
            // this.ctx.fillText('CLICK OR PRESS SPACE TO REJOIN', this.canvas.width / 2, this.canvas.height / 2 + 110 * s);
        } else if (this.gameState === 'COUNTDOWN') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw control hints for the player's paddle (if not a spectator)
            if (this.playerIndex !== -1 || this.mode === 'local') {
                this.drawControlHints(s);
            }

            this.ctx.fillStyle = '#fff';
            this.ctx.shadowColor = '#fff';
            this.ctx.shadowBlur = 20;
            this.ctx.font = `800 ${120 * s}px 'Outfit', sans-serif`;
            this.ctx.textAlign = 'center';
            const count = Math.ceil(this.countdownTimer);
            this.ctx.fillText(count > 0 ? count : "GO!", this.canvas.width / 2, this.canvas.height / 2 + 40 * s);
        }

        // Multiplayer Debug Info
        if (this.mode === 'online' && this.playerIndex !== -1 && this.gameState !== 'SCORING') {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.font = `${14 * s}px 'Outfit', sans-serif`;
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`ID: ${this.socket.id.substring(0, 4)} | P${this.playerIndex + 1}`, 20 * s, this.canvas.height - 20 * s);
        }

        // Spectator Mode Indicator
        if (this.mode === 'online' && this.playerIndex === -1 && this.socket) {
            this.ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
            this.ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
            this.ctx.shadowBlur = 15;
            this.ctx.font = `600 ${24 * s}px 'Outfit', sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('SPECTATOR MODE', this.canvas.width / 2, this.canvas.height - 40 * s);

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.shadowBlur = 0;
        }
    }

    drawControlHints(s) {
        if (this.leftHintTimer <= 0 && this.rightHintTimer <= 0) return;

        // Use maximum of both timers for overall alpha
        const timer = Math.max(this.leftHintTimer, this.rightHintTimer);
        const alpha = Math.min(1.0, timer * 2.0) * 0.6;

        // Calculate radii
        // Circumradius (distance from center to a vertex)
        const vertices = this.polygon.vertices;
        const circumradius = Math.sqrt(vertices[0].x * vertices[0].x + vertices[0].y * vertices[0].y);
        const innerRadius = circumradius * (2 / 3);

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(s, s);

        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.lineWidth = 10;
        this.ctx.lineCap = 'round';

        const isRight = this.rightHintTimer > this.leftHintTimer;

        // 4 arrows, each 1/8th of circumference (PI / 4)
        const arcLen = Math.PI / 4;
        const spacing = Math.PI / 2; // Evenly distributed

        for (let i = 0; i < 4; i++) {
            const centerAngle = i * spacing;
            const startAngle = centerAngle - arcLen / 2;
            const endAngle = centerAngle + arcLen / 2;

            // Draw the arc
            this.ctx.beginPath();
            this.ctx.arc(0, 0, innerRadius, startAngle, endAngle);
            this.ctx.stroke();

            // Tip is at the "forward" end of movement
            const tipAngle = isRight ? endAngle : startAngle;
            const tipX = Math.cos(tipAngle) * innerRadius;
            const tipY = Math.sin(tipAngle) * innerRadius;

            // Point direction (tangent)
            // Clockwise = +PI/2 from radial angle, Anti-clockwise = -PI/2
            const pointingAngle = isRight ? tipAngle + Math.PI / 2 : tipAngle - Math.PI / 2;
            const headSize = 15;

            this.ctx.beginPath();
            this.ctx.moveTo(tipX, tipY);

            // Side lines point "backwards" from the pointing direction
            const backAngle = pointingAngle + Math.PI;
            this.ctx.lineTo(
                tipX + Math.cos(backAngle - 0.5) * headSize,
                tipY + Math.sin(backAngle + 0.5) * headSize
            );

            this.ctx.moveTo(tipX, tipY);
            this.ctx.lineTo(
                tipX + Math.cos(backAngle + 0.5) * headSize,
                tipY + Math.sin(backAngle - 0.5) * headSize
            );

            this.ctx.stroke();
        }

        this.ctx.restore();
    }
}
