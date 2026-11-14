
interface ParticlePosition {
    x: number;
    y: number;
}

interface ParticleConfig {
    spring: number;
}

interface CanvasSettings {
    friction: number;
    trails: number;
    size: number;
    dampening: number;
    tension: number;
}

class ParticleNode {
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
}

const settings: CanvasSettings = {
    friction: 0.5,
    trails: 80,
    size: 50,
    dampening: 0.025,
    tension: 0.99,
};

const position: ParticlePosition = { x: 0, y: 0 };
let lines: TrailLine[] = [];
let context: CanvasRenderingContext2D | null = null;
let animationFrame = 0;
let isRunning = false;

class TrailLine {
    spring: number;
    friction: number;
    nodes: ParticleNode[];

    constructor(config: ParticleConfig) {
        this.spring = config.spring + 0.1 * Math.random() - 0.05;
        this.friction = settings.friction + 0.01 * Math.random() - 0.005;
        this.nodes = [];

        for (let i = 0; i < settings.size; i++) {
            const node = new ParticleNode();
            node.x = position.x;
            node.y = position.y;
            this.nodes.push(node);
        }
    }

    update(): void {
        let spring = this.spring;
        const firstNode = this.nodes[0];

        if (!firstNode) return;

        firstNode.vx += (position.x - firstNode.x) * spring;
        firstNode.vy += (position.y - firstNode.y) * spring;

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const previousNode = this.nodes[i - 1];

            if (i > 0 && previousNode) {
                node.vx += (previousNode.x - node.x) * spring;
                node.vy += (previousNode.y - node.y) * spring;
                node.vx += previousNode.vx * settings.dampening;
                node.vy += previousNode.vy * settings.dampening;
            }

            node.vx *= this.friction;
            node.vy *= this.friction;
            node.x += node.vx;
            node.y += node.vy;

            spring *= settings.tension;
        }
    }

    draw(): void {
        if (!context || this.nodes.length < 2) return;

        let x = this.nodes[0].x;
        let y = this.nodes[0].y;

        context.beginPath();
        context.moveTo(x, y);

        for (let i = 1; i < this.nodes.length - 1; i++) {
            const current = this.nodes[i];
            const next = this.nodes[i + 1];

            x = 0.5 * (current.x + next.x);
            y = 0.5 * (current.y + next.y);

            context.quadraticCurveTo(current.x, current.y, x, y);
        }

        const secondLast = this.nodes[this.nodes.length - 2];
        const last = this.nodes[this.nodes.length - 1];

        context.quadraticCurveTo(
            secondLast.x,
            secondLast.y,
            last.x,
            last.y
        );

        context.stroke();
        context.closePath();
    }
}

function createLines(): void {
    lines = [];

    for (let i = 0; i < settings.trails; i++) {
        lines.push(
            new TrailLine({
                spring: 0.45 + (i / settings.trails) * 0.025,
            })
        );
    }
}

function updatePosition(x: number, y: number): void {
    position.x = x;
    position.y = y;
}

function handleMouseMove(event: MouseEvent): void {
    updatePosition(event.clientX, event.clientY);
}

function handleTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];

    if (!touch) return;

    event.preventDefault();
    updatePosition(touch.pageX, touch.pageY);
}

function handleMouseStart(event: MouseEvent): void {
    updatePosition(event.clientX, event.clientY);
    createLines();

    document.removeEventListener("mousemove", handleMouseStart);
    document.addEventListener("mousemove", handleMouseMove);
    startAnimation();
}

function handleTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];

    if (!touch) return;

    updatePosition(touch.pageX, touch.pageY);
    createLines();

    document.removeEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove, {
        passive: false,
    });

    startAnimation();
}

function render(): void {
    if (!context || !isRunning) return;

    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);

    context.globalCompositeOperation = "lighter";
    context.strokeStyle = "hsla(220, 20%, 50%, 0.05)";
    context.lineWidth = 10;

    for (const line of lines) {
        line.update();
        line.draw();
    }

    animationFrame = window.requestAnimationFrame(render);
}

function startAnimation(): void {
    if (isRunning || !context) return;

    isRunning = true;
    render();
}

function stopAnimation(): void {
    isRunning = false;
    window.cancelAnimationFrame(animationFrame);
}

function resizeCanvas(): void {
    if (!context) return;

    context.canvas.width = window.innerWidth - 20;
    context.canvas.height = window.innerHeight;
}

export const renderCanvas = function (): (() => void) | undefined {
    const canvas = document.getElementById("canvas");

    if (!(canvas instanceof HTMLCanvasElement)) {
        console.error("Canvas element with id 'canvas' was not found.");
        return;
    }

    context = canvas.getContext("2d");

    if (!context) {
        console.error("Unable to get canvas 2D context.");
        return;
    }

    isRunning = false;
    lines = [];

    document.addEventListener("mousemove", handleMouseStart);
    document.addEventListener("touchstart", handleTouchStart);

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("focus", startAnimation);
    window.addEventListener("blur", stopAnimation);

    document.body.addEventListener("orientationchange", resizeCanvas);

    resizeCanvas();

    return () => {
        stopAnimation();

        document.removeEventListener("mousemove", handleMouseStart);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("touchstart", handleTouchStart);
        document.removeEventListener("touchmove", handleTouchMove);

        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("focus", startAnimation);
        window.removeEventListener("blur", stopAnimation);

        document.body.removeEventListener("orientationchange", resizeCanvas);

        lines = [];
        context = null;
    };
};
