/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#eef4f8",
        sand: "#f8f4ea",
        olive: "#77814e",
        ember: "#b65b43",
        gold: "#c7922f",
        pine: "#2e6a57"
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Segoe UI"', "sans-serif"],
        body: ['"Space Grotesk"', '"Segoe UI"', "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 48px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
};
