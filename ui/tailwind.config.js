/** @type {import('tailwindcss').Config} */
// Цвета и размеры — из утверждённых макетов (docs: redesign/*.dc.html).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Roboto", "Arial", "sans-serif"],
      },
      colors: {
        page: "#f3f4f7",
        navy: "#1f2d3d",
        ink: {
          DEFAULT: "#1f2d3d",
          muted: "#6b7a8c",
          faint: "#9aa6b4",
          soft: "#c4ccd6",
        },
        line: {
          DEFAULT: "#e7eaee",
          soft: "#f0f2f5",
        },
        primary: {
          DEFAULT: "#007dff",
          hover: "#0866d6",
          soft: "#e8f1ff",
        },
        info: {
          bg: "#eef5ff",
          text: "#1d5fc4",
        },
        success: {
          DEFAULT: "#1a9e55",
          dark: "#1a7f4b",
          soft: "#e9f7ef",
        },
        fee: "#d9730d",
        warn: {
          DEFAULT: "#b54708",
          soft: "#fff1e6",
          bar: "#f79009",
        },
        danger: {
          DEFAULT: "#d92d20",
          border: "#f04438",
          soft: "#fef3f2",
          text: "#b42318",
        },
        // Цветные подложки иконок операций и счетов
        tone: {
          blue: "#0866d6",
          "blue-bg": "#e8f1ff",
          violet: "#6941c6",
          "violet-bg": "#f0ebff",
          teal: "#0e7c78",
          "teal-bg": "#e3f6f5",
          green: "#1a7f4b",
          "green-bg": "#e9f7ef",
          orange: "#c4560c",
          "orange-bg": "#fff1e6",
          amber: "#a15c00",
          "amber-bg": "#fff6d6",
          gold: "#c26a00",
          "gold-bg": "#fff3e0",
          red: "#d92d20",
          "red-bg": "#fef3f2",
          grey: "#6b7a8c",
          "grey-bg": "#f3f4f7",
        },
      },
      borderRadius: {
        card: "16px",
        dialog: "20px",
        control: "12px",
        small: "10px",
      },
      boxShadow: {
        header: "inset 0 -1px 0 #e7eaee",
        dialog: "0 17px 36px rgba(16,24,40,0.08), 0 2px 8px rgba(16,24,40,0.04)",
        focus: "inset 0 0 0 2px #007dff",
        invalid: "inset 0 0 0 2px #f04438",
        outline: "inset 0 0 0 1px #e7eaee",
        "row-top": "inset 0 1px 0 #f0f2f5",
        "row-bottom": "inset 0 -1px 0 #e7eaee",
        "nav-active": "inset 0 -2px 0 #007dff",
      },
      maxWidth: {
        page: "1160px",
      },
    },
  },
  plugins: [],
};
