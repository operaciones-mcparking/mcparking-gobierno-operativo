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
        ink: "#101820",
        line: "#dde5ec",
        moss: "#66785f",
        clay: "#f59f22",
        sea: "#087c9f",
        navy: "#003b5c",
        mist: "#f7f9fb",
      },
    },
  },
  plugins: [],
};

export default config;
