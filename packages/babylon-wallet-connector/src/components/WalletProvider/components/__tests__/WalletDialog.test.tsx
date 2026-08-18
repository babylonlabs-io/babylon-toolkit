import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function wallet(id: string, account: { address: string; publicKeyHex: string }): IWallet {
  return { id, name: id, account } as IWallet;
}

let store: Map<string, string>;
let storage: HashMap;
let close: ReturnType<typeof vi.fn>;
let confirm: ReturnType<typeof vi.fn>;
let disconnectEth: ReturnType<typeof vi.fn>;
let acceptTermsOfService: ReturnType<typeof vi.fn>;

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

  render(<WalletDialog persistent={persistent} storage={storage} config={[]} />);
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
  harness.lifecycleHooks = { acceptTermsOfService };
  harness.connectors = {
    ETH: { config: { chainId: 11155111 }, connectedWallet: wallet("metamask", ETH_ACCOUNT), disconnect: disconnectEth },
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
    setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: wallet("unisat", BTC_ACCOUNT), ETH: wallet("metamask", ETH_ACCOUNT) },
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
      entries: [{ chain: "ETH", walletId: "metamask" }],
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

  it("records the optional chains the user also had connected, so navigation cannot invalidate the approval", async () => {
    harness.connectors = {
      ...harness.connectors,
      BTC: { config: { network: "signet" }, connectedWallet: wallet("unisat", BTC_ACCOUNT), disconnect: vi.fn() },
    };
    setup({
      requiredChainIds: ["ETH"],
      selectedWallets: { BTC: wallet("unisat", BTC_ACCOUNT), ETH: wallet("metamask", ETH_ACCOUNT) },
    });

    await act(async () => {
      screen.getByText("confirm").click();
    });

    expect(JSON.parse(store.get(WALLET_CONFIRMATION_RECEIPT_KEY)!).entries.map((e: { chain: string }) => e.chain)).toEqual([
      "BTC",
      "ETH",
    ]);
  });

  it("refuses to confirm a required chain whose wallet has no account, rather than confirming with nothing recorded", async () => {
    const onError = vi.fn();
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
