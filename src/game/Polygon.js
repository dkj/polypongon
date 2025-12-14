export class Polygon {
    constructor(radius, sides) {
        this.radius = radius;
        this.sides = sides;
        this.rotation = 0;
        this.rotationSpeed = 0.5;
        this.vertices = [];
        this.updateVertices();
    }

    updateVertices() {
        this.vertices = [];
        for (let i = 0; i < this.sides; i++) {
            const angle = (Math.PI * 2 * i) / this.sides + this.rotation;
            this.vertices.push({
                x: Math.cos(angle) * this.radius,
                y: Math.sin(angle) * this.radius
            });
        }
    }

    update(dt) {
        // Rotation speed increases over time
        this.rotation += this.rotationSpeed * dt;
        this.updateVertices();
    }

    draw(ctx, centerX, centerY) {
        ctx.beginPath();
        if (this.vertices.length > 0) {
            ctx.moveTo(centerX + this.vertices[0].x, centerY + this.vertices[0].y);
            for (let i = 1; i < this.vertices.length; i++) {
                ctx.lineTo(centerX + this.vertices[i].x, centerY + this.vertices[i].y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#38bdf8';
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
    }
}
