/**
 * Test setup file for Vitest
 */

import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import { afterAll, beforeAll, vi } from "vitest";

// Cold async-gated page renders (e.g. /activity behind AaveConfigProvider)
// exceed the 1000ms waitFor default under CI load; a passing assertion still
// returns immediately, so raising the ceiling only helps flakes.
configure({ asyncUtilTimeout: 4000 });

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
    FeatureFlags: {},
    getCommitHash: () => "test-commit",
  };
});

// Mock @/config/network — tests bypass the real runtime so they don't
// depend on env vars or `configureBabylonConfig` having been called.
vi.mock("@/config/network", () => ({
  configureBabylonConfig: vi.fn(),
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

// Default-mock the protocol gate hooks. They wrap a React-Query on-chain read,
// which the many incidental consumers (deposit/borrow/withdraw/repay/activation
// components and tx hooks) would otherwise require a QueryClient for. The
// default is an unblocked gate; gating-specific tests override `useProtocolGate`
// locally with their own `vi.mock` to drive a frozen/paused scope. Plain
// functions (not vi.fn) so `vi.clearAllMocks()` can't reset them to undefined.
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolPauseStatus: () => ({ data: undefined, isError: false }),
  useProtocolGateState: () => ({ protocol: null, aave: null }),
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

// Mock window.matchMedia (jsdom-only; skipped in the node test environment)
if (typeof window !== "undefined") {
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
}

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock ResizeObserver — class so callers using `new ResizeObserver(...)` work
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom implements no PointerEvent, so @testing-library falls back to a plain
// Event and silently drops clientX/clientY — every pointer-driven interaction
// (e.g. LineChart hover) would read NaN coordinates. MouseEvent carries them
// and is what React's synthetic pointer events read. Mirrors core-ui's own
// test setup (packages/babylon-core-ui/src/test/setup.ts).
if (
  typeof window !== "undefined" &&
  typeof window.PointerEvent === "undefined"
) {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }

  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

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
