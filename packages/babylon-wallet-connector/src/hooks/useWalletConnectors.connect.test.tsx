/**
 * Connecting a taproot Bitcoin wallet must work with no host-side curve setup.
 *
 * `wallet.taproot.test.ts` covers the derivation helpers in isolation. This
 * covers the path that actually broke: the BTC connect handler calls
 * `validateAddressWithPK` to rebuild the wallet's address, and when that threw
 * for want of a registered curve the catch turned it into a "Connection Failed"
 * screen and dropped the wallet. These cases drive that handler cold.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { initEccLib } from "bitcoinjs-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HashMap, IWallet, Network } from "@/core/types";

import { useWalletConnectors } from "./useWalletConnectors";

/**
 * jsdom installs its own `Uint8Array`, so a Node `Buffer` stops being an
 * instance of the global one and bitcoinjs-lib's `initEccLib` self-check
 * rejects the curve library. A browser has a single realm, so restoring Node's
 * constructor is what makes this environment match production rather than a
 * concession to it — without it no jsdom test could register a curve at all.
 */
const NODE_UINT8ARRAY = Object.getPrototypeOf(Buffer.prototype).constructor;
const JSDOM_UINT8ARRAY = globalThis.Uint8Array;

/** BIP-86 first-address vector: the compressed key and the address it derives. */
const TAPROOT_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const COMPRESSED_PUBLIC_KEY = "03cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";

/** A different valid key, so a mismatch is rejected on the address, not on parsing. */
const OTHER_COMPRESSED_PUBLIC_KEY =
  "0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const CONNECT_FAILED_TITLE = "Connection Failed";
const PUBLIC_KEY_MISMATCH_TITLE = "Public Key Mismatch";

type ConnectHandler = (wallet: IWallet) => void | Promise<void>;

const harness = vi.hoisted(() => ({
  connectHandler: null as ConnectHandler | null,
  disconnect: vi.fn(),
  selectWallet: vi.fn(),
  removeWallet: vi.fn(),
  displayChains: vi.fn(),
  displayError: vi.fn(),
}));

// The connector stands in for the injected BTC wallet: it records the handler
// the hook subscribes to "connect" with, so a case can fire a connection the
// way the real connector does once a wallet returns its account.
vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => ({
    BTC: {
      id: "BTC",
      config: { network: Network.MAINNET },
      connectedWallet: null,
      disconnect: harness.disconnect,
      on: (event: string, handler: ConnectHandler) => {
        if (event === "connect") harness.connectHandler = handler;
        return () => {};
      },
    },
  }),
}));

vi.mock("@/context/LifecycleHooks.context", () => ({
  useLifeCycleHooks: () => ({}),
}));

// `visible` must be true: the handler returns early when the dialog is closed
// and never reaches the address validation this file is about.
vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => ({
    visible: true,
    selectWallet: harness.selectWallet,
    removeWallet: harness.removeWallet,
    displayLoader: vi.fn(),
    displayChains: harness.displayChains,
    displayError: harness.displayError,
    confirm: vi.fn(),
    close: vi.fn(),
    reset: vi.fn(),
    chains: {},
  }),
}));

const accountStorage: HashMap = {
  get: () => undefined,
  set: () => {},
  has: () => false,
  delete: () => false,
};

function connectedWalletWith(publicKeyHex: string): IWallet {
  return {
    id: "unisat",
    name: "UniSat",
    icon: "",
    docs: "",
    installed: true,
    provider: null,
    label: "",
    account: { address: TAPROOT_ADDRESS, publicKeyHex },
  } as IWallet;
}

async function fireConnect(wallet: IWallet): Promise<void> {
  renderHook(() => useWalletConnectors({ persistent: false, accountStorage }));

  await waitFor(() => expect(harness.connectHandler).not.toBeNull());
  await harness.connectHandler?.(wallet);
}

describe("BTC connect handler without host-side curve setup", () => {
  beforeEach(() => {
    globalThis.Uint8Array = NODE_UINT8ARRAY;
    // Clear bitcoinjs-lib's curve registration so every case connects cold,
    // the way a host that never registers one at start-up does.
    initEccLib(undefined);
    harness.connectHandler = null;
    vi.clearAllMocks();
  });

  // Hand the environment back as it was found. Vitest isolates test files, so
  // nothing here reaches another file today — but a mutated global that outlives
  // the suite that needed it is a trap for whoever adds the next case.
  afterEach(() => {
    globalThis.Uint8Array = JSDOM_UINT8ARRAY;
    initEccLib(undefined);
  });

  it("keeps a taproot wallet selected", async () => {
    const wallet = connectedWalletWith(COMPRESSED_PUBLIC_KEY);

    await fireConnect(wallet);

    expect(harness.selectWallet).toHaveBeenCalledWith("BTC", wallet);
    expect(harness.removeWallet).not.toHaveBeenCalled();
    expect(harness.disconnect).not.toHaveBeenCalled();
  });

  it("shows no error screen when a taproot wallet connects", async () => {
    await fireConnect(connectedWalletWith(COMPRESSED_PUBLIC_KEY));

    expect(harness.displayError).not.toHaveBeenCalled();
    expect(harness.displayChains).toHaveBeenCalled();
  });

  it("reports a mismatched public key as a mismatch rather than a failed connection", async () => {
    await fireConnect(connectedWalletWith(OTHER_COMPRESSED_PUBLIC_KEY));

    expect(harness.displayError).toHaveBeenCalledWith(
      expect.objectContaining({ title: PUBLIC_KEY_MISMATCH_TITLE }),
    );
    expect(harness.displayError).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: CONNECT_FAILED_TITLE }),
    );
  });
});
