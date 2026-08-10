import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";
import { useBugsEnabled } from "@/features/flags/api";

interface SearchItem {
  key: string;
  title: string;
  hint: string;
  icon: string;
  to: string;
}

/**
 * Глобальный поиск по приложению. Ищет по:
 *  - страницам (Мои карты, Профиль, Платежи и т.д.)
 *  - своим картам (по last4, типу, дизайну)
 *  - своим счетам (по имени, номеру, валюте)
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const bugsOn = useBugsEnabled();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: cards = [] } = useCards();

  const staticItems: SearchItem[] = [
    { key: "p:cards", title: "Мои карты", hint: "Список всех карт", icon: "credit-card", to: "/cards" },
    { key: "p:history", title: "История операций", hint: "Все операции", icon: "list", to: "/history" },
    { key: "p:transfers", title: "Между своими счетами", hint: "Перевод", icon: "arrows-exchange", to: "/transfers" },
    { key: "p:exchange", title: "Обмен валют", hint: "Конвертация RUB / USD / EUR / CNY", icon: "currency-dollar", to: "/transfers/exchange" },
    { key: "p:by-phone", title: "Перевод по номеру телефона", hint: "СБП", icon: "phone", to: "/transfers/by-phone" },
    { key: "p:by-card", title: "Перевод по номеру карты", hint: "Карта → карта", icon: "credit-card", to: "/transfers/by-card" },
    { key: "p:mobile", title: "Мобильная связь", hint: "Оплата телефона", icon: "device-mobile", to: "/payments/mobile" },
    { key: "p:utility", title: "ЖКХ и поставщики", hint: "Платёж поставщику", icon: "bolt", to: "/payments/utility" },
    { key: "p:profile", title: "Профиль", hint: "Личные данные, безопасность", icon: "user", to: "/profile" },
    { key: "p:security", title: "Безопасность", hint: "Пароль, PIN, сессии", icon: "lock", to: "/profile/security" },
    { key: "p:appearance", title: "Внешний вид", hint: "Тема, язык", icon: "palette", to: "/profile/appearance" },
    { key: "p:sbp", title: "Основной банк СБП", hint: "Для приёма переводов", icon: "building-bank", to: "/profile/sbp-bank" },
  ];

  const items: SearchItem[] = useMemo(() => {
    const cardItems: SearchItem[] = cards.map((c: Card) => ({
      key: `c:${c.id}`,
      title: `Карта •• ${c.last4}`,
      hint: `${c.card_type} · ${c.payment_system} · ${c.status}`,
      icon: "credit-card",
      to: `/cards/${c.id}`,
    }));
    const accountItems: SearchItem[] = accounts.map((a: Account) => ({
      key: `a:${a.id}`,
      title: `Счёт ${a.name}`,
      hint: `${a.currency} · •••• ${a.account_number.slice(-4)}`,
      icon: a.account_type === "SAVINGS" ? "piggy-bank" : "wallet",
      to: `/accounts/${a.id}`,
    }));
    return [...staticItems, ...cardItems, ...accountItems];
  }, [cards, accounts]);

  const results = useMemo(() => {
    // SR-1 (bugs): при включённых багах поиск чувствителен к регистру
    // (нет приведения к нижнему регистру) — «Карты» не находит «Мои карты».
    const norm = (s: string) => (bugsOn ? s : s.toLowerCase());
    const q = norm(query.trim());
    if (!q) return [];
    return items
      .filter((it) => norm(it.title).includes(q) || norm(it.hint).includes(q))
      .slice(0, 8);
  }, [items, query, bugsOn]);

  const showDropdown = focused && query.trim().length > 0;

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2 px-4 py-3 rounded-card bg-surface-1 border border-line focus-within:border-brand transition">
        <i className="ti ti-search text-lg text-ink-muted" aria-hidden="true"></i>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-muted"
          placeholder="Найти карту, счёт, операцию, раздел…"
          data-testid="global-search-input"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-ink-muted hover:text-ink-primary"
            aria-label="Очистить"
          >
            <i className="ti ti-x text-base" aria-hidden="true"></i>
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 rounded-card border border-line bg-surface-2 shadow-glow py-1.5 z-50 max-h-[400px] overflow-y-auto fade-up"
          style={{ animationDuration: "0.15s" }}
        >
          {results.length === 0 ? (
            <div className="text-[13px] text-ink-muted text-center py-4">
              Ничего не нашлось по «{query}»
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.key}
                onMouseDown={() => {
                  navigate(r.to);
                  setQuery("");
                  setFocused(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fill-hover transition text-left"
                data-testid={`search-result-${r.key}`}
              >
                <i
                  className={`ti ti-${r.icon} text-lg text-ink-secondary shrink-0`}
                  aria-hidden="true"
                ></i>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{r.title}</div>
                  <div className="text-[10px] text-ink-muted truncate">{r.hint}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
