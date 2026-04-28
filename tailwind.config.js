/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        bg: "#0a0a0f",
        surface: "#111118",
        border: "#1e1e2e",
        accent: "#00e5ff",
        green: "#00ff88",
        red: "#ff4466",
        muted: "#4a4a6a",
        text: "#e0e0f0",
      },
    },
  },
  plugins: [],
};

