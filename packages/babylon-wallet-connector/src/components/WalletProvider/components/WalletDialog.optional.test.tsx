import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it, vi } from "vitest";

import { Context, type Connectors } from "@/context/Chain.context";
import { LifeCycleHooksProvider } from "@/context/LifecycleHooks.context";
import { StateContext, StateProvider } from "@/context/State.context";
import { WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { HashMap, IChain, IWallet } from "@/core/types";

vi.mock("@babylonlabs-io/core-ui", () => ({
  FullScreenDialog: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
    <div>
      <button data-testid="dialog-close" onClick={onClose}>
        Close
      </button>
      {children}
    </div>
  ),
}));
vi.mock("./Screen", () => ({
  Screen: ({ onConfirm }: { onConfirm: () => void }) => (
    <button data-testid="dialog-confirm" onClick={onConfirm}>
      Confirm
    </button>
  ),
}));
vi.mock("@/hooks/useWalletConnectors", () => ({
  useWalletConnectors: () => ({ connect: vi.fn() }),
}));
vi.mock("@/hooks/useWalletWidgets", () => ({
  useWalletWidgets: () => ({}),
}));

import { WalletDialog } from "./WalletDialog";

function WalletSelectionControls({ ethWallet, btcWallet }: { ethWallet: IWallet; btcWallet: IWallet }) {
  const { removeWallet, reset, selectWallet } = useContext(StateContext);

  return (
    <>
      <button data-testid="select-eth" onClick={() => selectWallet?.("ETH", ethWallet)}>
        Select ETH
      </button>
      <button data-testid="select-btc" onClick={() => selectWallet?.("BTC", btcWallet)}>
        Select BTC
      </button>
      <button data-testid="remove-eth" onClick={() => removeWallet?.("ETH")}>
        Remove ETH
      </button>
      <button data-testid="remove-btc" onClick={() => removeWallet?.("BTC")}>
        Remove BTC
      </button>
      <button data-testid="reset-wallets" onClick={() => reset?.()}>
        Reset
      </button>
    </>
  );
}

describe("WalletDialog optional chains", () => {
  it("closes non-destructively and confirms terms with an ETH-only identity", async () => {
    const close = vi.fn();
    const confirm = vi.fn();
    const acceptTermsOfService = vi.fn(async () => {});
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const state = {
      confirmed: false,
      visible: true,
      screen: { type: "CHAINS" as const },
      selectedWallets: { ETH: ethWallet },
      chains: { BTC: { id: "BTC" }, ETH: { id: "ETH" } } as any,
      requiredChainIds: ["ETH"],
      close,
      confirm,
      displayChains: vi.fn(),
      displayError: vi.fn(),
    };
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    };
    const disconnectBTC = vi.fn();
    const disconnectETH = vi.fn();
    const connectors = {
      BTC: { disconnect: disconnectBTC },
      BBN: null,
      ETH: { disconnect: disconnectETH },
    } as unknown as Connectors;

    render(
      <Context.Provider value={connectors}>
        <StateContext.Provider value={state as any}>
          <LifeCycleHooksProvider value={{ acceptTermsOfService }}>
            <WalletDialog persistent storage={storage} config={[]} />
          </LifeCycleHooksProvider>
        </StateContext.Provider>
      </Context.Provider>,
    );

    fireEvent.click(screen.getByTestId("dialog-close"));
    expect(close).toHaveBeenCalledOnce();
    expect(disconnectBTC).not.toHaveBeenCalled();
    expect(disconnectETH).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("dialog-confirm"));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(acceptTermsOfService).toHaveBeenCalledWith({
      address: "0x123",
      public_key: "0x123",
      chain: "ETH",
      connections: [{ chain: "ETH", wallet: ethWallet, account: ethWallet.account }],
    });
    expect(storage.set).toHaveBeenCalledWith(
      WALLET_CONFIRMATION_RECEIPT_KEY,
      expect.any(String),
    );
  });

  it("requires confirmation lifecycle again when the required chain set expands", async () => {
    const acceptTermsOfService = vi.fn(async () => {});
    const onConfirm = vi.fn(async () => {});
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const btcWallet = {
      id: "btc-wallet",
      account: { address: "bc1ptest", publicKeyHex: "abcd" },
    } as IWallet;
    const chains = [
      { id: "BTC", name: "Bitcoin", wallets: [], config: {}, icon: "" },
      { id: "ETH", name: "Ethereum", wallets: [], config: {}, icon: "" },
    ] as IChain[];
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    };
    const connectors = {
      BTC: { disconnect: vi.fn() },
      BBN: null,
      ETH: { disconnect: vi.fn() },
    } as unknown as Connectors;

    const renderDialog = (requiredChainIds: string[]) => (
      <Context.Provider value={connectors}>
        <StateProvider
          chains={chains}
          requiredChainIds={requiredChainIds}
          storage={storage}
        >
          <LifeCycleHooksProvider value={{ acceptTermsOfService, onConfirm }}>
            <WalletSelectionControls ethWallet={ethWallet} btcWallet={btcWallet} />
            <WalletDialog persistent storage={storage} config={[]} />
          </LifeCycleHooksProvider>
        </StateProvider>
      </Context.Provider>
    );

    const { rerender } = render(renderDialog(["ETH"]));
    fireEvent.click(screen.getByTestId("select-eth"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    rerender(renderDialog(["ETH", "BTC"]));
    fireEvent.click(screen.getByTestId("select-btc"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(acceptTermsOfService).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenLastCalledWith([
      { chain: "ETH", wallet: ethWallet, account: ethWallet.account },
      { chain: "BTC", wallet: btcWallet, account: btcWallet.account },
    ]);
  });

  it("preserves confirmation for optional loss but invalidates it for required-chain reconnect", async () => {
    const acceptTermsOfService = vi.fn(async () => {});
    const onConfirm = vi.fn(async () => {});
    const ethWallet = {
      id: "eth-wallet",
      account: { address: "0x123", publicKeyHex: "0x123" },
    } as IWallet;
    const btcWallet = {
      id: "btc-wallet",
      account: { address: "bc1ptest", publicKeyHex: "abcd" },
    } as IWallet;
    const chains = [
      { id: "BTC", name: "Bitcoin", wallets: [], config: {}, icon: "" },
      { id: "ETH", name: "Ethereum", wallets: [], config: {}, icon: "" },
    ] as IChain[];
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    };
    const connectors = {
      BTC: { disconnect: vi.fn() },
      BBN: null,
      ETH: { disconnect: vi.fn() },
    } as unknown as Connectors;

    render(
      <Context.Provider value={connectors}>
        <StateProvider
          chains={chains}
          requiredChainIds={["ETH"]}
          storage={storage}
        >
          <LifeCycleHooksProvider value={{ acceptTermsOfService, onConfirm }}>
            <WalletSelectionControls ethWallet={ethWallet} btcWallet={btcWallet} />
            <WalletDialog persistent storage={storage} config={[]} />
          </LifeCycleHooksProvider>
        </StateProvider>
      </Context.Provider>,
    );

    fireEvent.click(screen.getByTestId("select-eth"));
    fireEvent.click(screen.getByTestId("select-btc"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    vi.mocked(storage.delete).mockClear();

    // BTC is optional: losing it leaves the confirmed ETH session intact, so
    // another modal confirmation does not replay lifecycle hooks.
    fireEvent.click(screen.getByTestId("remove-btc"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalledWith(
      WALLET_CONFIRMATION_RECEIPT_KEY,
    );

    // ETH is required: reconnecting after its loss must require a fresh,
    // explicit confirmation and lifecycle invocation.
    fireEvent.click(screen.getByTestId("remove-eth"));
    expect(storage.delete).toHaveBeenCalledWith(
      WALLET_CONFIRMATION_RECEIPT_KEY,
    );
    fireEvent.click(screen.getByTestId("select-eth"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(acceptTermsOfService).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenLastCalledWith([
      { chain: "ETH", wallet: ethWallet, account: ethWallet.account },
    ]);

    vi.mocked(storage.delete).mockClear();
    fireEvent.click(screen.getByTestId("reset-wallets"));
    expect(storage.delete).toHaveBeenCalledWith(
      WALLET_CONFIRMATION_RECEIPT_KEY,
    );
  });
});
