import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "soft" | "secondary" | "danger" | "white";
type Size = "lg" | "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  soft: "bg-primary-soft text-primary-hover hover:bg-[#d9e9ff]",
  secondary: "bg-page text-ink hover:bg-line",
  danger: "bg-danger-soft text-danger-text hover:bg-[#fde4e1]",
  white: "bg-white text-primary hover:bg-primary-soft",
};

const SIZES: Record<Size, string> = {
  lg: "h-[52px] text-base rounded-control",
  md: "h-12 text-[15px] rounded-control",
  sm: "h-10 text-sm rounded-small",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "inline-flex items-center justify-center gap-2 px-4 font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    VARIANTS[variant],
    SIZES[size],
    extra,
  ].join(" ");
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className = "", disabled, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

/** Кнопка, которая выглядит как ссылка. */
export function LinkButton({ className = "", type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`font-medium text-primary hover:text-primary-hover hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline ${className}`}
      {...rest}
    />
  );
}
