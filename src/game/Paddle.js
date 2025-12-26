export class Paddle {
    constructor(edgeIndex) {
        this.edgeIndex = edgeIndex;
        this.position = 0.5; // 0 to 1 (normalized along the edge)
        this.width = 0.2; // 20% of the edge length
        this.color = '#38bdf8';
    }

    move(direction, dt) {
        const speed = 1.0; // units per second (in normalized space)
        this.position += direction * speed * dt;
        // Clamp
        this.position = Math.max(this.width / 2, Math.min(1 - this.width / 2, this.position));
    }

    update(_dt) {
        // AI or interpolation logic later
    }

    draw(ctx, polygon, centerX, centerY) {
        // Need to find the start and end point of the edge
        // Vertices are provided by polygon.vertices
        const vertices = polygon.vertices;
        if (!vertices || vertices.length <= this.edgeIndex) return;

        const startV = vertices[this.edgeIndex];
        const endV = vertices[(this.edgeIndex + 1) % vertices.length];

        // Interpolate to find paddle center in world space (relative to center)
        // Actually, we want the paddle *segment*
        // Vector along the edge
        const edgeX = endV.x - startV.x;
        const edgeY = endV.y - startV.y;

        const paddleStartX = startV.x + edgeX * (this.position - this.width / 2);
        const paddleStartY = startV.y + edgeY * (this.position - this.width / 2);

        const paddleEndX = startV.x + edgeX * (this.position + this.width / 2);
        const paddleEndY = startV.y + edgeY * (this.position + this.width / 2);

        ctx.beginPath();
        ctx.moveTo(centerX + paddleStartX, centerY + paddleStartY);
        ctx.lineTo(centerX + paddleEndX, centerY + paddleEndY);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.closePath();
    }
}
