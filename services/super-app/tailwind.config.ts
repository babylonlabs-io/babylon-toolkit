import type { Config } from "tailwindcss";

const coreUIConfig = require("@babylonlabs-io/core-ui/tailwind");

const config: Config = {
    presets: [coreUIConfig],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "../simple-staking/src/**/*.{js,ts,jsx,tsx}",
        "../vault/src/**/*.{js,ts,jsx,tsx}",
        "../../packages/babylon-core-ui/src/**/*.{js,ts,jsx,tsx}",
        "../../packages/babylon-wallet-connector/src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {},
    },
};

export default config;

