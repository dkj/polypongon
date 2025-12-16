import { Polygon } from './Polygon.js';
import { Ball } from './Ball.js';
import { Paddle } from './Paddle.js';
import { AudioManager } from './Audio.js';
import { BaseGame } from './BaseGame.js';
import { io } from 'socket.io-client';

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

        // UI State
        this.scoreDisplayTimer = 0;
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
        const initAudio = () => {
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
        };
        window.addEventListener('click', initAudio);
        window.addEventListener('touchstart', initAudio);

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
    }

    resetLocalGame() {
        this.resetState(); // BaseGame reset
        // Local specific override if needed? BaseGame randomizes rotation and sets width.
        // BaseGame does NOT set paddle position or count.
        // We assume paddles array is managed. 
        // In local, we have 1 paddle.
        if (this.paddles.length === 0) {
            this.paddles = [new Paddle(0)];
        }
        // Ensure paddle is correct
        this.paddles[0].width = 0.5;
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
                this.polygon.updateSides(data.sides);
                this.polygon.sides = data.sides;
                this.polygon.updateVertices();
            }
        });

        this.stateBuffer = [];

        this.socket.on('gameState', (state) => {
            this.stateBuffer.push(state);
            if (this.stateBuffer.length > 30) {
                this.stateBuffer.shift();
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

        this.currentRoomId = roomId;
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
        this.resetLocalGame();
    }

    rejoinMultiplayer() {
        if (!this.currentRoomId) return;
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.playerIndex = -1;
        this.gameState = 'SCORING';
        this.terminationReason = null;
        this.stateBuffer = [];
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
            this.handleOnlineInput(dt);
        }

        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        if (this.gameState === 'SCORING') return;

        const prevBallX = this.ball.x;
        const prevBallY = this.ball.y;

        // Base Rules (Difficulty, Polygon Rotation, Ball Speed check, Paddle Widths)
        super.updateGameRules(dt);

        // Local specific: Update audio difficulty
        this.audio.setDifficulty(this.difficulty);

        // Move Ball
        this.ball.update(dt);

        // Handle Input (Local Paddle)
        let dir = 0;
        if (this.keys['ArrowLeft']) dir = -1;
        if (this.keys['ArrowRight']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

        if (this.paddles.length > 0 && dir !== 0) {
            this.paddles[0].move(dir, dt);
        }

        // Check Collisions
        super.checkCollisions(prevBallX, prevBallY);
    }

    // --- Hooks for BaseGame ---

    onPaddleHit(edgeIndex) {
        this.audio.playBounce();
    }

    onWallBounce(edgeIndex) {
        this.audio.playBounce();
    }

    onGoal(edgeIndex) {
        this.audio.playBounce(); // Fail sound?
        this.triggerScore(this.score);
    }

    // --------------------------

    handleOnlineInput(dt) {
        if (!this.socket) return;
        if (this.gameState === 'SCORING') return;

        this.applyInterpolation();

        let dir = 0;
        if (this.keys['ArrowLeft']) dir = -1;
        if (this.keys['ArrowRight']) dir = 1;
        if (this.touchDir !== 0) dir = this.touchDir;

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
        const renderTimestamp = now - 100;
        let s0 = this.stateBuffer[0];
        let s1 = this.stateBuffer[1];
        let i = 0;

        while (i < this.stateBuffer.length - 1 && this.stateBuffer[i + 1].timestamp <= renderTimestamp) {
            s0 = this.stateBuffer[i];
            s1 = this.stateBuffer[i + 1];
            i++;
        }

        if (renderTimestamp > s1.timestamp) s0 = s1;
        else if (renderTimestamp < s0.timestamp) s1 = s0;

        let t = 0;
        if (s1.timestamp > s0.timestamp) {
            t = (renderTimestamp - s0.timestamp) / (s1.timestamp - s0.timestamp);
        }
        t = Math.max(0, Math.min(1, t));

        const lerp = (a, b, t) => a + (b - a) * t;

        this.ball.x = lerp(s0.ball.x, s1.ball.x, t);
        this.ball.y = lerp(s0.ball.y, s1.ball.y, t);
        this.ball.updateTrail();

        this.polygon.rotation = lerp(s0.rotation, s1.rotation, t);
        this.polygon.updateVertices();

        this.paddles = s1.paddles.map(pData1 => {
            if (this.playerIndex !== -1 && pData1.edgeIndex === this.playerIndex) {
                let myPaddle = this.paddles.find(p => p.edgeIndex === this.playerIndex);
                if (!myPaddle) myPaddle = new Paddle(pData1.edgeIndex);
                myPaddle.width = pData1.width ?? Math.max(0.1, 0.4 / (this.difficulty * 0.8));
                const serverPos = pData1.position;
                const drift = Math.abs(myPaddle.position - serverPos);
                if (drift > 0.01) {
                    const blendFactor = Math.min(0.3, drift * 2);
                    myPaddle.position = myPaddle.position + (serverPos - myPaddle.position) * blendFactor;
                }
                return myPaddle;
            }

            const p = new Paddle(pData1.edgeIndex);
            const pData0 = s0.paddles.find(pp => pp.edgeIndex === pData1.edgeIndex);
            if (pData0) {
                p.position = lerp(pData0.position, pData1.position, t);
            } else {
                p.position = pData1.position;
            }
            p.width = pData1.width ?? Math.max(0.1, 0.4 / (this.difficulty * 0.8));
            return p;
        });
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
        });

        this.ball.draw(this.ctx, 0, 0);

        this.ctx.restore();

        if (this.flashActive) {
            this.ctx.fillStyle = this.flashColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.flashActive = false;
        }

        const s = this.gameScale || 1;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${24 * s}px Inter, sans-serif`;
        this.ctx.textAlign = 'left';

        if (this.gameState === 'PLAYING') {
            this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 20 * s, 40 * s);
        } else if (this.gameState === 'SCORING') {
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
            this.ctx.fillText(`CLICK OR PRESS SPACE TO RESTART`, this.canvas.width / 2, this.canvas.height / 2 + 60 * s);
        } else if (this.gameState === 'TERMINATED') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ef4444';
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
