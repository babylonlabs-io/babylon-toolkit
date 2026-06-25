import type { Config } from "tailwindcss";

const coreUIConfig = require("@babylonlabs-io/core-ui/tailwind");

const config: Config = {
  presets: [coreUIConfig],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/babylon-core-ui/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/babylon-wallet-connector/src/**/*.{js,ts,jsx,tsx}",
    "../../routes/vault/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand success green (Figma foundation/green/a400, #15B768). Backed by
        // the --success-bright RGB-channel var in globals.css so alpha
        // modifiers (e.g. bg-success-bright/10) resolve correctly.
        "success-bright": "rgb(var(--success-bright) / <alpha-value>)",
      },
    },
  },
  darkMode: "class",
};

export default config;
