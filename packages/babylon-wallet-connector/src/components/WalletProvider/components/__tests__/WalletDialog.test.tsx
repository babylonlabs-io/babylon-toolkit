import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TermsOfServiceParams } from "@/context/LifecycleHooks.context";
import { WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { HashMap, IWallet } from "@/core/types";

import { WalletDialog } from "../WalletDialog";

const harness = vi.hoisted(() => ({
  widgetState: {} as Record<string, unknown>,
  connectors: {} as Record<string, unknown>,
  lifecycleHooks: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useWidgetState", () => ({
  useWidgetState: () => harness.widgetState,
}));
vi.mock("@/context/Chain.context", () => ({
  useChainProviders: () => harness.connectors,
}));
vi.mock("@/context/LifecycleHooks.context", () => ({
  useLifeCycleHooks: () => harness.lifecycleHooks,
}));
vi.mock("@/hooks/useWalletConnectors", () => ({
  useWalletConnectors: () => ({ connect: vi.fn() }),
}));
vi.mock("@/hooks/useWalletWidgets", () => ({
  useWalletWidgets: () => ({}),
}));

// Stand-ins that expose the dialog's two exits as buttons.
vi.mock("@babylonlabs-io/core-ui", () => ({
  FullScreenDialog: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
    <div>
      <button onClick={onClose}>close</button>
      {children}
    </div>
  ),
}));
vi.mock("../Screen", () => ({
  Screen: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>confirm</button>,
}));

const ETH_ACCOUNT = { address: "0xdepositor", publicKeyHex: `04${"b".repeat(64)}` };
const BTC_ACCOUNT = { address: "bc1pdepositor", publicKeyHex: `02${"a".repeat(64)}` };
const BBN_ACCOUNT = { address: "bbn1depositor", publicKeyHex: `03${"c".repeat(64)}` };

function wallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  return { id, name: id, account } as IWallet;
}

function ethWallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  const connectedWallet = wallet(id, account);
  connectedWallet.provider = {
    getChainId: vi.fn().mockResolvedValue(11155111),
  } as unknown as IWallet["provider"];
  return connectedWallet;
}

function btcWallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  const connectedWallet = wallet(id, account);
  connectedWallet.provider = {
    getNetwork: vi.fn().mockResolvedValue("signet"),
  } as unknown as IWallet["provider"];
  return connectedWallet;
}

let store: Map<string, string>;
let storage: HashMap;
let close: ReturnType<typeof vi.fn>;
let confirm: ReturnType<typeof vi.fn>;
let disconnectEth: ReturnType<typeof vi.fn>;
let acceptTermsOfService: ReturnType<typeof vi.fn>;
let onConfirm: ReturnType<typeof vi.fn>;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function setup({
  confirmed = false,
  requiredChainIds = ["ETH"],
  selectedWallets = { ETH: wallet("metamask", ETH_ACCOUNT) } as Record<string, IWallet | undefined>,
  persistent = true,
} = {}) {
  harness.widgetState = {
    visible: true,
    screen: { type: "CHAINS" },
    confirmed,
    selectedWallets,
    requiredChainIds,
    close,
    confirm,
    displayChains: vi.fn(),
    displayError: vi.fn(),
  };

  return render(<WalletDialog persistent={persistent} storage={storage} config={[]} />);
}

beforeEach(() => {
  store = new Map();
  storage = {
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => void store.set(key, value),
    has: (key: string) => store.has(key),
    delete: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  } as unknown as HashMap;
  close = vi.fn();
  confirm = vi.fn();
  disconnectEth = vi.fn().mockResolvedValue(undefined);
  acceptTermsOfService = vi.fn().mockResolvedValue(undefined);
  onConfirm = vi.fn().mockResolvedValue(undefined);
  harness.lifecycleHooks = { acceptTermsOfService, onConfirm };
  harness.connectors = {
    ETH: {
      config: { chainId: 11155111 },
      connectedWallet: ethWallet("metamask", ETH_ACCOUNT),
      disconnect: disconnectEth,
    },
    BTC: null,
    BBN: null,
  };
});

describe("closing the dialog", () => {
  it("leaves a connection that already succeeded intact", async () => {
    setup({ confirmed: false });

    await act(async () => {
      screen.getByText("close").click();
    });

    expect(close).toHaveBeenCalled();
    expect(disconnectEth).not.toHaveBeenCalled();
  });

  it("writes no confirmation receipt, so the session cannot be restored silently", async () => {
    setup({ confirmed: false });

    await act(async () => {
      screen.getByText("close").click();
    });

    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });
});

describe("confirming the dialog", () => {
  it("accepts the terms once, on confirm rather than on wallet connect", async () => {
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    expect(acceptTermsOfService).toHaveBeenCalledWith(
      expect.objectContaining({ chain: "ETH", address: ETH_ACCOUNT.address }),
    );
    expect(confirm).toHaveBeenCalled();
  });

  it("identifies the session by the first required chain, not the first connected wallet", async () => {
    const btc = btcWallet("unisat", BTC_ACCOUNT);
    const eth = ethWallet("metamask", ETH_ACCOUNT);
    harness.connectors = {
      BTC: { config: { network: "signet" }, connectedWallet: btc, disconnect: vi.fn() },
      ETH: { config: { chainId: 11155111 }, connectedWallet: eth, disconnect: disconnectEth },
      BBN: null,
    };
    setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: btc, ETH: eth },
    });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).toHaveBeenCalledWith(
      expect.objectContaining({ chain: "ETH", public_key: ETH_ACCOUNT.publicKeyHex }),
    );
  });

  it("stores a receipt covering the required chains", async () => {
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!)).toMatchObject({
      version: 2,
      entries: [{ chain: "ETH", walletId: "metamask", network: "11155111" }],
    });
  });

  it("stores no receipt when sessions are not persisted", async () => {
    setup({ persistent: false });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });

  it("skips the terms hook when the session is already confirmed", async () => {
    setup({ confirmed: true });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("does not confirm the session when the terms hook rejects", async () => {
    acceptTermsOfService.mockRejectedValue(new Error("terms declined"));
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("stops when the active connector changes while the selected wallet stays stale", async () => {
    const pending = deferred();
    const selectedWallet = ethWallet("metamask", ETH_ACCOUNT);
    const connector = {
      config: { chainId: 11155111 },
      connectedWallet: selectedWallet,
      disconnect: disconnectEth,
    };
    acceptTermsOfService.mockReturnValue(pending.promise);
    harness.connectors = { ...harness.connectors, ETH: connector };
    setup({ selectedWallets: { ETH: selectedWallet } });

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    connector.connectedWallet = ethWallet("rabby", { ...ETH_ACCOUNT, address: "0xchanged" });
    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("stops when the account changes during a live network read", async () => {
    const networkRead = deferred<number>();
    const getChainId = vi
      .fn()
      .mockResolvedValueOnce(11155111)
      .mockResolvedValueOnce(11155111)
      .mockReturnValueOnce(networkRead.promise)
      .mockResolvedValue(11155111);
    const connectedWallet = wallet("metamask", ETH_ACCOUNT);
    connectedWallet.provider = { getChainId } as unknown as IWallet["provider"];
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup({ selectedWallets: { ETH: connectedWallet } });

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(getChainId).toHaveBeenCalledTimes(3);
    });

    connectedWallet.account = { ...ETH_ACCOUNT, address: "0xchanged" };
    await act(async () => {
      networkRead.resolve(11155111);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("rejects a stable live network that differs from the configured network", async () => {
    const connectedWallet = wallet("metamask", ETH_ACCOUNT);
    connectedWallet.provider = {
      getChainId: vi.fn().mockResolvedValue(1),
    } as unknown as IWallet["provider"];
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup({ selectedWallets: { ETH: connectedWallet } });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it.each(["ETH", "BTC", "BBN"] as const)("rejects an active %s wallet that has no provider", async (chain) => {
    const connectedWallet = wallet(
      chain === "ETH" ? "metamask" : chain === "BTC" ? "unisat" : "keplr",
      chain === "ETH" ? ETH_ACCOUNT : chain === "BTC" ? BTC_ACCOUNT : BBN_ACCOUNT,
    );
    connectedWallet.provider = null;
    harness.connectors = {
      ETH: null,
      BTC: null,
      BBN: null,
      [chain]: {
        config:
          chain === "ETH" ? { chainId: 11155111 } : chain === "BTC" ? { network: "signet" } : { chainId: "bbn-test-5" },
        connectedWallet,
        disconnect: vi.fn(),
      },
    };
    setup({ requiredChainIds: [chain], selectedWallets: { [chain]: connectedWallet } });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("passes one immutable connection snapshot to both hooks", async () => {
    acceptTermsOfService.mockImplementation(async ({ connections }: TermsOfServiceParams) => {
      expect(Object.isFrozen(connections)).toBe(true);
      expect(Object.isFrozen(connections[0])).toBe(true);
      expect(Object.isFrozen(connections[0].account)).toBe(true);
      expect(Object.isFrozen(connections[0].wallet)).toBe(true);
      expect(() => {
        connections[0].account.address = "0xchanged";
      }).toThrow();
    });
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(onConfirm.mock.calls[0][0]).toBe(acceptTermsOfService.mock.calls[0][0].connections);
    expect(onConfirm.mock.calls[0][0][0].account.address).toBe(ETH_ACCOUNT.address);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it.each(["wallet", "address", "public key", "configured network", "live network", "disconnect"] as const)(
    "stops when the %s changes during terms approval",
    async (change) => {
      const pending = deferred();
      let liveChainId = 11155111;
      const selectedWallet = wallet("metamask", ETH_ACCOUNT);
      selectedWallet.provider = {
        getChainId: vi.fn(async () => liveChainId),
      } as unknown as IWallet["provider"];
      const connector = {
        config: { chainId: 11155111 },
        connectedWallet: selectedWallet,
        disconnect: disconnectEth,
      };
      acceptTermsOfService.mockReturnValue(pending.promise);
      harness.connectors = {
        ...harness.connectors,
        ETH: connector,
      };
      setup({ selectedWallets: { ETH: selectedWallet } });

      act(() => {
        screen.getByText("confirm").click();
      });
      await waitFor(() => {
        expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
      });

      switch (change) {
        case "wallet":
          selectedWallet.id = "rabby";
          break;
        case "address":
          selectedWallet.account = { ...ETH_ACCOUNT, address: "0xchanged" };
          break;
        case "public key":
          selectedWallet.account = { ...ETH_ACCOUNT, publicKeyHex: `04${"c".repeat(64)}` };
          break;
        case "configured network":
          connector.config.chainId = 1;
          break;
        case "live network":
          liveChainId = 1;
          break;
        case "disconnect":
          selectedWallet.account = null;
          break;
      }

      await act(async () => {
        pending.resolve();
      });

      expect(confirm).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
    },
  );

  it("stops when the wallet keeps its serialized identity but changes provider", async () => {
    const pending = deferred();
    const connectedWallet = ethWallet("metamask", ETH_ACCOUNT);
    acceptTermsOfService.mockReturnValue(pending.promise);
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup({ selectedWallets: { ETH: connectedWallet } });

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    connectedWallet.provider = {
      getChainId: vi.fn().mockResolvedValue(11155111),
    } as unknown as IWallet["provider"];
    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("stops when the identity changes during the confirmation hook", async () => {
    const pending = deferred();
    let chainId = 11155111;
    const selectedWallet = wallet("metamask", ETH_ACCOUNT);
    selectedWallet.provider = {
      getChainId: vi.fn(async () => chainId),
    } as unknown as IWallet["provider"];
    onConfirm.mockReturnValue(pending.promise);
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId }, connectedWallet: selectedWallet, disconnect: disconnectEth },
    };
    setup({ selectedWallets: { ETH: selectedWallet } });

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    chainId = 1;
    await act(async () => {
      pending.resolve();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("runs one confirmation when the user submits twice", async () => {
    const pending = deferred();
    acceptTermsOfService.mockReturnValue(pending.promise);
    setup();

    act(() => {
      screen.getByText("confirm").click();
      screen.getByText("confirm").click();
    });

    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toBe(acceptTermsOfService.mock.calls[0][0].connections);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not confirm when the user closes the dialog during a hook", async () => {
    const pending = deferred();
    acceptTermsOfService.mockReturnValue(pending.promise);
    setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });
    act(() => {
      screen.getByText("close").click();
    });

    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("starts a new attempt after close and reopen while the old hook stays pending", async () => {
    const oldHook = deferred();
    const newHook = deferred();
    acceptTermsOfService.mockReturnValueOnce(oldHook.promise).mockReturnValueOnce(newHook.promise);
    const view = setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    act(() => {
      screen.getByText("close").click();
    });
    harness.widgetState = { ...harness.widgetState, visible: false };
    view.rerender(<WalletDialog persistent storage={storage} config={[]} />);
    harness.widgetState = { ...harness.widgetState, visible: true };
    view.rerender(<WalletDialog persistent storage={storage} config={[]} />);
    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      newHook.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);

    await act(async () => {
      oldHook.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not let an old finally release a new attempt", async () => {
    const oldHook = deferred();
    const newHook = deferred();
    acceptTermsOfService.mockReturnValueOnce(oldHook.promise).mockReturnValueOnce(newHook.promise);
    setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });
    act(() => {
      screen.getByText("close").click();
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      oldHook.resolve();
    });
    act(() => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).toHaveBeenCalledTimes(2);

    await act(async () => {
      newHook.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("invalidates and releases an attempt after visibility is committed as hidden", async () => {
    const oldHook = deferred();
    const newHook = deferred();
    acceptTermsOfService.mockReturnValueOnce(oldHook.promise).mockReturnValueOnce(newHook.promise);
    const view = setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    harness.widgetState = { ...harness.widgetState, visible: false };
    view.rerender(<WalletDialog persistent storage={storage} config={[]} />);
    harness.widgetState = { ...harness.widgetState, visible: true };
    view.rerender(<WalletDialog persistent storage={storage} config={[]} />);
    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      oldHook.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();

    await act(async () => {
      newHook.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not confirm after the dialog unmounts during a hook", async () => {
    const pending = deferred();
    acceptTermsOfService.mockReturnValue(pending.promise);
    const view = setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });
    view.unmount();

    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("records the optional chains the user also had connected, so navigation cannot invalidate the approval", async () => {
    harness.connectors = {
      ...harness.connectors,
      BTC: { config: { network: "signet" }, connectedWallet: btcWallet("unisat", BTC_ACCOUNT), disconnect: vi.fn() },
    };
    setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: wallet("unisat", BTC_ACCOUNT), ETH: wallet("metamask", ETH_ACCOUNT) },
    });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(
      JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!).entries.map((e: { chain: string }) => e.chain),
    ).toEqual(["BTC", "ETH"]);
  });

  it("refuses to confirm a required chain whose wallet has no account, rather than confirming with nothing recorded", async () => {
    const onError = vi.fn();
    harness.connectors = {
      ...harness.connectors,
      ETH: {
        config: { chainId: 11155111 },
        connectedWallet: { id: "metamask", name: "metamask", account: null } as IWallet,
        disconnect: disconnectEth,
      },
    };
    harness.widgetState = {
      visible: true,
      screen: { type: "CHAINS" },
      confirmed: false,
      selectedWallets: { ETH: { id: "metamask", name: "metamask" } as IWallet },
      requiredChainIds: ["ETH"],
      close,
      confirm,
      displayChains: vi.fn(),
      displayError: vi.fn(),
    };
    render(<WalletDialog persistent storage={storage} config={[]} onError={onError} />);

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ETH") }));
  });
});
