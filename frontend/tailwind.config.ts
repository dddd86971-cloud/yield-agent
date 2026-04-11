import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0f",
          card: "#13131a",
          border: "#1f1f2a",
          hover: "#1a1a24",
        },
        accent: {
          DEFAULT: "#00ffa3",
          dim: "#00b377",
        },
        warn: "#ff9500",
        danger: "#ff3b5c",
        ok: "#00ffa3",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          from: { boxShadow: "0 0 10px rgba(0, 255, 163, 0.3)" },
          to: { boxShadow: "0 0 20px rgba(0, 255, 163, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
