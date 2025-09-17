import type { Config } from "tailwindcss";

// Use the same core UI preset as simple-staking
// eslint-disable-next-line @typescript-eslint/no-var-requires
const coreUIConfig = require("@babylonlabs-io/core-ui/tailwind");

export default {
    presets: [coreUIConfig],
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx}",
        "../simple-staking/src/**/*.{ts,tsx}",
        "../../packages/babylon-core-ui/src/**/*.{js,ts,jsx,tsx}",
        "../../packages/babylon-wallet-connector/src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
} satisfies Config;


