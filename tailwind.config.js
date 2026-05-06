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
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        green: "var(--color-green)",
        red: "var(--color-red)",
        muted: "var(--color-muted)",
        text: "var(--color-text)",
      },
    },
  },
  plugins: [],
};

