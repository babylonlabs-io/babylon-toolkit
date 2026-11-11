import { render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeEthAppKitModal: vi.fn(),
  initializeUnifiedAppKitModal: vi.fn(),
  chainProviderMetadata: { current: undefined as unknown },
}));

vi.mock("@/core/wallets/appkit/appKitModal", () => ({
  initializeAppKitModal: mocks.initializeUnifiedAppKitModal,
}));

vi.mock("@/core/wallets/eth/appkit/modal", () => ({
  initializeAppKitModal: mocks.initializeEthAppKitModal,
}));

vi.mock("@/core/storage", () => ({
  createAccountStorage: vi.fn(() => ({})),
}));

vi.mock("@/core/wallets", () => ({
  default: {},
}));

vi.mock("@/core/wallets/btc", () => ({
  default: {},
}));

vi.mock("@/core/wallets/eth", () => ({
  default: {},
}));

vi.mock("@/context/Chain.context", () => ({
  ChainProvider: ({ children, metadata }: { children: ReactNode; metadata: unknown }) => {
    mocks.chainProviderMetadata.current = metadata;
    return <>{children}</>;
  },
}));

vi.mock("@/context/LifecycleHooks.context", () => ({
  LifeCycleHooksProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/context/TomoProvider", () => ({
  TomoConnectionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/appkit/useAppKitOpenListener", () => ({
  useAppKitOpenListener: vi.fn(),
}));

vi.mock("@/widgets/tomo/BBNConnector", () => ({ TomoBBNConnector: () => <span>tomo-bbn-connector</span> }));
vi.mock("@/widgets/tomo/BTCConnector", () => ({ TomoBTCConnector: () => <span>tomo-btc-connector</span> }));
vi.mock("../components/WalletDialog", () => ({ WalletDialog: () => null }));

import { WalletProvider as BTCETHWalletProvider } from "../../BTCETHWalletConnectorProvider";
import { WalletProvider as ETHWalletProvider } from "../../ETHWalletConnectorProvider";
import { WalletProvider } from "../index";

const metadata = {
  name: "Test App",
  description: "Test AppKit",
  url: "https://example.com",
  icons: [],
};

const ethChain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.example.com"] } },
};
const unifiedAppKitConfig = { projectId: "project", metadata };
const ethAppKitConfig = { ...unifiedAppKitConfig, eth: { chain: ethChain } };
const nextUnifiedAppKitConfig = { ...unifiedAppKitConfig, projectId: "next-project" };
const nextEthAppKitConfig = { ...ethAppKitConfig, projectId: "next-project" };

function ErrorHost({
  children,
  enabled = true,
}: {
  children: (onError?: (error: Error) => void) => ReactNode;
  enabled?: boolean;
}) {
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <>
      {children(enabled ? (error) => setMessages((current) => [...current, error.message]) : undefined)}
      <output>{messages.join("|")}</output>
    </>
  );
}

describe("WalletProvider AppKit initialization", () => {
  beforeEach(() => {
    mocks.initializeEthAppKitModal.mockReset();
    mocks.initializeUnifiedAppKitModal.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports each unified initialization failure after commit", async () => {
    const errorMessage = "AppKit capability mismatch";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.initializeUnifiedAppKitModal.mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const view = render(
      <ErrorHost>
        {(onError) => (
          <WalletProvider config={[]} appKitConfig={unifiedAppKitConfig} disableTomo onError={onError}>
            child
          </WalletProvider>
        )}
      </ErrorHost>,
    );

    expect(await screen.findByText(errorMessage)).toBeTruthy();
    expect(mocks.initializeUnifiedAppKitModal).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("Failed to initialize AppKit modal:", errorMessage);
    expect(consoleError).toHaveBeenCalledTimes(1);

    view.rerender(
      <ErrorHost>
        {(onError) => (
          <WalletProvider config={[]} appKitConfig={nextUnifiedAppKitConfig} disableTomo onError={onError}>
            child
          </WalletProvider>
        )}
      </ErrorHost>,
    );

    expect(await screen.findByText(`${errorMessage}|${errorMessage}`)).toBeTruthy();
    expect(mocks.initializeUnifiedAppKitModal).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("renders the Tomo connectors unless Tomo is disabled", () => {
    const view = render(<WalletProvider config={[]}>child</WalletProvider>);

    expect(screen.getByText("tomo-btc-connector")).toBeTruthy();
    expect(screen.getByText("tomo-bbn-connector")).toBeTruthy();

    view.rerender(
      <WalletProvider config={[]} disableTomo>
        child
      </WalletProvider>,
    );

    expect(screen.queryByText("tomo-btc-connector")).toBeNull();
    expect(screen.queryByText("tomo-bbn-connector")).toBeNull();
  });

  it("offers the Bitcoin and Ethereum chains and no Tomo connector from the Bitcoin-Ethereum entry", () => {
    render(<BTCETHWalletProvider config={[]}>child</BTCETHWalletProvider>);

    expect(Object.keys(mocks.chainProviderMetadata.current as object)).toEqual(["BTC", "ETH"]);
    expect(screen.queryByText("tomo-btc-connector")).toBeNull();
    expect(screen.queryByText("tomo-bbn-connector")).toBeNull();
  });

  it("reports each Ethereum-only initialization failure after commit", async () => {
    const error = new Error("Ethereum AppKit capability mismatch");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.initializeEthAppKitModal.mockImplementation(() => {
      throw error;
    });

    const view = render(
      <ErrorHost enabled={false}>
        {(onError) => (
          <ETHWalletProvider config={[]} appKitConfig={ethAppKitConfig} onError={onError}>
            child
          </ETHWalletProvider>
        )}
      </ErrorHost>,
    );

    expect(mocks.initializeEthAppKitModal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(error.message)).toBeNull();

    view.rerender(
      <ErrorHost>
        {(onError) => (
          <ETHWalletProvider config={[]} appKitConfig={ethAppKitConfig} onError={onError}>
            child
          </ETHWalletProvider>
        )}
      </ErrorHost>,
    );

    expect(await screen.findByText(error.message)).toBeTruthy();
    expect(mocks.initializeEthAppKitModal).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    view.rerender(
      <ErrorHost>
        {(onError) => (
          <ETHWalletProvider config={[]} appKitConfig={nextEthAppKitConfig} onError={onError}>
            child
          </ETHWalletProvider>
        )}
      </ErrorHost>,
    );

    expect(await screen.findByText(`${error.message}|${error.message}`)).toBeTruthy();
    expect(mocks.initializeEthAppKitModal).toHaveBeenCalledTimes(2);
  });
});
