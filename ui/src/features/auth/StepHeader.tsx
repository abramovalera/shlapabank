interface Props {
  total: number;
  active: number;
  onBack?: () => void;
}

/** Шапка шагового мастера: стрелка «назад» + точки-прогресс. */
export function StepHeader({ total, active, onBack }: Props) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <button
        onClick={onBack}
        disabled={!onBack}
        aria-label="Назад"
        className="text-ink-secondary hover:text-ink-primary disabled:opacity-30 disabled:cursor-default transition"
      >
        <i className="ti ti-arrow-left text-lg" aria-hidden="true"></i>
      </button>
      <div className="flex-1 flex justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-pill transition-all ${
              i === active ? "w-6 bg-brand-strong" : i < active ? "w-6 bg-brand-strong/50" : "w-6 bg-line-strong"
            }`}
          />
        ))}
      </div>
      <div style={{ width: 24 }} />
    </div>
  );
}
