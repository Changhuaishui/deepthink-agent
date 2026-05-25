/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: "#070709",
          panel: "#0f1016",
          "panel-hover": "#161722",
          border: "#1e1f2a",
        },
        ivory: {
          DEFAULT: "#e8e6e3",
          muted: "#6b6b75",
        },
        accent: {
          pro: "#f5a623",
          flash: "#00d4aa",
          cot: "#b8a1e6",
          tot: "#4facfe",
          tool: "#fdcb6e",
          error: "#ff5f57",
        },
      },
      fontFamily: {
        display: ['"Oranienbaum"', "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow-dash": "flowDash 1s linear infinite",
        "scanline": "scanline 8s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0, 212, 170, 0.4)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(0, 212, 170, 0.2)" },
        },
        flowDash: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};
