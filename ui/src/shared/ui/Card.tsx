import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  testId?: string;
}

export function Card({ children, className = "", testId }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  );
}
