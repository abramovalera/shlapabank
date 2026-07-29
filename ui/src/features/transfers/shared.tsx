import { ReactNode } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[12px] text-ink-secondary mb-1.5">{children}</div>;
}

export function SumRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "text-[14px] font-medium" : "text-[12px]"}`}>
      <span className={bold ? "" : "text-ink-muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
