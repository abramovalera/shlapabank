import { useState, useMemo, useEffect } from "react";
import { Modal } from "@/shared/ui/Modal";
import { Select } from "@/shared/ui/Select";
import { BankCard, DESIGN_GRADIENTS, DESIGNS_FOR_TYPE } from "./BankCard";
import { useIssueCard } from "./api";
import { Account, CardDesign } from "@/shared/api/types";
import { formatMoney } from "@/shared/lib/format";

type PickableType = "REGULAR" | "GOLD";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId?: number;
  /**
   * Если true — счёт нельзя менять (используется когда модалка открыта
   * после создания нового счёта или из контекста конкретного счёта).
   */
  lockAccount?: boolean;
  /** Текст успешного onClose — например когда выпуск карты — часть флоу открытия счёта. */
  submitLabel?: string;
}


export function IssueCardModal({
  open,
  onClose,
  accounts,
  defaultAccountId,
  lockAccount = false,
  submitLabel,
}: Props) {
  const eligibleAccounts = useMemo(
    // Карту выпускаем только к дебетовым (соответствует бэк-модели).
    () => accounts.filter((a) => a.account_type === "DEBIT"),
    [accounts]
  );

  const [cardType, setCardType] = useState<PickableType>("REGULAR");
  const availableDesigns = DESIGNS_FOR_TYPE[cardType];
  const [design, setDesign] = useState<CardDesign>(availableDesigns[0]);

  // Если сменили тип — сбрасываем дизайн на первый доступный для нового типа
  useEffect(() => {
    if (!availableDesigns.includes(design)) {
      setDesign(availableDesigns[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType]);
  const [accountId, setAccountId] = useState<number | null>(
    defaultAccountId ?? eligibleAccounts[0]?.id ?? null
  );

  // Синхронизируем выбор счёта, если родитель сменил defaultAccountId (новый счёт).
  useEffect(() => {
    if (defaultAccountId !== undefined) {
      setAccountId(defaultAccountId);
    }
  }, [defaultAccountId]);

  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = useIssueCard();

  const account = eligibleAccounts.find((a) => a.id === accountId);
  const previewSystem = account?.currency === "RUB" ? "MIR" : "VISA";

  function reset() {
    setError(null);
    setAgree(false);
    setCardType("REGULAR");
    setDesign("CLASSIC");
  }

  async function onSubmit() {
    setError(null);
    if (!accountId) return setError("Выберите счёт");
    if (!agree) return setError("Нужно принять условия обслуживания");
    try {
      await issue.mutateAsync({
        account_id: accountId,
        card_type: cardType,
        design,
        // payment_system подберётся на бэке по валюте счёта
        accept_terms: true,
      } as any);
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось выпустить карту");
    }
  }

  if (eligibleAccounts.length === 0 && open) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Открыть карту"
        subtitle="Сначала нужен дебетовый счёт — карта выпускается к нему"
        testId="issue-card-modal"
      >
        <div className="text-sm text-ink-secondary py-6 text-center">
          У вас нет дебетовых счетов. Откройте счёт, и после этого можно будет выпустить карту.
        </div>
        <button className="btn w-full" onClick={onClose}>
          Понятно
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Открыть карту"
      subtitle="Выберите тип карты и оформление"
      testId="issue-card-modal"
    >
      <div className="flex justify-center mb-4">
        <BankCard
          design={design}
          cardType={cardType}
          paymentSystem={previewSystem}
          expiryLabel="••/••"
        />
      </div>

      <Label>Тип карты</Label>
      <div className="grid grid-cols-2 gap-1.5 mb-3.5">
        <TypeCard
          active={cardType === "REGULAR"}
          onClick={() => setCardType("REGULAR")}
          title="Обычная"
          hint="Базовые цвета, без комиссии"
          testId="card-type-REGULAR"
        />
        <TypeCard
          active={cardType === "GOLD"}
          onClick={() => setCardType("GOLD")}
          title="Gold"
          hint="Премиум-дизайны с золотом"
          testId="card-type-GOLD"
        />
      </div>

      <Label>Дизайн карты</Label>
      <div
        className={`grid gap-1.5 mb-3.5 ${
          availableDesigns.length === 3 ? "grid-cols-3" : "grid-cols-4"
        }`}
        data-testid="card-design-picker"
      >
        {availableDesigns.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDesign(d)}
            className={`h-12 rounded-control transition relative overflow-hidden ${
              design === d
                ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2"
                : "border border-line"
            }`}
            style={{ background: DESIGN_GRADIENTS[d] }}
            aria-label={`Дизайн ${d}`}
            data-testid={`card-design-${d}`}
          />
        ))}
      </div>

      <Label required>Привязать к счёту</Label>
      {lockAccount && account ? (
        <div
          className="mb-1.5 rounded-control bg-brand-soft border border-brand/30 px-3 py-2.5 flex items-center gap-3"
          data-testid="issue-card-account-locked"
        >
          <i className="ti ti-lock text-accent text-base" aria-hidden="true"></i>
          <div className="flex-1">
            <div className="text-[13px] font-medium">
              {account.name} · •••• {account.account_number.slice(-4)}
            </div>
            <div className="text-[11px] text-ink-muted">
              {account.currency} · {formatMoney(account.balance, account.currency)}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-1.5">
          <Select
            value={accountId}
            onChange={setAccountId}
            options={eligibleAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.currency}`,
              hint: `•••• ${a.account_number.slice(-4)} · ${formatMoney(a.balance, a.currency)}`,
            }))}
            placeholder="Выберите счёт"
            testId="issue-card-account-select"
          />
        </div>
      )}
      <div className="text-[10px] text-ink-muted mb-3.5">
        {lockAccount
          ? "Карта будет выпущена к этому счёту"
          : "Платёжная система: RUB → MIR, USD/EUR/CNY → VISA"}
      </div>

      <label
        className="flex items-start gap-2 text-xs text-ink-secondary mb-3.5 cursor-pointer select-none"
        data-testid="issue-card-terms-label"
      >
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-0.5"
          data-testid="issue-card-terms-checkbox"
        />
        <span>
          Согласен с <a className="text-accent">условиями обслуживания карт</a> и тарифами
        </span>
      </label>

      {error && (
        <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose} data-testid="issue-card-cancel-btn">
          Отмена
        </button>
        <button
          className="btn-primary flex-[1.4]"
          onClick={onSubmit}
          disabled={!agree || !accountId || issue.isPending}
          data-testid="issue-card-submit-btn"
        >
          {issue.isPending ? "Выпускаем…" : submitLabel ?? "Выпустить карту"}
        </button>
      </div>
    </Modal>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="text-xs text-ink-secondary mb-1.5">
      {children} {required && <span className="text-danger">*</span>}
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  title,
  hint,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`text-left p-2.5 rounded-control transition border ${
        active
          ? "border-brand bg-brand-soft text-accent"
          : "border-line hover:border-line-strong"
      }`}
    >
      <div className={`text-[13px] font-medium ${active ? "text-accent" : ""}`}>{title}</div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-ink-secondary" : "text-ink-muted"}`}>
        {hint}
      </div>
    </button>
  );
}
