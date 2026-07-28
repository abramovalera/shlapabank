import { useMemo } from "react";

/**
 * Декоративный фон для страниц авторизации:
 *  - Анимированный градиент (см. .animated-bg в globals.css)
 *  - Парящие звёзды, поднимающиеся снизу вверх с золотым свечением
 * Всё через CSS, без библиотек.
 */

interface Particle {
  left: string;
  size: number;
  duration: number;
  delay: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }).map(() => ({
    left: `${Math.floor(Math.random() * 100)}%`,
    size: 2 + Math.random() * 3,
    duration: 10 + Math.random() * 15,
    delay: -Math.random() * 20,
  }));
}

export function StarField() {
  // Мемо: чтобы позиции звёзд не пересчитывались при ре-рендере.
  const particles = useMemo(() => makeParticles(35), []);

  return (
    <>
      <div className="animated-bg" aria-hidden="true" />
      <div className="particles-layer" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="particle-star"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}
