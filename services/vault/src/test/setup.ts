/**
 * Test setup file for Vitest
 */

import "@testing-library/jest-dom";
import { afterAll, beforeAll, vi } from "vitest";

// Mock the local `@/config` adapter so tests don't pull in env.ts (which
// reads NEXT_PUBLIC_* and triggers the live network runtime).
vi.mock("@/config", async () => {
  return {
    getNetworkConfigBTC: () => ({
      coinName: "Signet BTC",
      coinSymbol: "sBTC",
      networkName: "BTC signet",
      mempoolApiUrl: "https://mempool.space/signet",
      // Adapter returns wallet-connector's Network enum (string-valued).
      network: "signet",
      icon: "/images/signet_bitcoin.svg",
      name: "Signet Bitcoin",
      displayUSD: false,
    }),
    getBTCNetwork: () => "signet",
    CONTRACTS: {}, // Mock other exports as needed
    ENV: {},
    isProductionEnv: () => false,
    getCommitHash: () => "test-commit",
  };
});

// Mock @/config/network — tests bypass the real runtime so they don't
// depend on env vars or `configureBabylonConfig` having been called.
vi.mock("@/config/network", () => ({
  configureBabylonConfig: vi.fn(),
  _resetBabylonConfigForTests: vi.fn(),
  getNetworkConfigBTC: () => ({
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: "https://mempool.space/signet",
    network: "signet",
  }),
  getBTCNetwork: () => "signet",
  getNetworkConfigETH: () => ({
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: "https://sepolia.infura.io",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    displayUSD: false,
  }),
  getETHChain: () => ({
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://sepolia.infura.io"] },
      public: { http: ["https://sepolia.infura.io"] },
    },
  }),
  ETH_MAINNET_CHAIN_ID: 1,
  ETH_SEPOLIA_CHAIN_ID: 11155111,
  BTC_MAINNET: "mainnet",
  BTC_SIGNET: "signet",
}));

// Mock the WASM module to avoid syntax errors in tests
vi.mock("@/utils/btc/wasm", () => ({
  initWasm: vi.fn(),
  createPegInTransaction: vi.fn().mockResolvedValue({
    txHex: "0xmocktxhex",
    txid: "mocktxid",
    vaultScriptPubKey: "0xmockvaultscript",
    vaultValue: 100000n,
    changeValue: 390000n,
  }),
}));

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock crypto for testing
if (!global.crypto) {
  global.crypto = {
    getRandomValues: (arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  } as any;
}

// Suppress console errors in tests unless explicitly needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Warning: ReactDOM.render") ||
        args[0].includes("Warning: useLayoutEffect") ||
        args[0].includes("Warning: An update to") ||
        args[0].includes("Not implemented"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
