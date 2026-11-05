// Простые инлайн-иконки из макетов (24×24, обводка).
import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

function Svg({ size = 18, color = "currentColor", strokeWidth = 2, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);

export const IconArrows = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h14l-3-3" />
    <path d="M20 16H6l3 3" />
  </Svg>
);

export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </Svg>
);

export const IconSignal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <path d="M8 15.5a6 6 0 0 1 8 0" />
    <circle cx="12" cy="18.5" r="0.8" />
  </Svg>
);

export const IconHouse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const IconCross = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7l10 10" />
    <path d="M17 7L7 17" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.5v.5" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5" />
    <path d="M12 16v.5" />
  </Svg>
);

export const IconDots = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7" />
    <path d="M6.3 6.4C3.9 8.1 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
