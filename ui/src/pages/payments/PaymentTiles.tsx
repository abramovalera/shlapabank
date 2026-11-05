// Плитки операций — на главной и на странице «Платежи».
import { Link } from "react-router-dom";
import { IconArrows, IconCard, IconHouse, IconPhone, IconPlus, IconSignal } from "../../ui/icons";

const TILES = [
  { to: "/transfer/phone", title: "По номеру телефона", testId: "tile-phone", bg: "#007dff", color: "#ffffff", Icon: IconPhone },
  { to: "/transfer/own", title: "Между своими", testId: "tile-own", bg: "#f0ebff", color: "#6941c6", Icon: IconArrows },
  { to: "/transfer/card", title: "На карту", testId: "tile-card", bg: "#e3f6f5", color: "#0e7c78", Icon: IconCard },
  { to: "/pay/mobile", title: "Мобильная связь", testId: "tile-mobile", bg: "#fff1e6", color: "#c4560c", Icon: IconSignal },
  { to: "/pay/utility", title: "ЖКХ и услуги", testId: "tile-utility", bg: "#e9f7ef", color: "#1a7f4b", Icon: IconHouse },
  { to: "/topup", title: "Пополнить", testId: "tile-topup", bg: "#fff6d6", color: "#a15c00", Icon: IconPlus },
];

/** 6 плиток: ровно 3 в ряд на любой ширине, чтобы не оставалась одна внизу. */
export function PaymentTiles() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TILES.map(({ to, title, testId, bg, color, Icon }) => (
        <Link
          key={to}
          to={to}
          data-testid={testId}
          className="flex h-[124px] flex-col justify-between rounded-card bg-white p-4 text-ink hover:text-ink hover:no-underline hover:shadow-outline"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: bg }}>
            <Icon size={22} color={color} strokeWidth={1.9} />
          </span>
          <span className="text-sm font-semibold leading-[18px]">{title}</span>
        </Link>
      ))}
    </div>
  );
}
