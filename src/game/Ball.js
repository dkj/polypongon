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
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw(ctx, centerX, centerY) {
        ctx.beginPath();
        ctx.arc(centerX + this.x, centerY + this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}
