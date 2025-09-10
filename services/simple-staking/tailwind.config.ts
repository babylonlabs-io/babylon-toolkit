import type { Config } from "tailwindcss";

import { screenBreakPoints } from "./src/ui/common/config/screen-breakpoints";

const coreUIConfig = require("@babylonlabs-io/core-ui/tailwind");

const config = {
  presets: [coreUIConfig],
  content: [
    "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/babylon-core-ui/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/babylon-wallet-connector/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    screens: screenBreakPoints,
  },
};

export default config;
