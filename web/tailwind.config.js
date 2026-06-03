/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Linear-ish light palette
        bg: "#fcfcfd",
        surface: "#ffffff",
        sidebar: "#f7f8f9",
        sidebarHover: "#eeeff1",
        line: "#e6e6e9",
        lineSoft: "#ececef",
        ink: "#0c0c0d",
        ink2: "#1f1f24",
        muted: "#6f6f76",
        faint: "#a8a8af",

        accent: "#5e6ad2",
        accentHover: "#4f5abd",
        accentSoft: "#ebecf9",
        accentText: "#3b46a3",

        success: "#4cb782",
        warn: "#f2994a",
        danger: "#eb5757",

        prioUrgent: "#eb5757",
        prioHigh: "#f2994a",
        prioMedium: "#5e6ad2",
        prioLow: "#a8a8af",

        statusOpen: "#a8a8af",
        statusInProgress: "#f2994a",
        statusDone: "#4cb782",
        statusArchived: "#c8c8cc",
        statusRejected: "#eb5757"
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
        xs: ["11px", "15px"],
        sm: ["12.5px", "17px"],
        base: ["13px", "18px"],
        md: ["14px", "20px"]
      },
      borderRadius: {
        DEFAULT: "5px",
        sm: "3px",
        md: "5px",
        lg: "7px",
        xl: "10px"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,15,20,0.04), 0 0 0 1px rgba(15,15,20,0.04)",
        pop: "0 2px 6px rgba(15,15,20,0.06), 0 0 0 1px rgba(15,15,20,0.06)",
        modal: "0 12px 32px rgba(15,15,20,0.08), 0 0 0 1px rgba(15,15,20,0.06)"
      }
    }
  },
  plugins: []
};
