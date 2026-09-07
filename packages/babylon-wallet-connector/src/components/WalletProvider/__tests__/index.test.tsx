import { render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeEthAppKitModal: vi.fn(),
  initializeUnifiedAppKitModal: vi.fn(),
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

vi.mock("@/core/wallets/eth", () => ({
  default: {},
}));

vi.mock("@/context/Chain.context", () => ({
  ChainProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock("@/widgets/tomo/BBNConnector", () => ({ TomoBBNConnector: () => null }));
vi.mock("@/widgets/tomo/BTCConnector", () => ({ TomoBTCConnector: () => null }));
vi.mock("../components/WalletDialog", () => ({ WalletDialog: () => null }));

import { WalletProvider } from "../index";
import { WalletProvider as ETHWalletProvider } from "../../ETHWalletConnectorProvider";

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
