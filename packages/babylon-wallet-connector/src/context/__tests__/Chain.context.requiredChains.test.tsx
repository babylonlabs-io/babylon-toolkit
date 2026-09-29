import { act, render, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren, useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChainProvider, type ChainConfigArr, type ChainMetadataMap } from "@/context/Chain.context";
import { StateProvider } from "@/context/State.context";
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

  it("exposes a widened requirement as unconfirmed on its first render", () => {
    const snapshots: Array<{ confirmed: boolean; hostRequiredChainIds: readonly string[] }> = [];
    let confirm: ((receipt: string) => void) | undefined;
    const Probe = ({ hostRequiredChainIds }: { hostRequiredChainIds: readonly string[] }) => {
      const state = useWidgetState();
      confirm = state.confirm;
      snapshots.push({ confirmed: state.confirmed, hostRequiredChainIds });
      return null;
    };
    const initialRequiredChainIds = ["ETH"];
    const widenedRequiredChainIds = ["BTC", "ETH"];
    const view = render(
      <StateProvider chains={[]} requiredChainIds={initialRequiredChainIds} storage={storage}>
        <Probe hostRequiredChainIds={initialRequiredChainIds} />
      </StateProvider>,
    );
    act(() => confirm?.("approved receipt"));
    const firstWidenedRender = snapshots.length;

    view.rerender(
      <StateProvider chains={[]} requiredChainIds={widenedRequiredChainIds} storage={storage}>
        <Probe hostRequiredChainIds={widenedRequiredChainIds} />
      </StateProvider>,
    );

    expect(
      snapshots.slice(firstWidenedRender).some(({ confirmed, hostRequiredChainIds }) =>
        hostRequiredChainIds.includes("BTC") && confirmed,
      ),
    ).toBe(false);
  });

  it("uses committed requirements in an old wallet-removal callback", () => {
    let state = {} as ReturnType<typeof useWidgetState>;
    const Probe = () => {
      state = useWidgetState();
      return null;
    };
    const view = render(
      <StateProvider chains={[]} requiredChainIds={["BTC", "ETH"]} storage={storage}>
        <Probe />
      </StateProvider>,
    );
    act(() => state.confirm?.("approved receipt"));
    const oldRemoveWallet = state.removeWallet;

    view.rerender(
      <StateProvider chains={[]} requiredChainIds={["ETH"]} storage={storage}>
        <Probe />
      </StateProvider>,
    );
    act(() => oldRemoveWallet?.("BTC"));

    expect(state.confirmed).toBe(true);
    expect(state.confirmationReceipt).toBe("approved receipt");
  });

  it("uses narrowed requirements before child layout effects run", () => {
    let state = {} as ReturnType<typeof useWidgetState>;
    const Probe = ({ removeBtc }: { removeBtc: boolean }) => {
      state = useWidgetState();
      useLayoutEffect(() => {
        if (removeBtc) state.removeWallet?.("BTC");
      }, [removeBtc]);
      return null;
    };
    const view = render(
      <StateProvider chains={[]} requiredChainIds={["BTC", "ETH"]} storage={storage}>
        <Probe removeBtc={false} />
      </StateProvider>,
    );
    act(() => state.confirm?.("approved receipt"));

    view.rerender(
      <StateProvider chains={[]} requiredChainIds={["ETH"]} storage={storage}>
        <Probe removeBtc />
      </StateProvider>,
    );

    expect(state.confirmed).toBe(true);
    expect(state.confirmationReceipt).toBe("approved receipt");
  });
});
