import { Card as CardData, CardDesign, CardType, CardPaymentSystem } from "@/shared/api/types";

interface Props {
  // Полная карта либо превью-набор для модалок
  card?: CardData;
  design?: CardDesign;
  cardType?: CardType;
  paymentSystem?: CardPaymentSystem;
  last4?: string;
  holderName?: string;
  expiryLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  blocked?: boolean;
}

/**
 * Визуальное представление банковской карты (physical-look).
 * Один компонент рисует и реальную карту, и превью в модалке выпуска.
 */
export function BankCard({
  card,
  design,
  cardType,
  paymentSystem,
  last4,
  holderName,
  expiryLabel,
  size = "md",
  className = "",
  blocked,
}: Props) {
  const finalDesign: CardDesign = card?.design ?? design ?? "CLASSIC";
  const finalType: CardType = card?.card_type ?? cardType ?? "DEBIT";
  const finalSystem: CardPaymentSystem = card?.payment_system ?? paymentSystem ?? "VISA";
  const finalLast4: string = card?.last4 ?? last4 ?? "••••";
  const finalHolder: string = (card?.holder_name ?? holderName ?? "CARD HOLDER").toUpperCase();
  const finalExpiry: string =
    expiryLabel ??
    (card
      ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
      : "••/••");
  const isBlocked = blocked ?? card?.status === "BLOCKED";

  const dims =
    size === "sm"
      ? "w-[160px] h-[100px] p-2.5"
      : size === "lg"
      ? "w-full aspect-[1.586] p-3.5"
      : "w-[200px] h-[126px] p-3";

  return (
    <div
      className={`rounded-[12px] text-white flex flex-col justify-between relative overflow-hidden ${dims} ${className}`}
      style={{ background: isBlocked ? BLOCKED_BG : DESIGN_GRADIENTS[finalDesign] }}
      data-testid={card ? `bank-card-${card.id}` : "bank-card-preview"}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[10px] opacity-60">ShlapaBank</div>
          <div className="text-[11px] opacity-85 mt-0.5">{cardTypeLabel(finalType)}</div>
        </div>
        <div
          className="w-6 h-4 rounded-[3px]"
          style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8941e 100%)" }}
          aria-hidden="true"
        />
      </div>
      <div>
        <div className="text-[14px] tracking-[2px] font-mono">•••• {finalLast4}</div>
        <div className="flex justify-between items-end mt-1.5 text-[10px] opacity-70">
          <span className="uppercase truncate max-w-[110px]">
            {finalHolder} · {finalExpiry}
          </span>
          <span className="font-medium italic">{finalSystem}</span>
        </div>
      </div>
    </div>
  );
}

export const DESIGN_GRADIENTS: Record<CardDesign, string> = {
  // Regular — базовые цвета (3 варианта)
  CLASSIC:  "linear-gradient(135deg, #0f1729 0%, #1e2a4a 100%)",
  EMERALD:  "linear-gradient(135deg, #0f6e56 0%, #1d9e75 100%)",
  GRAPHITE: "linear-gradient(135deg, #1a1a1c 0%, #3a3a3f 100%)",
  // Gold — 4 премиум-оттенка с золотой аурой
  // SUNSET — насыщенный тёмно-графитовый с золотыми акцентами
  SUNSET:   "linear-gradient(135deg, #1c1815 0%, #2a2320 30%, #705021 65%, #d4a748 90%, #ffe085 100%)",
  // ROSE — рубиновая карта (deep ruby → wine → gold accent)
  ROSE:     "linear-gradient(135deg, #2a0810 0%, #5c1224 35%, #a52447 70%, #d4a24a 100%)",
  // GOLD_BAR — королевский фиолетовый с золотым бликом
  GOLD_BAR: "linear-gradient(135deg, #1a0e2e 0%, #3d1a5c 30%, #6a2d8f 60%, #c9a04a 90%, #ffe085 100%)",
  // GOLD_MARBLE — глубокий сапфирово-синий с золотыми прожилками
  GOLD_MARBLE: "linear-gradient(135deg, #060f1e 0%, #0c1a3f 25%, #1a3d8f 55%, #b8842a 85%, #ffe085 100%)",
};

/** Для UI: какие дизайны доступны для каждого типа карты. */
export const DESIGNS_FOR_TYPE: Record<"REGULAR" | "GOLD", CardDesign[]> = {
  REGULAR: ["CLASSIC", "EMERALD", "GRAPHITE"],
  GOLD: ["SUNSET", "ROSE", "GOLD_BAR", "GOLD_MARBLE"],
};

const BLOCKED_BG = "linear-gradient(135deg, #444441 0%, #5f5e5a 100%)";

function cardTypeLabel(t: string): string {
  if (t === "GOLD") return "Gold";
  if (t === "REGULAR" || t === "DEBIT") return "Дебетовая";
  if (t === "VIRTUAL") return "Виртуальная"; // историч.
  if (t === "CREDIT") return "Кредитная";    // историч.
  return "Дебетовая";
}
