/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Ember dark: тёмно-синяя ночная подложка + тёплый оранжевый акцент
        surface: {
          0: "#0B1223", // страница
          1: "#141C33", // в потоке (карточка)
          2: "#1E2848", // вложенная / модалка
          3: "#2A355C", // popover
        },
        ink: {
          primary: "#F5F7FF",
          secondary: "rgba(245, 247, 255, 0.7)",
          muted: "rgba(245, 247, 255, 0.4)",
        },
        brand: {
          DEFAULT: "#F09427", // основной оранжевый (для градиента верхняя точка ниже)
          soft: "rgba(240, 148, 39, 0.15)",
          strong: "#FFA347",
        },
        accent: {
          DEFAULT: "#FFA347",
          soft: "rgba(255, 163, 71, 0.15)",
          strong: "#F09427",
        },
        success: {
          DEFAULT: "#4DE89F",
          soft: "rgba(43, 224, 140, 0.15)",
          strong: "#2BE08C",
        },
        warning: {
          DEFAULT: "#F7DE6E",
          soft: "rgba(245, 213, 71, 0.15)",
          strong: "#F5D547",
        },
        danger: {
          DEFAULT: "#FF5A75",
          soft: "rgba(255, 58, 92, 0.15)",
          strong: "#FF3A5C",
        },
        info: {
          DEFAULT: "#6EA8FE",
          soft: "rgba(110, 168, 254, 0.15)",
        },
        line: {
          DEFAULT: "rgba(245, 247, 255, 0.06)",
          strong: "rgba(245, 247, 255, 0.12)",
        },
        // Денежные суммы — единый акцент, чтобы деньги не сливались с текстом.
        money: "#F5D547",
        fill: {
          control: "rgba(245, 247, 255, 0.05)",
          hover: "rgba(245, 247, 255, 0.08)",
        },
      },
      borderRadius: {
        card: "16px",
        control: "12px",
        pill: "9999px",
      },
      boxShadow: {
        glow: "0 0 60px rgba(240, 148, 39, 0.18), 0 20px 40px rgba(0,0,0,0.35)",
        "glow-sm": "0 4px 20px rgba(240, 148, 39, 0.35)",
      },
      keyframes: {
        twinkle: {
          "0%, 100%": { opacity: "0.15" },
          "50%": { opacity: "0.8" },
        },
        drift: {
          "0%, 100%": { transform: "translateY(0px)", opacity: "0.5" },
          "50%": { transform: "translateY(-10px)", opacity: "1" },
        },
      },
      animation: {
        twinkle: "twinkle 3s ease-in-out infinite",
        drift: "drift 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
