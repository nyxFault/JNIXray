/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e5ff",
          200: "#b5cbff",
          300: "#88a9ff",
          400: "#5c86ff",
          500: "#3366ff",
          600: "#204bdb",
          700: "#1838a8",
          800: "#152d80",
          900: "#0f1f5e",
        },
      },
      fontFamily: {
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "monospace",
        ],
        sans: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "monospace",
        ],
        display: [
          "'Share Tech Mono'",
          "'JetBrains Mono'",
          "ui-monospace",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99, 102, 241, 0.35), 0 10px 40px -10px rgba(99,102,241,0.35)",
      },
    },
  },
  plugins: [],
};
