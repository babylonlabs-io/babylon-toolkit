// TODO: Below config is not in use yet.
// This is a placeholder for future code refactoring purposes.
export default {
  api: {
    baseUrl:
      process.env.NEXT_PUBLIC_API_URL ??
      "https://staking-api.canon-devnet.babylonlabs.io",
  },
  bitcoin: {
    url: process.env.NEXT_PUBLIC_MEMPOOL_API ?? "https://mempool.space",
    network: process.env.NEXT_PUBLIC_NETWORK ?? "signet",
  },
  babylon: {
    lcdUrl:
      process.env.NEXT_PUBLIC_BABY_LCD_URL ??
      "https://lcd.canon-devnet.babylonlabs.io",
    rpcUrl:
      process.env.NEXT_PUBLIC_BABY_RPC_URL ??
      "https://rpc.canon-devnet.babylonlabs.io",
  },
} satisfies Infra.Config;
