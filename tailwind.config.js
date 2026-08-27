/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // driven by CSS variables injected from lib/brand.config.js
        bg: "var(--bg)",
        bg2: "var(--bg2)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        muted2: "var(--muted2)",
        brand: "var(--brand)",
        brand2: "var(--brand2)",
        up: "var(--up)",
        down: "var(--down)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Malgun Gothic", "sans-serif"],
      },
    },
  },
  plugins: [],
};
