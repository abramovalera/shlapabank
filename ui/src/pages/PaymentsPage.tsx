const CATEGORIES = [
  { icon: "bolt", label: "ЖКХ", color: "text-warning" },
  { icon: "device-mobile", label: "Мобильная связь", color: "text-accent" },
  { icon: "wifi", label: "Интернет", color: "text-success" },
  { icon: "tv", label: "ТВ", color: "text-ink-secondary" },
  { icon: "school", label: "Образование", color: "text-accent" },
  { icon: "car", label: "Транспорт", color: "text-warning" },
  { icon: "building-bank", label: "Налоги, штрафы", color: "text-ink-secondary" },
  { icon: "heart", label: "Благотворительность", color: "text-ink-secondary" },
];

export function PaymentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Платежи</h1>

      <div className="flex items-center gap-2 bg-surface-2 rounded-control border border-line px-3 py-2">
        <i className="ti ti-search text-base text-ink-muted" aria-hidden="true"></i>
        <input
          className="border-none bg-transparent flex-1 outline-none text-sm placeholder:text-ink-muted"
          placeholder="Организация, ИНН, услуга…"
          data-testid="payments-search-input"
        />
      </div>

      <section>
        <div className="text-[13px] font-medium mb-2">Категории</div>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              className="card flex flex-col items-center gap-1.5 hover:bg-surface-1"
              data-testid={`category-${c.label}`}
            >
              <i className={`ti ti-${c.icon} text-xl ${c.color}`} aria-hidden="true"></i>
              <div className="text-[11px] text-center">{c.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[13px] font-medium mb-2">Последние платежи</div>
        <div className="card text-ink-secondary text-sm text-center py-6">
          История платежей появится после первой оплаты.
        </div>
      </section>
    </div>
  );
}
