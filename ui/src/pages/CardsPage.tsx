import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card as CardData } from "@/shared/api/types";
import { BankCard } from "@/features/cards/BankCard";
import { useCards } from "@/features/cards/api";
import { IssueCardModal } from "@/features/cards/IssueCardModal";
import { IssueAccountModal } from "@/features/accounts/IssueAccountModal";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatMoney } from "@/shared/lib/format";

/**
 * Экран «Все карты».
 *
 * Компоновка: карты сгруппированы по счетам.
 *  — Если у счёта одна карта — показываем её крупно.
 *  — Если несколько — превращаем в мини-карусель: активная карта в центре,
 *    peek следующих слева/справа, кнопки листания и точки-индикаторы.
 *
 * Клик по самой карте ведёт на её детальную страницу.
 * Кнопки листания / точки перехват клика не пропускают.
 */
export function CardsPage() {
  const navigate = useNavigate();
  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForAccountId, setIssueForAccountId] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const hasEligibleAccount = accounts.some((a) => a.account_type === "DEBIT");

  // Группируем карты по счетам, сохраняя порядок счетов
  const groups = useMemo(() => {
    const byAccount = new Map<number, CardData[]>();
    for (const c of cards) {
      const arr = byAccount.get(c.account_id) ?? [];
      arr.push(c);
      byAccount.set(c.account_id, arr);
    }
    // Сортировка групп: сначала счета с картами, в порядке появления в accounts
    const sortedAccounts = [...accounts].sort((a, b) => a.id - b.id);
    return sortedAccounts
      .map((acc) => ({ account: acc, cards: byAccount.get(acc.id) ?? [] }))
      .filter((g) => g.cards.length > 0);
  }, [cards, accounts]);

  function openIssueForAccount(accId: number) {
    setIssueForAccountId(accId);
    setIssueOpen(true);
  }

  function closeIssue() {
    setIssueOpen(false);
    setIssueForAccountId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-medium">Все карты</h1>
        {cards.length > 0 && (
          <button
            className="btn-primary py-2 px-3.5 text-[13px]"
            onClick={() => setIssueOpen(true)}
          >
            <i className="ti ti-plus text-sm" aria-hidden="true"></i>
            Выпустить карту
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="credit-card-off"
            title="Карт пока нет"
            hint={
              hasEligibleAccount
                ? "Выпустите карту к любому из счетов"
                : "Сначала откройте дебетовый счёт — карта выпустится к нему"
            }
            actionLabel={hasEligibleAccount ? "Открыть карту" : "Открыть счёт"}
            onAction={() =>
              hasEligibleAccount ? setIssueOpen(true) : setAccountOpen(true)
            }
            testId="cards-page-empty"
            actionTestId="cards-page-empty-action"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <AccountGroup
              key={g.account.id}
              account={g.account}
              cards={g.cards}
              onOpenCard={(id) => navigate(`/cards/${id}`)}
              onIssueForAccount={() => openIssueForAccount(g.account.id)}
            />
          ))}
        </div>
      )}

      <IssueCardModal
        open={issueOpen}
        onClose={closeIssue}
        accounts={accounts}
        defaultAccountId={issueForAccountId ?? undefined}
        lockAccount={issueForAccountId !== null}
      />
      <IssueAccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

/**
 * Одна секция «счёт + его карты».
 * Слева заголовок счёта, справа кнопка «+ карта к этому счёту».
 * Ниже — либо одна карта, либо мини-карусель.
 */
function AccountGroup({
  account,
  cards,
  onOpenCard,
  onIssueForAccount,
}: {
  account: Account;
  cards: CardData[];
  onOpenCard: (id: number) => void;
  onIssueForAccount: () => void;
}) {
  const multiple = cards.length > 1;
  return (
    <div className="card" data-testid={`account-group-${account.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="text-[15px] font-medium truncate">{account.name}</div>
          <div className="text-[11px] text-ink-muted mt-0.5">
            {account.currency} · •• {account.account_number.slice(-4)} ·{" "}
            {formatMoney(account.balance, account.currency)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {multiple && (
            <span className="badge bg-brand-soft text-accent border border-brand/30">
              {cards.length} {plural(cards.length, ["карта", "карты", "карт"])}
            </span>
          )}
          <button
            onClick={onIssueForAccount}
            className="text-[11px] text-accent hover:underline flex items-center gap-1"
            data-testid={`issue-card-for-${account.id}`}
          >
            <i className="ti ti-plus text-[13px]" aria-hidden="true"></i>
            Карта
          </button>
        </div>
      </div>

      {multiple ? (
        <CardsCarousel cards={cards} onOpen={onOpenCard} />
      ) : (
        <SingleCardTile card={cards[0]} onOpen={() => onOpenCard(cards[0].id)} />
      )}
    </div>
  );
}

function SingleCardTile({ card, onOpen }: { card: CardData; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 rounded-control p-2 hover:bg-fill-control transition"
      data-testid={`cards-page-card-${card.id}`}
    >
      <div className="w-[210px] shrink-0">
        <BankCard card={card} size="lg" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink-secondary">
          {card.card_type === "GOLD" ? "Gold" : "Дебетовая"} · {card.payment_system}
        </div>
        <div className="text-[13px] mt-1 font-mono">•••• {card.last4}</div>
        <div className="mt-2">
          <CardStatusBadge status={card.status} />
        </div>
      </div>
    </button>
  );
}

/**
 * Мини-карусель на две-N карты одного счёта.
 * Активная карта в центре, соседние выглядывают с боков.
 */
function CardsCarousel({
  cards,
  onOpen,
}: {
  cards: CardData[];
  onOpen: (id: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const total = cards.length;

  function goto(next: number) {
    setIndex(((next % total) + total) % total);
  }

  const current = cards[index];

  return (
    <div className="relative">
      <div className="relative h-[190px] flex items-center justify-center overflow-hidden">
        {cards.map((c, i) => {
          const offset = i - index;
          // Позиции: -1 слева-peek, 0 центр, +1 справа-peek, остальное — за краем
          const isCenter = offset === 0;
          const abs = Math.abs(offset);
          const translate = offset * 130;
          const scale = isCenter ? 1 : 0.82;
          const opacity = abs > 1 ? 0 : isCenter ? 1 : 0.55;
          const z = 10 - abs;
          return (
            <button
              key={c.id}
              onClick={() => {
                if (isCenter) onOpen(c.id);
                else goto(i);
              }}
              className="absolute transition-all duration-300 ease-out"
              style={{
                transform: `translateX(${translate}px) scale(${scale})`,
                opacity,
                zIndex: z,
                pointerEvents: abs > 1 ? "none" : "auto",
              }}
              aria-label={isCenter ? "Открыть карту" : "Показать эту карту"}
              data-testid={`carousel-card-${c.id}`}
            >
              <div className="w-[240px]">
                <BankCard card={c} size="lg" />
              </div>
            </button>
          );
        })}

        {total > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goto(index - 1);
              }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fill-control hover:bg-fill-hover flex items-center justify-center z-20"
              aria-label="Предыдущая карта"
            >
              <i className="ti ti-chevron-left text-lg" aria-hidden="true"></i>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goto(index + 1);
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fill-control hover:bg-fill-hover flex items-center justify-center z-20"
              aria-label="Следующая карта"
            >
              <i className="ti ti-chevron-right text-lg" aria-hidden="true"></i>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-ink-secondary">
            {current.card_type === "GOLD" ? "Gold" : "Дебетовая"} · {current.payment_system}
            <span className="mx-1.5 text-ink-muted">·</span>
            <span className="font-mono">•••• {current.last4}</span>
          </div>
          <div className="mt-1.5">
            <CardStatusBadge status={current.status} />
          </div>
        </div>

        {/* Точки-индикаторы */}
        <div className="flex items-center gap-1.5 shrink-0">
          {cards.map((c, i) => (
            <button
              key={c.id}
              onClick={() => goto(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-accent" : "w-1.5 bg-ink-muted/50 hover:bg-ink-muted"
              }`}
              aria-label={`Карта ${i + 1} из ${total}`}
              data-testid={`carousel-dot-${i}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardStatusBadge({ status }: { status: CardData["status"] }) {
  const label = status === "ACTIVE" ? "Активна" : status === "BLOCKED" ? "Заблокирована" : "Истекла";
  const cls =
    status === "ACTIVE"
      ? "bg-success-soft text-success"
      : status === "BLOCKED"
      ? "bg-warning-soft text-warning"
      : "bg-fill-control text-ink-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
