import { renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChainProvider, type ChainConfigArr, type ChainMetadataMap } from "@/context/Chain.context";
import type { ChainId, HashMap } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

// Connector construction reaches wallet SDKs and browser globals; the chain
// wiring under test only needs each connector's id and chain identity.
vi.mock("@/core", () => ({
  createWalletConnector: vi.fn(async ({ metadata }: { metadata: { chain: string } }) => ({
    id: metadata.chain,
    name: metadata.chain,
    icon: "",
    wallets: [],
    config: {},
    connectedWallet: null,
    on: () => () => {},
  })),
}));
vi.mock("@/hooks/useWalletRedetection", () => ({
  useWalletRedetection: () => {},
}));
vi.mock("@/context/Inscriptions.context", () => ({
  InscriptionProvider: ({ children }: PropsWithChildren) => children,
}));

const metadata: ChainMetadataMap = {
  BTC: { chain: "BTC", name: "Bitcoin", icon: "", wallets: [] },
  ETH: { chain: "ETH", name: "Ethereum", icon: "", wallets: [] },
};

const config = [
  { chain: "BTC", config: { network: "signet" } },
  { chain: "ETH", config: { chainId: 11155111 } },
] as unknown as ChainConfigArr;

let storage: HashMap;

function renderWidgetState(requiredChains?: readonly ChainId[]) {
  return renderHook(() => useWidgetState(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <ChainProvider
        persistent={false}
        storage={storage}
        context={{}}
        config={config}
        metadata={metadata}
        requiredChains={requiredChains}
      >
        {children}
      </ChainProvider>
    ),
  });
}

beforeEach(() => {
  const store = new Map<string, string>();
  storage = {
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => void store.set(key, value),
    has: (key: string) => store.has(key),
    delete: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  } as unknown as HashMap;
});

describe("required chains", () => {
  it("requires every configured chain when the host names none", async () => {
    const { result } = renderWidgetState();

    await waitFor(() => expect(Object.keys(result.current.chains)).toHaveLength(2));
    expect([...result.current.requiredChainIds].sort()).toEqual(["BTC", "ETH"]);
  });

  it("displays a chain the host offers without requiring it", async () => {
    const { result } = renderWidgetState(["ETH"]);

    await waitFor(() => expect(Object.keys(result.current.chains)).toHaveLength(2));
    expect(Object.keys(result.current.chains).sort()).toEqual(["BTC", "ETH"]);
    expect(result.current.requiredChainIds).toEqual(["ETH"]);
  });

  it("keeps a chain required even when its connector failed to build", async () => {
    const { result } = renderWidgetState(["BTC", "ETH", "BBN"]);

    await waitFor(() => expect(Object.keys(result.current.chains)).toHaveLength(2));
    // BBN has no metadata here, so no connector exists for it — but a chain the
    // host requires must not quietly drop out of the requirement set.
    expect(result.current.requiredChainIds).toContain("BBN");
  });
});
