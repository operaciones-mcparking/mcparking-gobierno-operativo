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
        ink: "#132333",
        line: "#cbd8e3",
        moss: "#66785f",
        clay: "#FFC107",
        sea: "#25677a",
        navy: "#023574",
        mist: "#f6f8fa",
      },
    },
  },
  plugins: [],
};

export default config;
