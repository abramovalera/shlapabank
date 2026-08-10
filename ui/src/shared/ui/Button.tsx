import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  testId?: string;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  testId,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const base =
    variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn";
  return (
    <button className={`${base} ${className}`} {...rest}>
      {children}
    </button>
  );
}
