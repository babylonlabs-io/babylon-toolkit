import { act, renderHook, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createConfirmationReceipt, WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { Account, HashMap, IWallet } from "@/core/types";
import { useWalletConnectors } from "@/hooks/useWalletConnectors";

const harness = vi.hoisted(() => ({
  widgetState: {} as Record<string, unknown>,
  connectors: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/useWidgetState", () => ({ useWidgetState: () => harness.widgetState }));
vi.mock("@/context/Chain.context", () => ({ useChainProviders: () => harness.connectors }));
vi.mock("@/context/LifecycleHooks.context", () => ({ useLifeCycleHooks: () => ({}) }));

const BTC_ACCOUNT: Account = { address: "bc1pdepositor", publicKeyHex: `02${"a".repeat(64)}` };
const BBN_ACCOUNT: Account = { address: "bbn1depositor", publicKeyHex: `03${"b".repeat(64)}` };
const ETH_ACCOUNT: Account = { address: "0xDepositor", publicKeyHex: "" };

type EventHandler = (...args: unknown[]) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function liveProvider(account: Account, network: string | number) {
  let currentAccount = account;
  let currentNetwork = network;
  const handlers = new Map<string, Set<EventHandler>>();

  return {
    connectWallet: vi.fn(async () => {}),
    getAddress: vi.fn(async () => currentAccount.address),
    getPublicKeyHex: vi.fn(async () => currentAccount.publicKeyHex),
    getNetwork: vi.fn(async () => currentNetwork),
    getChainId: vi.fn(async () => currentNetwork),
    on: vi.fn((event: string, handler: EventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<EventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    changeAccount(next: Account) {
      currentAccount = next;
    },
    changeNetwork(next: string | number) {
      currentNetwork = next;
    },
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((handler) => handler(...args));
    },
  };
}

function wallet(id: string, account: Account, provider: ReturnType<typeof liveProvider>): IWallet {
  return { id, name: id, icon: "", docs: "", installed: true, account, provider, label: "" };
}

let store: Map<string, string>;
let storage: HashMap;
let confirm: ReturnType<typeof vi.fn>;
let unconfirm: ReturnType<typeof vi.fn>;
let approvedReceipt: string;
let btcProvider: ReturnType<typeof liveProvider>;
let bbnProvider: ReturnType<typeof liveProvider>;
let ethProvider: ReturnType<typeof liveProvider>;

function liveConnectors() {
  return {
    BTC: {
      id: "BTC",
      config: { network: "signet" },
      connectedWallet: wallet("unisat", BTC_ACCOUNT, btcProvider),
      on: () => () => {},
    },
    BBN: {
      id: "BBN",
      config: { chainId: "bbn-test" },
      connectedWallet: wallet("keplr", BBN_ACCOUNT, bbnProvider),
      on: () => () => {},
    },
    ETH: {
      id: "ETH",
      config: { chainId: 11155111 },
      connectedWallet: wallet("metamask", ETH_ACCOUNT, ethProvider),
      on: () => () => {},
    },
  };
}

function setWidgetState(requiredChainIds: string[], confirmed: boolean) {
  harness.widgetState = {
    confirmed,
    confirmationReceipt: confirmed ? approvedReceipt : undefined,
    visible: false,
    requiredChainIds,
    selectWallet: vi.fn(),
    removeWallet: vi.fn(),
    displayLoader: vi.fn(),
    displayChains: vi.fn(),
    displayError: vi.fn(),
    confirm,
    unconfirm,
  };
}

function render(requiredChainIds: string[], confirmed: boolean, persistent = true) {
  setWidgetState(requiredChainIds, confirmed);

  return renderHook(() => useWalletConnectors({ persistent, accountStorage: storage }));
}

beforeEach(() => {
  store = new Map();
  storage = {
    get: (k: string) => store.get(k),
    set: (k: string, v: string) => void store.set(k, v),
    has: (k: string) => store.has(k),
    delete: (k: string) => void store.delete(k),
  } as unknown as HashMap;
  confirm = vi.fn();
  unconfirm = vi.fn();
  btcProvider = liveProvider(BTC_ACCOUNT, "signet");
  bbnProvider = liveProvider(BBN_ACCOUNT, "bbn-test");
  ethProvider = liveProvider(ETH_ACCOUNT, 11155111);
  harness.connectors = liveConnectors();
  // Both chains connected and previously approved together, as after pressing
  // Connect on a route that requires both.
  store.set("BTC", "unisat");
  store.set("BBN", "keplr");
  approvedReceipt = createConfirmationReceipt(
    [
      { chain: "BTC", wallet: wallet("unisat", BTC_ACCOUNT, btcProvider), account: BTC_ACCOUNT },
      { chain: "BBN", wallet: wallet("keplr", BBN_ACCOUNT, bbnProvider), account: BBN_ACCOUNT },
      { chain: "ETH", wallet: wallet("metamask", ETH_ACCOUNT, ethProvider), account: ETH_ACCOUNT },
    ],
    harness.connectors as never,
  );
  store.set(WALLET_CONFIRMATION_RECEIPT_KEY, approvedReceipt);
});

// simple-staking derives requiredChains from the route: ["BTC","BBN"] on the
// main routes, ["BBN"] under /baby. Navigating between them must not touch the
// session.
describe("requirements that change with the route", () => {
  it("keeps the confirmation when the required set narrows", async () => {
    const { rerender } = render(["BTC", "BBN"], true);
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    setWidgetState(["BBN"], true);
    rerender();
    await waitFor(() => expect(bbnProvider.getAddress).toHaveBeenCalledTimes(2));

    expect(unconfirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);
  });

  it("restores an unchanged approval after the required set widens", async () => {
    const { rerender } = render(["BBN"], true);
    await waitFor(() => expect(bbnProvider.getAddress).toHaveBeenCalled());

    setWidgetState(["BTC", "BBN"], true);
    rerender();
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    expect(unconfirm).toHaveBeenCalledWith(true);
    harness.widgetState = { ...harness.widgetState, confirmed: false, confirmationReceipt: approvedReceipt };
    rerender();
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(approvedReceipt));
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);
  });

  it("restores the confirmation on a cold start under the narrowed requirements", async () => {
    render(["BBN"], false);

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(approvedReceipt));
  });

  it("restores the confirmation on a cold start under the widened requirements", async () => {
    render(["BTC", "BBN"], false);

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(approvedReceipt));
  });

  it("waits for a required wallet to reconnect before it checks stored approval", async () => {
    harness.connectors = {
      ...liveConnectors(),
      BTC: { id: "BTC", config: { network: "signet" }, connectedWallet: null, on: () => () => {} },
    };
    const { rerender } = render(["BTC"], false);
    await act(async () => {});

    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);

    harness.connectors = liveConnectors();
    rerender();

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(approvedReceipt));
  });

  it("keeps an optional event dirty while cold restore waits for a required wallet", async () => {
    const connectors = liveConnectors();
    harness.connectors = {
      ...connectors,
      ETH: { id: "ETH", config: { chainId: 11155111 }, connectedWallet: null, on: () => () => {} },
    };
    const { rerender } = render(["ETH"], false);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
    });
    harness.connectors = liveConnectors();
    rerender();
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(approvedReceipt));

    setWidgetState(["ETH"], true);
    rerender();
    setWidgetState(["BTC", "ETH"], true);
    rerender();

    expect(unconfirm).toHaveBeenCalledWith();
  });

  it("does not restore after an identity event during live validation", async () => {
    const addressRead = deferred<string>();
    btcProvider.getAddress.mockReturnValueOnce(addressRead.promise);
    render(["BTC"], false);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
    });
    await act(async () => addressRead.resolve(BTC_ACCOUNT.address));

    expect(confirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("does not restore after the dialog opens during live validation", async () => {
    const addressRead = deferred<string>();
    btcProvider.getAddress.mockReturnValueOnce(addressRead.promise);
    const { rerender } = render(["BTC"], false);
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    harness.widgetState = { ...harness.widgetState, visible: true };
    rerender();
    await act(async () => addressRead.resolve(BTC_ACCOUNT.address));

    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("an approval that stops covering the requirements", () => {
  it("withdraws the confirmation when a chain the user never approved becomes required", async () => {
    const addressRead = deferred<string>();
    btcProvider.getAddress.mockReturnValueOnce(addressRead.promise);
    approvedReceipt = createConfirmationReceipt(
      [
        { chain: "BTC", wallet: wallet("unisat", BTC_ACCOUNT, btcProvider), account: BTC_ACCOUNT },
        { chain: "BBN", wallet: wallet("keplr", BBN_ACCOUNT, bbnProvider), account: BBN_ACCOUNT },
      ],
      harness.connectors as never,
    );
    store.set(WALLET_CONFIRMATION_RECEIPT_KEY, approvedReceipt);

    render(["BTC", "BBN", "ETH"], true);

    expect(unconfirm).toHaveBeenCalled();
    await act(async () => addressRead.resolve(BTC_ACCOUNT.address));
  });

  it("withdraws before a changed optional account is read after it becomes required", async () => {
    const changedAccount = { address: "bc1psomeoneelse", publicKeyHex: `02${"d".repeat(64)}` };
    const addressRead = deferred<string>();
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    const { rerender } = render(["ETH"], true, false);
    await waitFor(() => expect(ethProvider.getAddress).toHaveBeenCalled());

    btcProvider.changeAccount(changedAccount);
    btcProvider.getAddress.mockReturnValueOnce(addressRead.promise);
    setWidgetState(["BTC", "ETH"], true);
    rerender();

    expect(unconfirm).toHaveBeenCalledWith(true);
    await act(async () => addressRead.resolve(changedAccount.address));
    expect(unconfirm).toHaveBeenCalledWith();
  });

  it("does not restore an optional account after its change event precedes adapter refresh", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    const { rerender } = render(["ETH"], true, false);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
    });
    expect(unconfirm).not.toHaveBeenCalled();

    setWidgetState(["BTC", "ETH"], true);
    rerender();

    expect(unconfirm).toHaveBeenCalledWith();
  });

  it.each([true, false])("withdraws after a live required account change when persistent is %s", async (persistent) => {
    if (!persistent) store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["BTC"], true, persistent);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
      btcProvider.emit("accountsChanged", [BTC_ACCOUNT.address]);
    });

    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("withdraws after a live required key change", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["BTC"], true, false);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.changeAccount({ address: BTC_ACCOUNT.address, publicKeyHex: `02${"d".repeat(64)}` });
      btcProvider.emit("accountsChanged", [BTC_ACCOUNT.address]);
    });

    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
  });

  it("ignores AppKit's repeated ETH account and rejects a changed account", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["ETH"], true, false);
    await waitFor(() => expect(ethProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      ethProvider.emit("accountsChanged", [ETH_ACCOUNT.address.toLowerCase()]);
    });
    await act(async () => {});

    expect(unconfirm).not.toHaveBeenCalled();

    act(() => {
      ethProvider.emit("accountsChanged", ["0xsomeoneelse"]);
    });
    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
  });

  it("withdraws after a live required network change", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["ETH"], true, false);
    await waitFor(() => expect(ethProvider.on).toHaveBeenCalledWith("chainChanged", expect.any(Function)));

    act(() => {
      ethProvider.emit("chainChanged", "0x1");
    });

    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
  });

  it("withdraws after a live required BTC network change", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["BTC"], true, false);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("networkChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("networkChanged", "mainnet");
    });

    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
  });

  it("withdraws after the required wallet changes", async () => {
    const { rerender } = render(["BTC"], true, false);
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    harness.connectors = {
      ...liveConnectors(),
      BTC: {
        id: "BTC",
        config: { network: "signet" },
        connectedWallet: wallet("okx", BTC_ACCOUNT, btcProvider),
        on: () => () => {},
      },
    };
    rerender();

    await waitFor(() => expect(unconfirm).toHaveBeenCalled());
  });

  it("keeps the confirmation after an optional wallet changes", async () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    render(["ETH"], true, false);
    await waitFor(() => expect(ethProvider.getAddress).toHaveBeenCalled());

    act(() => {
      btcProvider.changeAccount({ address: "bc1psomeoneelse", publicKeyHex: `02${"d".repeat(64)}` });
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
    });
    await act(async () => {});

    expect(unconfirm).not.toHaveBeenCalled();
  });

  it("ends the confirmation after a required provider disconnects", async () => {
    render(["BTC"], true);
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    act(() => {
      btcProvider.emit("disconnect");
    });

    expect(unconfirm).toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });

  it("removes a listener when a required wallet becomes optional", async () => {
    const { rerender } = render(["BTC", "ETH"], true);
    await waitFor(() => expect(btcProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    setWidgetState(["ETH"], true);
    rerender();
    await waitFor(() => expect(btcProvider.off).toHaveBeenCalledWith("accountsChanged", expect.any(Function)));

    act(() => {
      btcProvider.emit("accountsChanged", ["bc1psomeoneelse"]);
    });
    await act(async () => {});

    expect(unconfirm).not.toHaveBeenCalled();
    expect(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(approvedReceipt);
  });

  it("uses narrowed requirements for a disconnect fired during the same commit", async () => {
    const disconnectHandlers = new Set<(wallet: IWallet) => void>();
    const connectors = liveConnectors();
    const btcConnector = connectors.BTC;
    let disconnectInLayout = false;
    harness.connectors = {
      ...connectors,
      BTC: {
        ...btcConnector,
        on: (event: string, handler: (wallet: IWallet) => void) => {
          if (event === "disconnect") disconnectHandlers.add(handler);
          return () => disconnectHandlers.delete(handler);
        },
      },
    };
    setWidgetState(["BTC", "ETH"], true);
    const { rerender } = renderHook(() => {
      useWalletConnectors({ persistent: true, accountStorage: storage });
      useLayoutEffect(() => {
        if (!disconnectInLayout) return;
        [...disconnectHandlers].forEach((handler) => handler(btcConnector.connectedWallet));
      });
    });
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    setWidgetState(["ETH"], true);
    disconnectInLayout = true;
    rerender();

    expect(unconfirm).not.toHaveBeenCalled();
    expect(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(approvedReceipt);
  });

  it("does not restore approval after a required disconnect interrupts validation", async () => {
    const addressRead = deferred<string>();
    const disconnectHandlers = new Set<(wallet: IWallet) => void>();
    const btcConnector = liveConnectors().BTC;
    btcProvider.getAddress.mockReturnValueOnce(addressRead.promise);
    harness.connectors = {
      ...liveConnectors(),
      BTC: {
        ...btcConnector,
        on: (event: string, handler: (wallet: IWallet) => void) => {
          if (event === "disconnect") disconnectHandlers.add(handler);
          return () => disconnectHandlers.delete(handler);
        },
      },
    };
    render(["BTC"], true);
    await waitFor(() => expect(btcProvider.getAddress).toHaveBeenCalled());

    act(() => {
      disconnectHandlers.forEach((handler) => handler(btcConnector.connectedWallet));
    });
    await act(async () => addressRead.resolve(BTC_ACCOUNT.address));

    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(false);
  });
});

describe("the approval's lifetime", () => {
  it("re-stamps the stored approval while the session stays confirmed, so it expires with the session", async () => {
    const stamps: string[] = [];
    storage.set = (k: string, v: string) => {
      stamps.push(k);
      store.set(k, v);
    };

    render(["BTC", "BBN"], true);

    await waitFor(() => expect(stamps).toContain(WALLET_CONFIRMATION_RECEIPT_KEY));
  });
});
