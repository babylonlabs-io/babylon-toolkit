import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HashMap } from "@/core/types";
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
