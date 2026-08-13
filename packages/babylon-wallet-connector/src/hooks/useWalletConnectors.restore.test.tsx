import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Context, type Connectors } from "@/context/Chain.context";
import { StateContext } from "@/context/State.context";
import {
  createConfirmationReceipt,
  WALLET_CONFIRMATION_RECEIPT_KEY,
} from "@/core/confirmationReceipt";
import type { HashMap, IWallet } from "@/core/types";

import { useWalletConnectors } from "./useWalletConnectors";

describe("useWalletConnectors restoration", () => {
  it("auto-confirms when every required connector restores even if optional BTC does not", async () => {
    const confirm = vi.fn();
    const displayChains = vi.fn();
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const connectorBase = {
      on: vi.fn(() => () => {}),
      wallets: [],
    };
    const connectors = {
      BTC: {
        ...connectorBase,
        id: "BTC",
        config: { network: "mainnet" },
        connectedWallet: null,
      },
      BBN: null,
      ETH: {
        ...connectorBase,
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: ethWallet,
      },
    } as unknown as Connectors;
    const receipt = createConfirmationReceipt(
      ["ETH"],
      [{ chain: "ETH", wallet: ethWallet, account: ethWallet.account! }],
      connectors,
    );
    const storage: HashMap = {
      get: vi.fn((key) =>
        key === WALLET_CONFIRMATION_RECEIPT_KEY ? receipt : undefined,
      ),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn((chain) => chain === "ETH"),
    };
    const state = {
      confirmed: false,
      visible: false,
      screen: { type: "CHAINS" as const },
      selectedWallets: {},
      chains: { BTC: connectors.BTC!, ETH: connectors.ETH! },
      requiredChainIds: ["ETH"],
      confirm,
      displayChains,
      selectWallet: vi.fn(),
      removeWallet: vi.fn(),
    };

    renderHook(() => useWalletConnectors({ persistent: true, accountStorage: storage }), {
      wrapper: ({ children }) => (
        <Context.Provider value={connectors}>
          <StateContext.Provider value={state as any}>{children}</StateContext.Provider>
        </Context.Provider>
      ),
    });

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(storage.has).toHaveBeenCalledWith("ETH");
    expect(storage.has).not.toHaveBeenCalledWith("BTC");
    expect(displayChains).toHaveBeenCalled();
  });

  it("does not auto-confirm a stored wallet without a confirmation receipt after an unconfirmed close/remount", async () => {
    const confirm = vi.fn();
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const connectorBase = {
      on: vi.fn(() => () => {}),
      wallets: [],
    };
    const connectors = {
      BTC: null,
      BBN: null,
      ETH: {
        ...connectorBase,
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: ethWallet,
      },
    } as unknown as Connectors;
    const storage: HashMap = {
      // The chain wallet id can exist because connection precedes the final
      // dialog confirmation. Closing before ToS leaves no receipt.
      get: vi.fn(() => undefined),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn((chain) => chain === "ETH"),
    };
    const state = {
      confirmed: false,
      visible: false,
      screen: { type: "CHAINS" as const },
      selectedWallets: { ETH: ethWallet } as Record<
        string,
        IWallet | undefined
      >,
      chains: { ETH: connectors.ETH! },
      requiredChainIds: ["ETH"],
      confirm,
      displayChains: vi.fn(),
      selectWallet: vi.fn(),
      removeWallet: vi.fn(),
    };

    renderHook(
      () =>
        useWalletConnectors({ persistent: true, accountStorage: storage }),
      {
        wrapper: ({ children }) => (
          <Context.Provider value={connectors}>
            <StateContext.Provider value={state as any}>
              {children}
            </StateContext.Provider>
          </Context.Provider>
        ),
      },
    );

    await waitFor(() =>
      expect(storage.get).toHaveBeenCalledWith(
        WALLET_CONFIRMATION_RECEIPT_KEY,
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not auto-confirm a required chain reconnected through the dialog", async () => {
    const confirm = vi.fn();
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const connectorBase = {
      on: vi.fn(() => () => {}),
      wallets: [],
    };
    let connectors = {
      BTC: null,
      BBN: null,
      ETH: { ...connectorBase, id: "ETH", connectedWallet: ethWallet },
    } as unknown as Connectors;
    let stored = true;
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => stored),
    };
    let state = {
      confirmed: true,
      visible: false,
      screen: { type: "CHAINS" as const },
      selectedWallets: { ETH: ethWallet } as Record<
        string,
        IWallet | undefined
      >,
      chains: { ETH: connectors.ETH! },
      requiredChainIds: ["ETH"],
      confirm,
      displayChains: vi.fn(),
      selectWallet: vi.fn(),
      removeWallet: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Context.Provider value={connectors}>
        <StateContext.Provider value={state as any}>
          {children}
        </StateContext.Provider>
      </Context.Provider>
    );

    const { rerender } = renderHook(
      () =>
        useWalletConnectors({ persistent: true, accountStorage: storage }),
      { wrapper },
    );

    // The confirmed required session is lost, then the user explicitly opens
    // the picker to reconnect it. The connect handler can restore storage before
    // the dialog's Confirm click, but that must not count as cold-start restore.
    stored = false;
    connectors = {
      ...connectors,
      ETH: { ...connectorBase, id: "ETH", connectedWallet: null },
    } as unknown as Connectors;
    state = {
      ...state,
      confirmed: false,
      visible: true,
      selectedWallets: {},
      chains: { ETH: connectors.ETH! },
    };
    rerender();

    stored = true;
    connectors = {
      ...connectors,
      ETH: { ...connectorBase, id: "ETH", connectedWallet: ethWallet },
    } as unknown as Connectors;
    state = {
      ...state,
      selectedWallets: { ETH: ethWallet },
      chains: { ETH: connectors.ETH! },
    };
    rerender();

    state = { ...state, visible: false };
    rerender();

    await waitFor(() => expect(storage.has).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not auto-confirm when the required chain set expands during restoration", async () => {
    const confirm = vi.fn();
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const btcWallet = {
      id: "btc-wallet",
      account: { address: "bc1p123", publicKeyHex: "02abc" },
    } as IWallet;
    const connectorBase = {
      on: vi.fn(() => () => {}),
      wallets: [],
    };
    let connectors = {
      BTC: {
        ...connectorBase,
        id: "BTC",
        config: { network: "mainnet" },
        connectedWallet: btcWallet,
      },
      BBN: null,
      ETH: {
        ...connectorBase,
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: null,
      },
    } as unknown as Connectors;
    // This receipt covered only the original ETH requirement. It must not
    // authorize the newly expanded ETH+BTC requirement set.
    const receipt = createConfirmationReceipt(
      ["ETH"],
      [{ chain: "ETH", wallet: ethWallet, account: ethWallet.account! }],
      connectors,
    );
    const storage: HashMap = {
      get: vi.fn((key) =>
        key === WALLET_CONFIRMATION_RECEIPT_KEY ? receipt : undefined,
      ),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => true),
    };
    let state = {
      confirmed: false,
      visible: false,
      screen: { type: "CHAINS" as const },
      selectedWallets: { BTC: btcWallet } as Record<
        string,
        IWallet | undefined
      >,
      chains: { BTC: connectors.BTC!, ETH: connectors.ETH! },
      requiredChainIds: ["ETH"],
      confirm,
      displayChains: vi.fn(),
      selectWallet: vi.fn(),
      removeWallet: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Context.Provider value={connectors}>
        <StateContext.Provider value={state as any}>
          {children}
        </StateContext.Provider>
      </Context.Provider>
    );

    const { rerender } = renderHook(
      () =>
        useWalletConnectors({ persistent: true, accountStorage: storage }),
      { wrapper },
    );

    connectors = {
      ...connectors,
      ETH: {
        ...connectorBase,
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: ethWallet,
      },
    } as unknown as Connectors;
    state = {
      ...state,
      requiredChainIds: ["ETH", "BTC"],
      selectedWallets: { ETH: ethWallet, BTC: btcWallet },
      chains: { BTC: connectors.BTC!, ETH: connectors.ETH! },
    };
    rerender();

    await waitFor(() => expect(storage.has).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});
