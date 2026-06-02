/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#fafafa",
        surface: "#ffffff",
        sidebar: "#f5f5f7",
        line: "#e5e5ea",
        ink: "#1a1a1f",
        muted: "#6b6b73",
        faint: "#a0a0a8",
        accent: "#2563eb",
        accentSoft: "#dbeafe",
        success: "#16a34a",
        warn: "#d97706",
        danger: "#dc2626"
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif"
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "monospace"
        ]
      },
      fontSize: {
        xxs: ["10px", "14px"],
        xs: ["11px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"]
      }
    }
  },
  plugins: []
};
