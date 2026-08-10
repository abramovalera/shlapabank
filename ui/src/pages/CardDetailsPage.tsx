import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card, CardReveal, Transaction } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";
import { BankCard } from "@/features/cards/BankCard";
import { BlockCardModal } from "@/features/cards/BlockCardModal";
import { CloseCardModal } from "@/features/cards/CloseCardModal";
import { ChangeDesignModal } from "@/features/cards/ChangeDesignModal";
import { LimitsModal } from "@/features/cards/LimitsModal";
import { ReissueCardModal } from "@/features/cards/ReissueCardModal";
import { formatMoney, formatRelativeDate, formatTime } from "@/shared/lib/format";

export function CardDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const cardId = parseInt(id ?? "0", 10);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: allTx = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async (): Promise<Transaction[]> => (await api.get("/transactions")).data,
  });

  const card = cards.find((c) => c.id === cardId);
  const account = card ? accounts.find((a) => a.id === card.account_id) : undefined;
  const cardTx = allTx.filter((t) => t.card_id === cardId);

  const [reveal, setReveal] = useState<CardReveal | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [showCvv, setShowCvv] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);

  const toggleBlock = useMutation({
    mutationFn: async () => {
      if (!card) return;
      const nextStatus = card.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
      return api.patch(`/cards/${card.id}`, { status: nextStatus });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards"] }),
  });

  const closeCard = useMutation({
    mutationFn: async () => api.delete(`/cards/${cardId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      navigate("/cards");
    },
  });

  async function loadReveal() {
    if (reveal) {
      setReveal(null);
      setShowCvv(false);
      return;
    }
    setRevealError(null);
    setRevealLoading(true);
    try {
      const { data } = await api.get<CardReveal>(`/cards/${cardId}/reveal`);
      setReveal(data);
    } catch {
      setRevealError("Не удалось загрузить номер карты. Попробуйте ещё раз.");
    } finally {
      setRevealLoading(false);
    }
  }

  if (cards.length && !card) {
    return (
      <div className="card text-center py-10">
        <div className="text-ink-secondary">Карта не найдена</div>
        <Link to="/cards" className="text-accent mt-3 inline-block">
          Все карты →
        </Link>
      </div>
    );
  }
  if (!card) {
    return <div className="card text-center py-10 text-ink-muted">Загружаем…</div>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-[13px] text-ink-secondary hover:text-ink-primary transition"
      >
        <i className="ti ti-arrow-left text-base" aria-hidden="true"></i>
        Назад
      </button>

      <div className="grid grid-cols-[280px_1fr] gap-3">
        <section className="card">
          <BankCard card={card} size="lg" className="mb-3" />

          <div className="text-center mb-3">
            <span
              className={`badge ${
                card.status === "ACTIVE"
                  ? "bg-success-soft text-success"
                  : card.status === "BLOCKED"
                  ? "bg-warning-soft text-warning"
                  : "bg-fill-control text-ink-secondary"
              }`}
            >
              {card.status === "ACTIVE"
                ? "Активна"
                : card.status === "BLOCKED"
                ? "Заблокирована"
                : "Истекла"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={loadReveal}
              disabled={revealLoading}
              className="btn-outline-brand py-1.5 text-[11px] disabled:opacity-60"
              data-testid="card-reveal-btn"
            >
              <i
                className={`ti ti-${revealLoading ? "loader-2 animate-spin" : reveal ? "eye-off" : "eye"} text-sm`}
                aria-hidden="true"
              ></i>
              {revealLoading ? "Загружаем…" : reveal ? "Скрыть" : "Показать номер"}
            </button>
            <button
              onClick={() => setDesignOpen(true)}
              className="btn-outline-brand py-1.5 text-[11px]"
            >
              <i className="ti ti-palette text-sm" aria-hidden="true"></i>
              Дизайн
            </button>
          </div>

          {revealError && (
            <div className="mt-3 rounded-control bg-danger-soft border border-danger/30 px-3 py-2 text-[12px] text-danger">
              {revealError}
            </div>
          )}

          {reveal && (
            <div
              className="mt-3 rounded-control border border-line bg-surface-2 p-3"
            >
              <div className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">
                Номер карты
              </div>
              <div className="font-mono text-[15px] tracking-widest mb-2.5 select-all">
                {reveal.number}
              </div>
              <div className="flex justify-between text-[11px]">
                <div>
                  <div className="text-ink-muted uppercase tracking-wider text-[9px]">
                    Действует
                  </div>
                  <div className="font-mono">
                    {String(reveal.expiry_month).padStart(2, "0")}/
                    {String(reveal.expiry_year).slice(-2)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted uppercase tracking-wider text-[9px]">CVV</div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono select-all">
                      {showCvv ? reveal.cvv : "•••"}
                    </span>
                    <button
                      onClick={() => setShowCvv((v) => !v)}
                      aria-label={showCvv ? "Скрыть CVV" : "Показать CVV"}
                      className="text-ink-muted hover:text-accent transition"
                    >
                      <i
                        className={`ti ti-${showCvv ? "eye-off" : "eye"} text-xs`}
                        aria-hidden="true"
                      ></i>
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-ink-muted mt-2.5 pt-2 border-t border-line">
                Держатель: {reveal.holder_name}
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3">
          <section className="card">
            <div className="text-[12px] text-ink-secondary mb-2">Привязанный счёт</div>
            {account ? (
              <button
                onClick={() => navigate(`/accounts/${account.id}`)}
                className="w-full card-nested flex items-center gap-3 hover:bg-surface-3 transition text-left"
              >
                <div className="w-8 h-8 rounded-full bg-brand-soft text-accent flex items-center justify-center font-medium">
                  {account.currency === "RUB"
                    ? "₽"
                    : account.currency === "USD"
                    ? "$"
                    : account.currency === "EUR"
                    ? "€"
                    : "¥"}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{account.name}</div>
                  <div className="text-[10px] text-ink-muted">
                    •••• {account.account_number.slice(-4)} · {account.currency} · доступно{" "}
                    {formatMoney(account.balance, account.currency)}
                  </div>
                </div>
                <i
                  className="ti ti-chevron-right text-base text-ink-muted"
                  aria-hidden="true"
                ></i>
              </button>
            ) : (
              <div className="text-[12px] text-ink-muted text-center py-2">
                Счёт не найден
              </div>
            )}
          </section>

          <section className="card">
            <div className="text-[15px] font-medium mb-2.5">Действия</div>
            <div className="flex flex-col">
              <ActionRow
                icon="lock"
                label={card.status === "BLOCKED" ? "Разблокировать карту" : "Заблокировать карту"}
                onClick={() => setBlockOpen(true)}
                testId="card-block-action"
                disabled={card.status === "EXPIRED"}
              />
              <ActionRow
                icon="adjustments"
                label="Лимиты по операциям"
                onClick={() => setLimitsOpen(true)}
                testId="card-limits-action"
              />
              <ActionRow
                icon="refresh"
                label="Перевыпустить"
                onClick={() => setReissueOpen(true)}
                testId="card-reissue-action"
              />
              <ActionRow
                icon="trash"
                label="Закрыть карту"
                onClick={() => setCloseOpen(true)}
                testId="card-close-action"
                danger
              />
            </div>
          </section>

          <section className="card">
            <div className="text-[15px] font-medium mb-2">Операции по карте</div>
            {cardTx.length === 0 ? (
              <div className="text-[12px] text-ink-muted text-center py-4">
                Операций по этой карте пока нет
              </div>
            ) : (
              <div className="flex flex-col">
                {cardTx.slice(0, 5).map((tx, i) => (
                  <div
                    key={tx.id}
                    className={`flex justify-between items-center py-2.5 ${
                      i === Math.min(4, cardTx.length - 1) ? "" : "border-b border-line"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-fill-control flex items-center justify-center">
                        <i className="ti ti-shopping-cart text-[13px]" aria-hidden="true"></i>
                      </div>
                      <div>
                        <div className="text-[13px]">
                          {tx.description ?? "Операция"}
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          {formatRelativeDate(tx.created_at)} · {formatTime(tx.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-[13px]">
                      −{formatMoney(tx.money.total, tx.money.currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <BlockCardModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        currentlyBlocked={card.status === "BLOCKED"}
        onConfirm={async () => {
          await toggleBlock.mutateAsync();
          setBlockOpen(false);
        }}
      />
      <CloseCardModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        cardLast4={card.last4}
        onConfirm={async () => {
          await closeCard.mutateAsync();
          setCloseOpen(false);
        }}
      />
      <ChangeDesignModal
        open={designOpen}
        onClose={() => setDesignOpen(false)}
        card={card}
        onSubmit={async (design) => {
          await api.patch(`/cards/${card.id}`, { design });
          qc.invalidateQueries({ queryKey: ["cards"] });
          setDesignOpen(false);
        }}
      />
      <LimitsModal open={limitsOpen} onClose={() => setLimitsOpen(false)} card={card} />
      <ReissueCardModal
        open={reissueOpen}
        onClose={() => setReissueOpen(false)}
        card={card}
        onConfirm={async (reason) => {
          // Атомарный перевыпуск: бэк сам закрывает старую и выпускает новую
          const { data } = await api.post(`/cards/${card.id}/reissue`, { reason });
          qc.invalidateQueries({ queryKey: ["cards"] });
          qc.invalidateQueries({ queryKey: ["accounts"] });
          setReissueOpen(false);
          navigate(`/cards/${data.id}`);
        }}
      />
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  testId,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 px-2.5 py-2.5 rounded-control hover:bg-fill-hover transition text-left text-[13px] disabled:opacity-40 disabled:cursor-default ${
        danger ? "text-danger" : ""
      }`}
    >
      <i
        className={`ti ti-${icon} text-lg ${danger ? "" : "text-ink-secondary"}`}
        aria-hidden="true"
      ></i>
      <span>{label}</span>
    </button>
  );
}
