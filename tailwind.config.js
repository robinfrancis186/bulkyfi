/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#e5e7eb",
          200: "#cbd5e1",
          300: "#94a3b8",
          400: "#64748b",
          500: "#475569",
          600: "#334155",
          700: "#1f2937",
          800: "#111827",
          900: "#1d1d1f",
          950: "#050506"
        },
        parchment: {
          50: "#fbfcff",
          100: "#f5f7fb",
          200: "#eef2f7",
          300: "#e5e7eb",
          400: "#cbd5e1"
        },
        gold: {
          300: "#7cc7ff",
          500: "#0071e3",
          600: "#0057b8"
        }
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        soft: "0 2px 20px rgba(26,22,18,.08)",
        medium: "0 12px 34px rgba(26,22,18,.12)",
        strong: "0 32px 80px rgba(26,22,18,.15)"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        float: "float 5s ease-in-out infinite",
        fadeIn: "fadeIn .5s ease-out both"
      }
    }
  },
  plugins: []
};
