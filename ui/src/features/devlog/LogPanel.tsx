import { useEffect, useMemo, useState } from "react";
import { useLogStore, LogEntry } from "./logStore";
import { useFlags } from "@/features/flags/api";

/**
 * Плавающая панель логов (dev-инструмент). Показывает клиентские запросы/ответы
 * с редакцией секретов, correlation-хеш пачки и уникальный хеш запроса.
 * Переключается кнопкой снизу-справа или Alt+L. Гейтится флагом dev_trace_enabled.
 */
export function LogPanel() {
  const { data: flags } = useFlags();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);

  const entries = useLogStore((s) => s.entries);
  const paused = useLogStore((s) => s.paused);
  const setPaused = useLogStore((s) => s.setPaused);
  const clear = useLogStore((s) => s.clear);
  const correlationId = useLogStore((s) => s.correlationId);
  const newCorrelation = useLogStore((s) => s.newCorrelation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (onlyErrors ? !e.ok : true))
      .filter((e) => {
        if (!q) return true;
        const hay = [
          e.method,
          e.url,
          String(e.status ?? ""),
          e.id,
          e.correlationId,
          e.error ?? "",
          safeStr(e.requestBody),
          safeStr(e.responseBody),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .reverse(); // новые сверху
  }, [entries, query, onlyErrors]);

  const errorCount = entries.filter((e) => !e.ok).length;

  if (!flags?.dev_trace_enabled) return null;

  return (
    <>
      {/* Кнопка-переключатель */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Логи запросов (Alt+L)"
        className="fixed bottom-4 right-4 z-[200] w-11 h-11 rounded-full bg-surface-2 border border-line shadow-lg flex items-center justify-center hover:border-brand transition"
      >
        <i className="ti ti-terminal-2 text-lg" aria-hidden="true"></i>
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
            {errorCount > 99 ? "99+" : errorCount}
          </span>
        )}
      </button>

      {!open ? null : (
        <div className="fixed inset-x-0 bottom-0 z-[199] h-[42vh] min-h-[240px] bg-surface-0/95 backdrop-blur-md border-t border-line-strong flex flex-col shadow-2xl">
          {/* Тулбар */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line text-[12px] flex-wrap">
            <span className="font-medium flex items-center gap-1.5">
              <i className="ti ti-terminal-2" aria-hidden="true"></i>
              Логи
            </span>
            <span className="text-ink-muted">{filtered.length}/{entries.length}</span>

            <span className="ml-2 flex items-center gap-1">
              <span className="text-ink-muted">цепочка</span>
              <code
                className="px-1.5 py-0.5 rounded bg-fill-control font-mono text-[11px] cursor-pointer hover:text-accent"
                title="Кликните, чтобы отфильтровать по текущей цепочке"
                onClick={() => setQuery(correlationId)}
              >
                {correlationId.slice(0, 8)}
              </code>
              <button
                type="button"
                onClick={() => newCorrelation()}
                className="text-ink-muted hover:text-accent"
                title="Новая цепочка (сбросить correlation-хеш)"
              >
                <i className="ti ti-refresh" aria-hidden="true"></i>
              </button>
            </span>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: путь, статус, id, тело…"
              className="flex-1 min-w-[160px] bg-surface-1 border border-line rounded-control px-2.5 py-1 outline-none focus:border-brand"
            />

            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
              только ошибки
            </label>

            <button
              type="button"
              onClick={() => setPaused(!paused)}
              className={`px-2 py-1 rounded-control border ${paused ? "border-warning text-warning" : "border-line text-ink-secondary"}`}
              title={paused ? "Возобновить запись" : "Пауза записи"}
            >
              <i className={`ti ${paused ? "ti-player-play" : "ti-player-pause"}`} aria-hidden="true"></i>
            </button>
            <button
              type="button"
              onClick={() => clear()}
              className="px-2 py-1 rounded-control border border-line text-ink-secondary hover:text-danger"
              title="Очистить журнал"
            >
              <i className="ti ti-trash" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 rounded-control border border-line text-ink-secondary"
              title="Закрыть (Alt+L)"
            >
              <i className="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>

          {/* Список */}
          <div className="flex-1 overflow-y-auto font-mono text-[12px]">
            {filtered.length === 0 ? (
              <div className="text-ink-muted text-center py-8">Пусто. Сделайте запрос — он появится здесь.</div>
            ) : (
              filtered.map((e) => <Row key={e.id} e={e} onPickCorrelation={() => setQuery(e.correlationId)} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ e, onPickCorrelation }: { e: LogEntry; onPickCorrelation: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-line/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-fill-hover"
      >
        <i className={`ti ti-chevron-${expanded ? "down" : "right"} text-ink-muted`} aria-hidden="true"></i>
        <span className="text-ink-muted tabular-nums">{fmtTime(e.ts)}</span>
        <span className="w-14 shrink-0 font-medium">{e.method}</span>
        <StatusBadge entry={e} />
        <span className="w-16 shrink-0 text-right text-ink-muted tabular-nums">
          {e.durationMs != null ? `${e.durationMs}ms` : "—"}
        </span>
        <span className="flex-1 truncate">{shortPath(e.url)}</span>
        <code
          className="hidden sm:inline text-[10px] text-ink-muted hover:text-accent"
          title="Фильтр по этой цепочке"
          onClick={(ev) => {
            ev.stopPropagation();
            onPickCorrelation();
          }}
        >
          {e.correlationId.slice(0, 6)}
        </code>
        <code className="hidden md:inline text-[10px] text-ink-muted" title="ID запроса">
          {e.id.slice(0, 6)}
        </code>
      </button>
      {expanded && (
        <div className="px-3 pb-3 grid md:grid-cols-2 gap-3 text-[11px]">
          <div className="min-w-0">
            <div className="text-ink-muted mb-1">Запрос · {e.method} {e.url}</div>
            <Json data={e.requestBody} empty="нет тела" />
          </div>
          <div className="min-w-0">
            <div className="text-ink-muted mb-1">
              Ответ · {e.status ?? "—"} {e.error ? `· ${e.error}` : ""}
            </div>
            <Json data={e.responseBody} empty={e.error ? "нет тела (сетевая ошибка)" : "нет тела"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Json({ data, empty }: { data: unknown; empty: string }) {
  if (data === undefined) return <div className="text-ink-muted italic">{empty}</div>;
  return (
    <pre className="bg-surface-1 border border-line rounded-control p-2 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap break-words">
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function StatusBadge({ entry }: { entry: LogEntry }) {
  const { status, ok } = entry;
  let cls = "bg-fill-control text-ink-secondary";
  if (status == null) cls = "bg-danger-soft text-danger";
  else if (status >= 500) cls = "bg-danger-soft text-danger";
  else if (status >= 400) cls = "bg-warning-soft text-warning";
  else if (ok) cls = "bg-success-soft text-success";
  return (
    <span className={`w-10 shrink-0 text-center rounded px-1 ${cls}`}>{status ?? "ERR"}</span>
  );
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

function shortPath(url: string): string {
  return url.replace(/^\/api\/v1/, "").replace(/^https?:\/\/[^/]+/, "") || url;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
