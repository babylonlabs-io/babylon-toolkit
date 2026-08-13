import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BTCConfig, ETHConfig, HashMap } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";
import { useWidgetState } from "@/hooks/useWidgetState";

import { ChainProvider, useChainProviders, type ChainMetadataMap } from "./Chain.context";

const createWalletConnector = vi.hoisted(() => vi.fn());

vi.mock("@/core", () => ({ createWalletConnector }));
vi.mock("@/hooks/useWalletRedetection", () => ({ useWalletRedetection: () => {} }));

describe("ChainProvider optional chain initialization", () => {
  beforeEach(() => {
    createWalletConnector.mockReset();
  });

  it("keeps ETH usable when optional BTC connector construction fails", async () => {
    const ethConnector = { id: "ETH", on: vi.fn(() => () => {}), connectedWallet: null };
    createWalletConnector.mockImplementation(async ({ metadata }: { metadata: { chain: string } }) => {
      if (metadata.chain === "BTC") throw new Error("BTC unavailable");
      return ethConnector;
    });
    const onError = vi.fn();
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    };
    const metadata = {
      BTC: { chain: "BTC", name: "Bitcoin", icon: "", wallets: [] },
      ETH: { chain: "ETH", name: "Ethereum", icon: "", wallets: [] },
    } as ChainMetadataMap;
    const config = [
      { chain: "BTC" as const, config: {} as any },
      { chain: "ETH" as const, config: {} as any },
    ];
    const context = { localStorage: window.localStorage };

    const { result } = renderHook(() => ({ connectors: useChainProviders(), widget: useWidgetState() }), {
      wrapper: ({ children }) => (
        <ChainProvider
          persistent={false}
          storage={storage}
          context={context}
          config={config}
          onError={onError}
          requiredChains={["ETH"]}
          metadata={metadata}
        >
          {children}
        </ChainProvider>
      ),
    });

    await waitFor(() => expect(result.current.connectors.ETH).toBe(ethConnector));
    expect(result.current.connectors.BTC).toBeNull();
    expect(result.current.widget.requiredChainIds).toEqual(["ETH"]);
    expect(Object.keys(result.current.widget.chains)).toEqual(["ETH"]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "BTC unavailable" }));
  });

  it("keeps a required chain unsatisfiable and names it on the error when its connector fails", async () => {
    createWalletConnector.mockImplementation(async ({ metadata }: { metadata: { chain: string } }) => {
      if (metadata.chain === "ETH") throw new Error("ETH unavailable");
      return { id: metadata.chain, on: vi.fn(() => () => {}), connectedWallet: null };
    });
    const onError = vi.fn();
    const storage: HashMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    };
    const metadata = {
      BTC: { chain: "BTC", name: "Bitcoin", icon: "", wallets: [] },
      ETH: { chain: "ETH", name: "Ethereum", icon: "", wallets: [] },
    } as ChainMetadataMap;
    const config = [
      { chain: "BTC" as const, config: {} as BTCConfig },
      { chain: "ETH" as const, config: {} as ETHConfig },
    ];

    const { result } = renderHook(() => useWidgetState(), {
      wrapper: ({ children }) => (
        <ChainProvider
          persistent={false}
          storage={storage}
          context={{ localStorage: window.localStorage }}
          config={config}
          onError={onError}
          requiredChains={["ETH"]}
          metadata={metadata}
        >
          {children}
        </ChainProvider>
      ),
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    const error = onError.mock.calls[0][0] as WalletError;
    expect(error).toBeInstanceOf(WalletError);
    expect(error.code).toBe(ERROR_CODES.WALLET_INITIALIZATION_FAILED);
    expect(error.chainId).toBe("ETH");

    // Fail closed: the chain the user must connect stays required even though
    // no connector exists for it, so the dialog cannot be confirmed without one.
    await waitFor(() => expect(Object.keys(result.current.chains)).toEqual(["BTC"]));
    expect(result.current.requiredChainIds).toEqual(["ETH"]);
  });

  it("requires every configured chain when requiredChains is omitted", async () => {
    createWalletConnector.mockImplementation(async ({ metadata }: { metadata: { chain: string } }) => ({
      id: metadata.chain,
      on: vi.fn(() => () => {}),
      connectedWallet: null,
    }));
    const storage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    } as HashMap;
    const metadata = {
      BTC: { chain: "BTC", name: "Bitcoin", icon: "", wallets: [] },
      ETH: { chain: "ETH", name: "Ethereum", icon: "", wallets: [] },
    } as ChainMetadataMap;
    const config = [
      { chain: "BTC" as const, config: {} as any },
      { chain: "ETH" as const, config: {} as any },
    ];
    const context = { localStorage: window.localStorage };

    const { result } = renderHook(() => useWidgetState(), {
      wrapper: ({ children }) => (
        <ChainProvider persistent={false} storage={storage} context={context} config={config} metadata={metadata}>
          {children}
        </ChainProvider>
      ),
    });

    await waitFor(() => expect(Object.keys(result.current.chains)).toHaveLength(2));
    expect(result.current.requiredChainIds).toEqual(["BTC", "ETH"]);
  });
});
