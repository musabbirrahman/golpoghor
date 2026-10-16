/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        river: {
          DEFAULT: "#285C4B",
          dark: "#1E4639",
          light: "#3A7A64",
          soft: "#E3EDE7",
        },
        ink: {
          DEFAULT: "#26332F",
          soft: "#4A5A54",
          faint: "#7A8A83",
        },
        paper: {
          DEFAULT: "#F7F3E9",
          dark: "#EFE8D6",
          deep: "#E7DDC4",
        },
        sage: {
          DEFAULT: "#E8EFE8",
          dark: "#D5E0D5",
        },
        gold: {
          DEFAULT: "#C28A42",
          soft: "#E8D3AC",
        },
        clay: {
          DEFAULT: "#A85745",
          dark: "#8A4536",
          soft: "#F0DDD6",
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"Noto Sans Bengali"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
        ],
        serif: [
          '"Literata"',
          '"Noto Serif Bengali"',
          "Georgia",
          '"Times New Roman"',
          "serif",
        ],
      },
      maxWidth: {
        reader: "42rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(38,51,47,0.06), 0 4px 16px rgba(38,51,47,0.08)",
        lift: "0 2px 4px rgba(38,51,47,0.08), 0 12px 32px rgba(38,51,47,0.14)",
      },
    },
  },
  plugins: [],
};
