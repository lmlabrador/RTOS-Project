/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0f172a",
        glass: "rgba(255,255,255,0.05)",
        accentBlue: "#3b82f6",
        accentViolet: "#8b5cf6",
        switchRed: "#ef4444",
        textPrimary: "#f8fafc",
        textSecondary: "#94a3b8",
      },
      borderRadius: {
        card: "24px",
      },
    },
  },
  plugins: [],
};
