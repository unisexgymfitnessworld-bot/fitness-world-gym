import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          "primary-hover": "var(--brand-primary-hover)",
          "primary-light": "var(--brand-primary-light)",
          dark: "var(--brand-dark)",
          white: "var(--brand-white)"
        },
        surface: {
          base: "var(--surface-base)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)"
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)"
        },
        border: {
          default: "var(--border-default)"
        },
        status: {
          active: "var(--status-active)",
          expired: "var(--status-expired)",
          due: "var(--status-due)",
          pending: "var(--status-pending)"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      borderRadius: {
        card: "8px"
      }
    }
  }
} satisfies Config;
