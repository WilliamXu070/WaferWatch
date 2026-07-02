import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/styles/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ww: {
          bg: "#f4f4f1",
          panel: "#ffffff",
          ink: "#141414",
          muted: "#585858",
          border: "#d6d6d0",
          accent: "#111111"
        }
      },
      borderRadius: {
        panel: "20px"
      },
      boxShadow: {
        panel: "0 14px 38px -22px rgba(20,20,20,0.35)"
      },
      maxWidth: {
        shell: "1400px"
      }
    }
  },
  plugins: []
};

export default config;
