import { useEffect, useRef } from "react";

/**
 * Летающая золотая частица с плавно исчезающим следом.
 * Живёт как глобальный фоновый эффект — рендерится один раз в корне приложения,
 * canvas на весь viewport, position: fixed, pointer-events: none.
 */
export function Trail({ opacity = 0.9 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frameId = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const particle = {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 5,
      speedX: (Math.random() - 0.5) * 2.5 || 1.2,
      speedY: (Math.random() - 0.5) * 2.5 || 1.2,
    };
    const trail: { x: number; y: number }[] = [];
    const TRAIL_LEN = 40;

    const gold = (a: number) => `rgba(245, 158, 11, ${a})`;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      particle.x += particle.speedX;
      particle.y += particle.speedY;
      if (particle.x > width || particle.x < 0) particle.speedX *= -1;
      if (particle.y > height || particle.y < 0) particle.speedY *= -1;

      trail.unshift({ x: particle.x, y: particle.y });
      if (trail.length > TRAIL_LEN) trail.pop();

      for (let i = 0; i < trail.length; i++) {
        const t = 1 - i / trail.length;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, particle.radius * t * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = gold(t * 0.7 * opacity);
        ctx.fill();
        if (i === 0) {
          ctx.shadowColor = gold(0.4 * opacity);
          ctx.shadowBlur = 25;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Голова
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = gold(opacity);
      ctx.shadowColor = gold(0.6 * opacity);
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;

      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [opacity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
}
