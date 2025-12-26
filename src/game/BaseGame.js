import { Polygon } from './Polygon.js';
import { Ball } from './Ball.js';
import { GAME_CONSTANTS } from './Constants.js';

export class BaseGame {
    constructor() {
        // Game Objects
        this.polygon = new Polygon(250, 5);
        this.ball = new Ball(0, 0);
        this.paddles = [];

        // State
        this.gameState = 'SCORING';
        this.score = 0;
        this.lastScore = 0;
        this.timeElapsed = 0;
        this.difficulty = 1.0;
        this.rotationDirection = 1;
        this.countdownTimer = 0;
    }

    /**
     * Standard reset logic for starting a new round
     */
    resetState() {
        this.gameState = 'COUNTDOWN';
        this.countdownTimer = GAME_CONSTANTS.COUNTDOWN_DURATION || 3;
        this.resetBall();
        this.difficulty = 1.0;
        this.score = 0;
        this.timeElapsed = 0;

        // Randomize rotation direction: 1 or -1
        this.rotationDirection = Math.random() < 0.5 ? 1 : -1;
        this.polygon.rotationSpeed = GAME_CONSTANTS.ROTATION_SPEED_BASE * this.rotationDirection;
        this.paddles.forEach(p => {
            p.width = 0.5; // Reset to default relative width
            // ServerGame also resets position/moveDirection, but that's server specific
        });
    }

    resetBall() {
        this.ball.x = 0;
        this.ball.y = 0;
        this.ball.trail = []; // Clear trail from previous game
        const speed = GAME_CONSTANTS.BALL_SPEED_BASE;
        const angle = Math.random() * Math.PI * 2;
        this.ball.vx = Math.cos(angle) * speed;
        this.ball.vy = Math.sin(angle) * speed;
    }

    /**
     * Updates game rules (difficulty, polygon rotation, ball speed capping).
     * Does NOT move paddles or update ball position (allows subclass control over step order).
     * @param {number} dt 
     */
    updateGameRules(dt) {
        if (this.gameState === 'SCORING') return;

        if (this.gameState === 'COUNTDOWN') {
            this.countdownTimer -= dt;
            if (this.countdownTimer <= 0) {
                this.gameState = 'PLAYING';
                this.countdownTimer = 0;
            }
            return;
        }

        this.timeElapsed += dt;

        this.difficulty = 1 + this.timeElapsed / GAME_CONSTANTS.DIFFICULTY_RAMP;

        this.polygon.rotationSpeed = GAME_CONSTANTS.ROTATION_SPEED_BASE * this.difficulty * this.rotationDirection;
        this.polygon.update(dt);

        const currentSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
        const targetSpeed = GAME_CONSTANTS.BALL_SPEED_BASE * (this.difficulty ** 0.5);

        if (currentSpeed < targetSpeed) {
            const scale = targetSpeed / currentSpeed;
            this.ball.vx *= scale;
            this.ball.vy *= scale;
        }

        const targetWidth = Math.max(
            GAME_CONSTANTS.PADDLE_WIDTH_MIN,
            GAME_CONSTANTS.PADDLE_WIDTH_BASE / (this.difficulty * GAME_CONSTANTS.PADDLE_WIDTH_DIFFICULTY_FACTOR)
        );
        this.paddles.forEach(p => p.width = targetWidth);
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

                // Check if ball is moving TOWARD this wall
                // Normal points inward, so moving out means dot(v, n) < 0
                let nx = -(p2.y - p1.y);
                let ny = (p2.x - p1.x);
                const len = Math.sqrt(nx * nx + ny * ny);
                nx /= len; ny /= len;
                if (nx * (-(p1.x + p2.x) / 2) + ny * (-(p1.y + p2.y) / 2) < 0) {
                    nx = -nx; ny = -ny;
                }
                const dot = this.ball.vx * nx + this.ball.vy * ny;

                if (dot < 0) { // Only collide if moving OUTWARD
                    let hitPaddle = false;
                    if (hasPaddle) {
                        const paddle = this.paddles.find(p => p.edgeIndex === i);
                        if (this.checkPaddleHit(checkPoint, p1, p2, paddle, GAME_CONSTANTS.COLLISION_GRACE)) {
                            hitPaddle = true;
                        }
                    }

                    if (hitPaddle) {
                        this.reflectBall(p1, p2);
                        this.onPaddleHit(i);
                        collided = true;
                    } else if (hasPaddle) {
                        this.onGoal(i);
                        return;
                    } else {
                        this.reflectBall(p1, p2);
                        this.onWallBounce(i);
                        collided = true;
                    }
                }
            }
            if (collided) break;
        }
    }

    // Hooks for interaction/audio/networking
    onPaddleHit(_edgeIndex) {
        this.score++;
    }
    onWallBounce(_edgeIndex) { }
    onGoal(_edgeIndex) { }

    reflectBall(p1, p2) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        let nx = -(p2.y - p1.y);
        let ny = (p2.x - p1.x);
        const len = Math.sqrt(nx * nx + ny * ny);
        nx /= len;
        ny /= len;

        // Ensure normal points INWARD
        if (nx * (-mx) + ny * (-my) < 0) {
            nx = -nx;
            ny = -ny;
        }

        const dot = this.ball.vx * nx + this.ball.vy * ny;
        this.ball.vx = this.ball.vx - 2 * dot * nx;
        this.ball.vy = this.ball.vy - 2 * dot * ny;

        // Push along normal to prevent immediate re-collision
        this.ball.x += nx * 4;
        this.ball.y += ny * 4;

        this.ball.vx *= GAME_CONSTANTS.BALL_SPEED_INCREASE;
        this.ball.vy *= GAME_CONSTANTS.BALL_SPEED_INCREASE;
    }



    // --- Geometry Helpers ---

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
}
