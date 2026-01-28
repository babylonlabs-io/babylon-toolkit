/**
 * Test setup file for Vitest
 */

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock local @/config to avoid importing the problematic @babylonlabs-io/config package
vi.mock("@/config", async () => {
  return {
    getNetworkConfigBTC: () => ({
      coinName: "Signet BTC",
      coinSymbol: "sBTC",
      networkName: "BTC signet",
      mempoolApiUrl: "https://mempool.space/signet",
      network: 1, // Network.SIGNET
      icon: "/images/signet_bitcoin.svg",
      name: "Signet Bitcoin",
      displayUSD: false,
    }),
    getBTCNetwork: () => 1, // Network.SIGNET
    CONTRACTS: {}, // Mock other exports as needed
    ENV: {},
    isProductionEnv: () => false,
    getCommitHash: () => "test-commit",
  };
});

// Mock @babylonlabs-io/config just in case something imports it directly
vi.mock("@babylonlabs-io/config", () => ({
  getNetworkConfigBTC: () => ({
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: "https://mempool.space/signet",
    network: 1, // Network.SIGNET
  }),
  getBTCNetwork: () => 1, // Network.SIGNET
  getNetworkConfigETH: () => ({
    chainId: 11155111,
    chainName: "Sepolia",
    rpcUrl: "https://sepolia.infura.io",
    blockExplorerUrl: "https://sepolia.etherscan.io",
  }),
  getETHChainId: () => 11155111,
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
