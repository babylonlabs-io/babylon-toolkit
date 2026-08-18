import { act, renderHook } from "@testing-library/react";
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

function wallet(id: string, account: Account): IWallet {
  return { id, name: id, account } as IWallet;
}

let store: Map<string, string>;
let storage: HashMap;
let confirm: ReturnType<typeof vi.fn>;
let unconfirm: ReturnType<typeof vi.fn>;

function liveConnectors() {
  return {
    BTC: { id: "BTC", config: { network: "signet" }, connectedWallet: wallet("unisat", BTC_ACCOUNT), on: () => () => {} },
    BBN: { id: "BBN", config: { chainId: "bbn-test" }, connectedWallet: wallet("keplr", BBN_ACCOUNT), on: () => () => {} },
    ETH: null,
  };
}

function render(requiredChainIds: string[], confirmed: boolean) {
  harness.widgetState = {
    confirmed,
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

  return renderHook(() => useWalletConnectors({ persistent: true, accountStorage: storage }));
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
  harness.connectors = liveConnectors();
  // Both chains connected and previously approved together, as after pressing
  // Connect on a route that requires both.
  store.set("BTC", "unisat");
  store.set("BBN", "keplr");
  store.set(
    WALLET_CONFIRMATION_RECEIPT_KEY,
    createConfirmationReceipt(
      [
        { chain: "BTC", wallet: wallet("unisat", BTC_ACCOUNT), account: BTC_ACCOUNT },
        { chain: "BBN", wallet: wallet("keplr", BBN_ACCOUNT), account: BBN_ACCOUNT },
      ],
      harness.connectors as never,
    ),
  );
});

// simple-staking derives requiredChains from the route: ["BTC","BBN"] on the
// main routes, ["BBN"] under /baby. Navigating between them must not touch the
// session.
describe("requirements that change with the route", () => {
  it("keeps the confirmation when the required set narrows", () => {
    const { rerender } = render(["BTC", "BBN"], true);
    act(() => rerender());

    render(["BBN"], true);
    act(() => rerender());

    expect(unconfirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);
  });

  it("keeps the confirmation when the required set widens back to an approved chain", () => {
    render(["BBN"], true);
    render(["BTC", "BBN"], true);

    expect(unconfirm).not.toHaveBeenCalled();
    expect(store.has(WALLET_CONFIRMATION_RECEIPT_KEY)).toBe(true);
  });

  it("restores the confirmation on a cold start under the narrowed requirements", () => {
    render(["BBN"], false);

    expect(confirm).toHaveBeenCalled();
  });

  it("restores the confirmation on a cold start under the widened requirements", () => {
    render(["BTC", "BBN"], false);

    expect(confirm).toHaveBeenCalled();
  });
});

describe("an approval that stops covering the requirements", () => {
  it("withdraws the confirmation when a chain the user never approved becomes required", () => {
    harness.connectors = {
      ...liveConnectors(),
      ETH: {
        id: "ETH",
        config: { chainId: 11155111 },
        connectedWallet: wallet("metamask", { address: "0xlate", publicKeyHex: `04${"c".repeat(64)}` }),
        on: () => () => {},
      },
    };
    store.set("ETH", "metamask");

    render(["BTC", "BBN", "ETH"], true);

    expect(unconfirm).toHaveBeenCalled();
  });

  it("withdraws the confirmation when a required account changes underneath it", () => {
    harness.connectors = {
      ...liveConnectors(),
      BBN: {
        id: "BBN",
        config: { chainId: "bbn-test" },
        connectedWallet: wallet("keplr", { address: "bbn1someoneelse", publicKeyHex: `03${"d".repeat(64)}` }),
        on: () => () => {},
      },
    };

    render(["BTC", "BBN"], true);

    expect(unconfirm).toHaveBeenCalled();
  });

  it("does not withdraw a confirmation that was never persisted", () => {
    store.delete(WALLET_CONFIRMATION_RECEIPT_KEY);

    render(["BTC", "BBN"], true);

    expect(unconfirm).not.toHaveBeenCalled();
  });
});

describe("the approval's lifetime", () => {
  it("re-stamps the stored approval while the session stays confirmed, so it expires with the session", () => {
    const stamps: string[] = [];
    storage.set = (k: string, v: string) => {
      stamps.push(k);
      store.set(k, v);
    };

    render(["BTC", "BBN"], true);

    expect(stamps).toContain(WALLET_CONFIRMATION_RECEIPT_KEY);
  });
});
