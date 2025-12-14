export class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        // Random velocity for now
        const speed = 200;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = '#fff';

        this.trail = []; // Stores {x, y} positions
        this.maxTrailLength = 20;
        this.trailTimer = 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.updateTrail();
    }

    updateTrail() {
        // Add trail point every frame
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.pop();
        }
    }

    draw(ctx, centerX, centerY) {
        // Draw Trail
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            const alpha = 1 - (i / this.maxTrailLength); // Fade out
            const size = this.radius * (1 - (i / this.maxTrailLength) * 0.5); // Shrink slightly

            ctx.beginPath();
            ctx.arc(centerX + point.x, centerY + point.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`; // Max opacity 0.5 for trail
            ctx.fill();
        }

        // Draw Ball
        ctx.beginPath();
        ctx.arc(centerX + this.x, centerY + this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}
