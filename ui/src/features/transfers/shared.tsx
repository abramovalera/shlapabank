import { ReactNode } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[12px] text-ink-secondary mb-1.5">{children}</div>;
}

export function SumRow({
  label,
  value,
  bold,
  money,
}: {
  label: string;
  value: string;
  bold?: boolean;
  /** Значение — денежная сумма: подсветить цветом и моноширинными цифрами. */
  money?: boolean;
}) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "text-[14px] font-medium" : "text-[12px]"}`}>
      <span className={bold ? "" : "text-ink-muted"}>{label}</span>
      <span className={money ? `text-money tabular-nums ${bold ? "font-semibold" : ""}` : ""}>
        {value}
      </span>
    </div>
  );
}
