import type { Config } from "tailwindcss";

const coreUIConfig = require("@babylonlabs-io/core-ui/tailwind");

const config: Config = {
  presets: [coreUIConfig],
  content: [
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/babylon-core-ui/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/babylon-wallet-connector/src/**/*.{js,ts,jsx,tsx}",
    "../../routes/vault/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
};

export default config;
