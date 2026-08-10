interface Promo {
  title: string;
  bg: string;
  pattern: "cards" | "lock" | "waves" | "sparkle" | "flower" | "filter";
  color: string;
  textColor: string;
}

// Декоративные плитки — не кликаются, только визуал.
// При наведении оживают: цветок распускается, волны бегут, искры вспыхивают и т.д.
const PROMOS: Promo[] = [
  { title: "Новые вклады",       bg: "linear-gradient(135deg, #5B6BFF 0%, #3D4ACC 100%)", pattern: "cards",   color: "rgba(255,255,255,0.85)", textColor: "#fff" },
  { title: "Данные под защитой", bg: "linear-gradient(135deg, #1E2029 0%, #2A2D38 100%)", pattern: "lock",    color: "rgba(255,255,255,0.75)", textColor: "#fff" },
  { title: "Проведите лето ярко", bg: "linear-gradient(135deg, #3DD7E5 0%, #1AA5B3 100%)", pattern: "waves",   color: "rgba(10,11,15,0.6)",     textColor: "#0A0B0F" },
  { title: "ShlapaCash+",        bg: "linear-gradient(135deg, #2BE08C 0%, #1AA063 100%)", pattern: "sparkle", color: "rgba(10,11,15,0.6)",     textColor: "#0A0B0F" },
  { title: "Партнёры июля",      bg: "linear-gradient(135deg, #F5D547 0%, #C9AC1F 100%)", pattern: "flower",  color: "rgba(10,11,15,0.55)",    textColor: "#0A0B0F" },
  { title: "Фильтры истории",    bg: "linear-gradient(135deg, #FF3A5C 0%, #A32242 100%)", pattern: "filter",  color: "rgba(255,255,255,0.85)", textColor: "#fff" },
];

/**
 * Горизонтальный «рулет» из промо-плиток. Плитки декоративные (aria-hidden),
 * при наведении оживают через CSS.
 */
export function PromoCarousel() {
  return (
    <div
      className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 relative"
      style={{ zIndex: 1 }}
      aria-label="Промо-подборка"
    >
      {PROMOS.map((p, i) => (
        <PromoTile key={i} promo={p} />
      ))}

      {/* Локальные keyframes для hover-анимаций плиток */}
      <style>{`
        .promo-tile { transition: transform 0.35s ease, box-shadow 0.35s ease; }
        .promo-tile:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.4); }

        /* Cards: карты разъезжаются */
        .promo-tile .p-card-a, .promo-tile .p-card-b { transition: transform 0.5s cubic-bezier(.4,.2,.2,1); transform-origin: center; }
        .promo-tile:hover .p-card-a { transform: rotate(-14deg) translate(-6px, -2px); }
        .promo-tile:hover .p-card-b { transform: rotate(12deg) translate(6px, 2px); }

        /* Lock: замочек «покачивается» */
        .promo-tile .p-lock { transform-origin: 66px 90px; transition: transform 0.4s ease; }
        .promo-tile:hover .p-lock { transform: rotate(-6deg) scale(1.05); }

        /* Waves: волны сдвигаются влево */
        .promo-tile .p-wave { transition: transform 0.9s ease-in-out; transform-origin: center; }
        .promo-tile:hover .p-wave-1 { transform: translateX(-8px); }
        .promo-tile:hover .p-wave-2 { transform: translateX(8px); }

        /* Sparkle: точки пульсируют */
        .promo-tile .p-sparkle { transition: transform 0.4s ease, opacity 0.4s ease; }
        .promo-tile:hover .p-sparkle { transform: scale(1.6); opacity: 1; }

        /* Flower: цветок распускается + вращается */
        .promo-tile .p-flower { transition: transform 0.6s cubic-bezier(.4,.2,.2,1); transform-origin: 66px 66px; }
        .promo-tile:hover .p-flower { transform: rotate(30deg) scale(1.15); }
        .promo-tile .p-flower-center { transition: transform 0.6s ease; transform-origin: 66px 66px; }
        .promo-tile:hover .p-flower-center { transform: scale(1.35); }

        /* Filter: столбики оживают */
        .promo-tile .p-bar { transition: transform 0.5s cubic-bezier(.4,.2,.2,1); transform-origin: bottom center; }
        .promo-tile:hover .p-bar-1 { transform: scaleY(1.15); }
        .promo-tile:hover .p-bar-2 { transform: scaleY(0.85); }
        .promo-tile:hover .p-bar-3 { transform: scaleY(1.25); }
      `}</style>
    </div>
  );
}

function PromoTile({ promo }: { promo: Promo }) {
  return (
    <div
      className="promo-tile shrink-0 rounded-card overflow-hidden relative border border-line"
      style={{ width: 132, height: 132, background: promo.bg }}
      aria-hidden="true"
    >
      <PromoPattern kind={promo.pattern} color={promo.color} />
      <div
        className="absolute left-3 bottom-3 right-3 text-[13px] font-medium leading-tight"
        style={{ color: promo.textColor }}
      >
        {promo.title}
      </div>
    </div>
  );
}

function PromoPattern({ kind, color }: { kind: Promo["pattern"]; color: string }) {
  const common = "absolute inset-0 w-full h-full";
  switch (kind) {
    case "cards":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none">
          <rect className="p-card-a" x="18" y="22" width="70" height="44" rx="7" transform="rotate(-8 53 44)" fill={color} opacity="0.35" />
          <rect className="p-card-b" x="34" y="30" width="70" height="44" rx="7" transform="rotate(6 69 52)" fill={color} opacity="0.6" />
        </svg>
      );
    case "lock":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none">
          <g className="p-lock">
            <rect x="42" y="52" width="48" height="40" rx="8" fill={color} opacity="0.85" />
            <path d="M52 52v-8a14 14 0 1 1 28 0v8" stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" />
            <circle cx="66" cy="72" r="4" fill="#0A0B0F" />
          </g>
        </svg>
      );
    case "waves":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none" preserveAspectRatio="none">
          <path className="p-wave p-wave-1" d="M0 70 Q33 50 66 70 T132 70 V132 H0 Z" fill={color} opacity="0.35" />
          <path className="p-wave p-wave-2" d="M0 88 Q33 68 66 88 T132 88 V132 H0 Z" fill={color} opacity="0.55" />
        </svg>
      );
    case "sparkle":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none">
          {[
            [40, 45, 4],
            [90, 40, 6],
            [72, 70, 3],
            [50, 88, 5],
            [95, 90, 4],
          ].map(([cx, cy, r], i) => (
            <circle
              key={i}
              className="p-sparkle"
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              opacity={0.5 + (i % 3) * 0.15}
              style={{ transformOrigin: `${cx}px ${cy}px`, transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </svg>
      );
    case "flower":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none">
          <g className="p-flower">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse
                key={a}
                cx={66}
                cy={40}
                rx={12}
                ry={22}
                fill={color}
                opacity="0.6"
                transform={`rotate(${a} 66 66)`}
              />
            ))}
          </g>
          <circle className="p-flower-center" cx="66" cy="66" r="10" fill={color} />
        </svg>
      );
    case "filter":
      return (
        <svg className={common} viewBox="0 0 132 132" fill="none">
          <rect className="p-bar p-bar-1" x="20" y="25" width="30" height="82" fill={color} opacity="0.55" />
          <rect className="p-bar p-bar-2" x="55" y="45" width="30" height="62" fill={color} opacity="0.75" />
          <rect className="p-bar p-bar-3" x="90" y="35" width="25" height="72" fill={color} opacity="0.4" />
        </svg>
      );
  }
}
