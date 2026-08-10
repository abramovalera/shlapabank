import {
  useChaosConfig,
  useSetChaos,
  useBugsConfig,
  useSetBugs,
  downloadBugsReport,
} from "@/features/admin/api";
import { useState } from "react";

/** Админ-панель: тумблеры «реализма» стенда — искусственные задержки API и
 *  режим намеренных багов («найди баг»). Оба по умолчанию управляются флагами
 *  бэкенда; переключаются в рантайме. */
export function AdminPage() {
  const { data: cfg, isLoading, isError } = useChaosConfig();
  const setChaos = useSetChaos();

  const enabled = cfg?.enabled ?? false;

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div>
        <h1 className="text-[20px] font-semibold">Админ-панель</h1>
        <p className="text-[13px] text-ink-secondary mt-1">
          Служебные настройки стенда. Доступно только администраторам.
        </p>
      </div>

      <section className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium flex items-center gap-2">
              <i className="ti ti-clock-pause text-accent" aria-hidden="true"></i>
              Искусственные задержки API
            </div>
            <p className="text-[12px] text-ink-secondary mt-1">
              Сервер начинает отвечать не мгновенно, а с рандомной задержкой (иногда
              заметно дольше обычного) — чтобы автотесты ждали по состоянию, а не
              мгновенно. Ошибок и падений не вносится, только задержки.
            </p>
          </div>
          <Toggle
            checked={enabled}
            disabled={isLoading || setChaos.isPending}
            onChange={(v) => setChaos.mutate(v)}
          />
        </div>

        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <StatusPill enabled={enabled} pending={setChaos.isPending} />
          {isError && (
            <span className="text-danger">Не удалось загрузить статус</span>
          )}
          {setChaos.isError && (
            <span className="text-danger">Не удалось переключить</span>
          )}
        </div>

        {cfg && (
          <div className="mt-4 pt-4 border-t border-line">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
              Профиль задержек (read-only)
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
              <Row label="База, все запросы" value={`${cfg.base_min_ms}–${cfg.base_max_ms} мс`} />
              <Row label="Тяжёлые операции" value={`+${cfg.heavy_min_ms}–${cfg.heavy_max_ms} мс`} />
              <Row label="«Толстый хвост»" value={`${Math.round(cfg.tail_probability * 100)}%`} />
              <Row label="Хвост, задержка" value={`+${cfg.tail_min_ms}–${cfg.tail_max_ms} мс`} />
            </dl>
          </div>
        )}
      </section>

      <BugsSection />
    </div>
  );
}

function BugsSection() {
  const { data: cfg, isLoading, isError } = useBugsConfig();
  const setBugs = useSetBugs();
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const enabled = cfg?.enabled ?? false;

  async function onDownload() {
    setDownloadError(false);
    setDownloading(true);
    try {
      await downloadBugsReport();
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[15px] font-medium flex items-center gap-2">
            <i className="ti ti-bug text-danger" aria-hidden="true"></i>
            Режим багов («найди баг»)
          </div>
          <p className="text-[12px] text-ink-secondary mt-1">
            Включает набор из {cfg?.count ?? 10} намеренных дефектов на бэке, фронте, их
            стыке, в БД и текстах — для автотестов и ручного тестирования. При выключенном
            тумблере приложение работает корректно.
          </p>
        </div>
        <Toggle
          checked={enabled}
          disabled={isLoading || setBugs.isPending}
          onChange={(v) => setBugs.mutate(v)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        {setBugs.isPending ? (
          <span className="text-ink-muted">Применяем…</span>
        ) : enabled ? (
          <span className="badge bg-danger-soft text-danger border border-danger/30">
            <i className="ti ti-bug text-[13px]" aria-hidden="true"></i>
            Баги включены ({cfg?.count})
          </span>
        ) : (
          <span className="badge bg-fill-control text-ink-secondary">
            <i className="ti ti-check text-[13px]" aria-hidden="true"></i>
            Баги выключены
          </span>
        )}
        {isError && <span className="text-danger">Не удалось загрузить статус</span>}
        {setBugs.isError && <span className="text-danger">Не удалось переключить</span>}
      </div>

      <div className="mt-4 pt-4 border-t border-line flex items-center gap-3">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="btn flex items-center gap-2 disabled:opacity-50"
        >
          <i className="ti ti-download" aria-hidden="true"></i>
          {downloading ? "Готовим…" : "Скачать описание багов (.md)"}
        </button>
        <span className="text-[11px] text-ink-muted">Список дефектов и как их ловить — «ключ ответов».</span>
        {downloadError && <span className="text-[12px] text-danger">Ошибка скачивания</span>}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-ink-primary font-mono text-right">{value}</dd>
    </>
  );
}

function StatusPill({ enabled, pending }: { enabled: boolean; pending: boolean }) {
  if (pending) return <span className="text-ink-muted">Применяем…</span>;
  return enabled ? (
    <span className="badge bg-warning-soft text-warning border border-warning/30">
      <i className="ti ti-bolt text-[13px]" aria-hidden="true"></i>
      Задержки включены
    </span>
  ) : (
    <span className="badge bg-fill-control text-ink-secondary">
      <i className="ti ti-check text-[13px]" aria-hidden="true"></i>
      Задержки выключены
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Искусственные задержки API"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full flex items-center transition p-0.5 shrink-0 disabled:opacity-50 disabled:cursor-wait ${
        checked ? "bg-brand justify-end" : "bg-fill-control justify-start"
      }`}
    >
      <div className="w-5 h-5 rounded-full bg-white shadow" />
    </button>
  );
}
