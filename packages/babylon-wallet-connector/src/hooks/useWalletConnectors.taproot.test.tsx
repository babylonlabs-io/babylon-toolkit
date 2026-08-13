import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Context, type Connectors } from "@/context/Chain.context";
import { StateContext, type Actions, type State } from "@/context/State.context";
import { Network, type HashMap, type IWallet } from "@/core/types";

import { useWalletConnectors } from "./useWalletConnectors";

// BIP86 test vector: account 0, first receiving address, with its compressed
// public key. This file deliberately never registers the elliptic curve itself
// — proving the connect handler registers it — so it must stay free of any
// `initEccLib`/`initBTCCurve` call and of imports that make one.
const TAPROOT_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const COMPRESSED_PUBLIC_KEY = "03cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";

// jsdom gives the test realm its own `Uint8Array` while Node's `Buffer` still
// extends Node's, and the asmjs curve validates every input with
// `instanceof Uint8Array` — so under jsdom it rejects the Buffers bitcoinjs
// hands it. That is purely a test-realm artifact: the browser bundle polyfills
// `Buffer` on top of the page realm's `Uint8Array`. Align the global with the
// constructor `Buffer` actually derives from, before the curve is loaded.
globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;

describe("useWalletConnectors BTC connect", () => {
  it("accepts a taproot wallet on a page that never bootstrapped the elliptic curve", async () => {
    const taprootWallet = {
      id: "btc-wallet",
      account: { address: TAPROOT_ADDRESS, publicKeyHex: COMPRESSED_PUBLIC_KEY },
    } as IWallet;
    let onConnectHandler: ((wallet: IWallet) => Promise<void>) | undefined;
    const disconnect = vi.fn();
    const displayError = vi.fn();
    const displayChains = vi.fn();
    const connectors = {
      BTC: {
        id: "BTC",
        config: { network: Network.MAINNET },
        connectedWallet: null,
        disconnect,
        wallets: [],
        on: vi.fn((event: string, handler: (wallet: IWallet) => Promise<void>) => {
          if (event === "connect") onConnectHandler = handler;
          return () => {};
        }),
      },
      BBN: null,
      ETH: null,
    } as unknown as Connectors;
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => false),
    };
    const state = {
      confirmed: false,
      visible: true,
      screen: { type: "CHAINS" as const },
      selectedWallets: {},
      chains: { BTC: connectors.BTC! },
      requiredChainIds: ["BTC"],
      confirm: vi.fn(),
      displayChains,
      displayError,
      displayLoader: vi.fn(),
      selectWallet: vi.fn(),
      removeWallet: vi.fn(),
    };

    renderHook(() => useWalletConnectors({ persistent: false, accountStorage: storage }), {
      wrapper: ({ children }) => (
        <Context.Provider value={connectors}>
          <StateContext.Provider value={state as unknown as State & Actions}>{children}</StateContext.Provider>
        </Context.Provider>
      ),
    });

    await waitFor(() => expect(onConnectHandler).toBeDefined());
    await onConnectHandler!(taprootWallet);

    // Without the curve registered, `payments.p2tr()` throws inside
    // validateAddressWithPK and the handler's catch tears the wallet down with
    // a "Connection Failed" dialog instead of advancing to chain selection.
    expect(displayError).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    expect(state.selectWallet).toHaveBeenCalledWith("BTC", taprootWallet);
    expect(displayChains).toHaveBeenCalled();
  });
});
