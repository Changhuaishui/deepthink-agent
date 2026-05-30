/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: "#f8f9fa",
          panel: "#ffffff",
          "panel-hover": "#f1f3f5",
          border: "#dee2e6",
        },
        ivory: {
          DEFAULT: "#212529",
          muted: "#6c757d",
        },
        accent: {
          pro: "#e67700",
          flash: "#0ca678",
          cot: "#7950f2",
          tot: "#1971c2",
          tool: "#e8590c",
          error: "#c92a2a",
        },
      },
      fontFamily: {
        display: ['"Oranienbaum"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', "monospace"],
      },
      animation: {
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow-dash": "flowDash 1s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(12, 166, 120, 0.3)" },
          "50%": { boxShadow: "0 0 12px 2px rgba(12, 166, 120, 0.15)" },
        },
        flowDash: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
      },
    },
  },
  plugins: [],
};
