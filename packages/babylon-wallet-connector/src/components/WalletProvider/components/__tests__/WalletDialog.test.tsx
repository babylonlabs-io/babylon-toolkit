import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TermsOfServiceParams } from "@/context/LifecycleHooks.context";
import { WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { Account, HashMap, IWallet } from "@/core/types";
import { Wallet } from "@/core/Wallet";

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

function wallet(id: string, account: Account | null): IWallet {
  const connectedWallet: IWallet = new Wallet({
    id,
    name: id,
    icon: `${id}-icon`,
    docs: `${id}-docs`,
    networks: [],
    origin: null,
    provider: null,
  });
  connectedWallet.account = account;
  return connectedWallet;
}

function ethWallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  const connectedWallet = wallet(id, account);
  connectedWallet.provider = {
    getAddress: vi.fn().mockResolvedValue(account.address),
    getPublicKeyHex: vi.fn().mockResolvedValue(account.publicKeyHex),
    getChainId: vi.fn().mockResolvedValue(11155111),
  } as unknown as IWallet["provider"];
  return connectedWallet;
}

function btcWallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  const connectedWallet = wallet(id, account);
  connectedWallet.provider = {
    getAddress: vi.fn().mockResolvedValue(account.address),
    getPublicKeyHex: vi.fn().mockResolvedValue(account.publicKeyHex),
    getNetwork: vi.fn().mockResolvedValue("signet"),
  } as unknown as IWallet["provider"];
  return connectedWallet;
}

function bbnWallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  const connectedWallet = wallet(id, account);
  connectedWallet.provider = {
    getAddress: vi.fn().mockResolvedValue(account.address),
    getPublicKeyHex: vi.fn().mockResolvedValue(account.publicKeyHex),
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
let displayError: ReturnType<typeof vi.fn>;
let onError: (error: Error) => void;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function providerMocks(connectedWallet: IWallet) {
  return connectedWallet.provider as unknown as {
    getAddress: ReturnType<typeof vi.fn>;
    getPublicKeyHex: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
    getNetwork: ReturnType<typeof vi.fn>;
  };
}

function setup({ confirmed = false, requiredChainIds = ["ETH"], persistent = true } = {}) {
  harness.widgetState = {
    visible: true,
    screen: { type: "CHAINS" },
    confirmed,
    requiredChainIds,
    close,
    confirm,
    displayChains: vi.fn(),
    displayError,
  };

  return render(<WalletDialog persistent={persistent} storage={storage} config={[]} onError={onError} />);
}

async function beginTermsApproval(pending: { promise: Promise<void> }) {
  acceptTermsOfService.mockReturnValue(pending.promise);
  setup();
  act(() => screen.getByText("confirm").click());
  await waitFor(() => expect(acceptTermsOfService).toHaveBeenCalledTimes(1));
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
  displayError = vi.fn();
  onError = vi.fn();
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
    setup({ requiredChainIds: ["ETH"] });

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

  it("stops when the active connector changes during terms approval", async () => {
    const pending = deferred();
    const selectedWallet = ethWallet("metamask", ETH_ACCOUNT);
    const connector = {
      config: { chainId: 11155111 },
      connectedWallet: selectedWallet,
      disconnect: disconnectEth,
    };
    acceptTermsOfService.mockReturnValue(pending.promise);
    harness.connectors = { ...harness.connectors, ETH: connector };
    setup();

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
  });

  it("stops when the account changes during a live network read", async () => {
    const networkRead = deferred<number>();
    const getAddress = vi.fn().mockResolvedValue(ETH_ACCOUNT.address);
    const getChainId = vi.fn().mockReturnValue(networkRead.promise);
    const connectedWallet = wallet("metamask", ETH_ACCOUNT);
    connectedWallet.provider = {
      getAddress,
      getPublicKeyHex: vi.fn().mockResolvedValue(ETH_ACCOUNT.publicKeyHex),
      getChainId,
    } as unknown as IWallet["provider"];
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(getChainId).toHaveBeenCalledTimes(1);
    });

    getAddress.mockResolvedValue("0xchanged");
    await act(async () => {
      networkRead.resolve(11155111);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(displayError).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Wallet changed while confirming" }),
    );
  });

  it("rejects a stable live network that differs from the configured network", async () => {
    const connectedWallet = wallet("metamask", ETH_ACCOUNT);
    connectedWallet.provider = {
      getAddress: vi.fn().mockResolvedValue(ETH_ACCOUNT.address),
      getPublicKeyHex: vi.fn().mockResolvedValue(ETH_ACCOUNT.publicKeyHex),
      getChainId: vi.fn().mockResolvedValue(1),
    } as unknown as IWallet["provider"];
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(acceptTermsOfService).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects a required wallet without a provider", async () => {
    const connectedWallet = wallet("metamask", ETH_ACCOUNT);
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup();

    await act(async () => screen.getByText("confirm").click());

    expect(confirm).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ETH") }));
  });

  it("checks a BBN account without reading a network", async () => {
    const connectedWallet = bbnWallet("keplr", BBN_ACCOUNT);
    harness.connectors = {
      ETH: null,
      BTC: null,
      BBN: { config: { chainId: "bbn-test-5" }, connectedWallet, disconnect: vi.fn() },
    };
    setup({ requiredChainIds: ["BBN"] });

    await act(async () => screen.getByText("confirm").click());

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("passes complete mutable wallet copies to both hooks", async () => {
    const liveWallet = (harness.connectors.ETH as { connectedWallet: IWallet }).connectedWallet;
    providerMocks(liveWallet).getAddress.mockResolvedValue(ETH_ACCOUNT.address.toUpperCase());
    providerMocks(liveWallet).getPublicKeyHex.mockResolvedValue(ETH_ACCOUNT.publicKeyHex.toUpperCase());
    acceptTermsOfService.mockImplementation(async ({ connections }: TermsOfServiceParams) => {
      connections[0].account.address = "0xchanged";
      connections[0].wallet.name = "changed";
    });
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    const termsConnections = acceptTermsOfService.mock.calls[0][0].connections;
    const confirmationConnections = onConfirm.mock.calls[0][0];
    expect(Object.isFrozen(termsConnections)).toBe(false);
    expect(Object.isFrozen(termsConnections[0])).toBe(false);
    expect(acceptTermsOfService.mock.calls[0][0].address).toBe(ETH_ACCOUNT.address.toUpperCase());
    expect(acceptTermsOfService.mock.calls[0][0].public_key).toBe(ETH_ACCOUNT.publicKeyHex.toUpperCase());
    expect(confirmationConnections[0].account.address).toBe(ETH_ACCOUNT.address.toUpperCase());
    expect(confirmationConnections[0].account.publicKeyHex).toBe(ETH_ACCOUNT.publicKeyHex.toUpperCase());
    expect(JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!).entries[0].address).toBe(
      ETH_ACCOUNT.address.toUpperCase(),
    );
    expect(liveWallet.account?.address).toBe(ETH_ACCOUNT.address);

    for (const connections of [termsConnections, confirmationConnections]) {
      const hookWallet = connections[0].wallet;
      expect(hookWallet.icon).toBe("metamask-icon");
      expect(hookWallet.docs).toBe("metamask-docs");
      expect(hookWallet.installed).toBe(true);
      expect(hookWallet.label).toBe("Installed");
    }
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("stops when the live address changes during terms approval", async () => {
    const pending = deferred();
    const connectedWallet = (harness.connectors.ETH as { connectedWallet: IWallet }).connectedWallet;
    await beginTermsApproval(pending);

    providerMocks(connectedWallet).getAddress.mockResolvedValue("0xchanged");
    await act(async () => pending.resolve());

    expect(confirm).not.toHaveBeenCalled();
    expect(displayError).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Wallet changed while confirming" }),
    );
  });

  it("stops when the live public key changes during terms approval", async () => {
    const pending = deferred();
    const connectedWallet = (harness.connectors.ETH as { connectedWallet: IWallet }).connectedWallet;
    await beginTermsApproval(pending);

    providerMocks(connectedWallet).getPublicKeyHex.mockResolvedValue(`04${"c".repeat(64)}`);
    await act(async () => pending.resolve());

    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops when the configured network changes during terms approval", async () => {
    const pending = deferred();
    const connector = harness.connectors.ETH as { config: { chainId: number } };
    await beginTermsApproval(pending);

    connector.config.chainId = 1;
    await act(async () => pending.resolve());

    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops when the live provider disconnects during terms approval", async () => {
    const pending = deferred();
    const connectedWallet = (harness.connectors.ETH as { connectedWallet: IWallet }).connectedWallet;
    await beginTermsApproval(pending);

    providerMocks(connectedWallet).getAddress.mockRejectedValue(new Error("Wallet not connected"));
    await act(async () => pending.resolve());

    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops when the wallet keeps its serialized identity but changes provider", async () => {
    const pending = deferred();
    const connectedWallet = ethWallet("metamask", ETH_ACCOUNT);
    acceptTermsOfService.mockReturnValue(pending.promise);
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId: 11155111 }, connectedWallet, disconnect: disconnectEth },
    };
    setup();

    act(() => {
      screen.getByText("confirm").click();
    });
    await waitFor(() => {
      expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
    });

    connectedWallet.provider = {
      getAddress: vi.fn().mockResolvedValue(ETH_ACCOUNT.address),
      getPublicKeyHex: vi.fn().mockResolvedValue(ETH_ACCOUNT.publicKeyHex),
      getChainId: vi.fn().mockResolvedValue(11155111),
    } as unknown as IWallet["provider"];
    await act(async () => {
      pending.resolve();
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops when the live network changes during the confirmation hook", async () => {
    const pending = deferred();
    let chainId = 11155111;
    const selectedWallet = wallet("metamask", ETH_ACCOUNT);
    selectedWallet.provider = {
      getAddress: vi.fn().mockResolvedValue(ETH_ACCOUNT.address),
      getPublicKeyHex: vi.fn().mockResolvedValue(ETH_ACCOUNT.publicKeyHex),
      getChainId: vi.fn(async () => chainId),
    } as unknown as IWallet["provider"];
    onConfirm.mockReturnValue(pending.promise);
    harness.connectors = {
      ...harness.connectors,
      ETH: { config: { chainId }, connectedWallet: selectedWallet, disconnect: disconnectEth },
    };
    setup();

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
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(["required chains", "persistence", "storage"] as const)(
    "invalidates an awaited confirmation when %s change",
    async (change) => {
      const pending = deferred();
      acceptTermsOfService.mockReturnValue(pending.promise);
      const view = setup();

      act(() => {
        screen.getByText("confirm").click();
      });
      await waitFor(() => {
        expect(acceptTermsOfService).toHaveBeenCalledTimes(1);
      });

      let nextPersistent = true;
      let nextStorage = storage;
      if (change === "required chains") {
        harness.widgetState = { ...harness.widgetState, requiredChainIds: ["ETH", "BTC"] };
      } else if (change === "persistence") {
        nextPersistent = false;
      } else {
        nextStorage = { ...storage } as HashMap;
      }
      view.rerender(<WalletDialog persistent={nextPersistent} storage={nextStorage} config={[]} />);

      await act(async () => {
        pending.resolve();
      });

      expect(onConfirm).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
    },
  );

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
  });

  it("keeps confirmation active when an original optional wallet becomes unavailable", async () => {
    const pending = deferred();
    const optionalWallet = btcWallet("unisat", BTC_ACCOUNT);
    harness.connectors = {
      ...harness.connectors,
      BTC: { config: { network: "signet" }, connectedWallet: optionalWallet, disconnect: vi.fn() },
    };
    acceptTermsOfService.mockReturnValue(pending.promise);
    setup();

    act(() => screen.getByText("confirm").click());
    await waitFor(() => expect(acceptTermsOfService).toHaveBeenCalledTimes(1));
    providerMocks(optionalWallet).getNetwork.mockRejectedValue(new Error("wallet unavailable"));
    await act(async () => pending.resolve());

    expect(
      JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!).entries.map((e: { chain: string }) => e.chain),
    ).toEqual(["BTC", "ETH"]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "wallet unavailable" }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("ignores an optional wallet connected during terms approval", async () => {
    const pending = deferred();
    await beginTermsApproval(pending);

    harness.connectors.BTC = {
      config: { network: "signet" },
      connectedWallet: btcWallet("unisat", BTC_ACCOUNT),
      disconnect: vi.fn(),
    };
    await act(async () => pending.resolve());

    expect(onConfirm.mock.calls[0][0].map(({ chain }: { chain: string }) => chain)).toEqual(["ETH"]);
    expect(JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!).entries).toEqual([
      expect.objectContaining({ chain: "ETH" }),
    ]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("refuses to confirm a required chain whose wallet has no account, rather than confirming with nothing recorded", async () => {
    const connectedWallet = wallet("metamask", null);
    harness.connectors = {
      ...harness.connectors,
      ETH: {
        config: { chainId: 11155111 },
        connectedWallet,
        disconnect: disconnectEth,
      },
    };
    setup();

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ETH") }));
  });
});
