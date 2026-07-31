import type {
  AllOffchainParamsData,
  PegInConfiguration,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";
import { pegInConfigQueryOptions } from "@/context/ProtocolParamsContext";
import { offchainParamsQueryOptions } from "@/hooks/useOffchainParams";

import { usePeginPollingProtocolParams } from "../usePeginPollingProtocolParams";

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn(),
}));

const mockGetProtocolParamsReader = vi.mocked(getProtocolParamsReader);

const PINNED_VERSION = 3;
const LATEST_MIN_DEPTH = 6;
const PINNED_MIN_DEPTH = 4;

const CONFIG = {
  pegInActivationTimeout: 144n,
  offchainParams: { minPrepeginDepth: LATEST_MIN_DEPTH },
} as unknown as PegInConfiguration;

const OFFCHAIN_PARAMS = {
  byVersion: new Map([
    [PINNED_VERSION, { minPrepeginDepth: PINNED_MIN_DEPTH, tRefund: 1008 }],
  ]),
} as unknown as AllOffchainParamsData;

function makeClient(): QueryClient {
  // The query options pin `retry: 3`, so only the delay can be flattened here.
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
}

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function seedResolvedParams(client: QueryClient): void {
  client.setQueryData(pegInConfigQueryOptions().queryKey, CONFIG);
  client.setQueryData(offchainParamsQueryOptions().queryKey, OFFCHAIN_PARAMS);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePeginPollingProtocolParams", () => {
  it("withholds every resolver until both queries have landed", () => {
    mockGetProtocolParamsReader.mockReturnValue(new Promise(() => {}));
    const client = makeClient();

    const { result } = renderHook(() => usePeginPollingProtocolParams(true), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.pegInActivationTimeout).toBeUndefined();
    expect(result.current.resolveRequiredPrePeginDepth()).toBeUndefined();
    expect(
      result.current.resolveRequiredPrePeginDepth(PINNED_VERSION),
    ).toBeUndefined();
  });

  it("surfaces the load failure once the params are known to be unavailable", async () => {
    const loadError = new Error("contract read failed");
    mockGetProtocolParamsReader.mockRejectedValue(loadError);
    const client = makeClient();

    const { result } = renderHook(() => usePeginPollingProtocolParams(true), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.error).toBe(loadError));
    expect(result.current.ready).toBe(false);
    expect(result.current.resolveRequiredPrePeginDepth()).toBeUndefined();
  });

  it("resolves the pinned depth, and the latest only for the pre-sign (no version) case", () => {
    const client = makeClient();
    seedResolvedParams(client);

    const { result } = renderHook(() => usePeginPollingProtocolParams(true), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.resolveRequiredPrePeginDepth(PINNED_VERSION)).toBe(
      PINNED_MIN_DEPTH,
    );
    expect(result.current.resolveRequiredPrePeginDepth()).toBe(
      LATEST_MIN_DEPTH,
    );
  });

  it("withholds the depth for a registered version the params do not know", () => {
    // A registered-but-missing version must NOT fall back to the latest
    // depth: the at-depth conclusion this feeds persists (confirmedTxids),
    // so a fallback would confirm at the wrong threshold and the mistake
    // would outlive the params catching up.
    const client = makeClient();
    seedResolvedParams(client);

    const { result } = renderHook(() => usePeginPollingProtocolParams(true), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.ready).toBe(true);
    expect(
      result.current.resolveRequiredPrePeginDepth(PINNED_VERSION + 1),
    ).toBeUndefined();
  });

  it("fires no contract read while disabled", () => {
    // The hook mounts app-wide; `enabled` is what keeps a session with no
    // deposits (disconnected visitors included) from paying two multicalls
    // on page load.
    mockGetProtocolParamsReader.mockReturnValue(new Promise(() => {}));
    const client = makeClient();

    const { result } = renderHook(() => usePeginPollingProtocolParams(false), {
      wrapper: makeWrapper(client),
    });

    expect(mockGetProtocolParamsReader).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // The regression the `ready ? null : …` gate exists for. React Query retains
  // `data` when a REFETCH fails, so without the gate a post-stale-time failure
  // would report an error beside a cached depth that is present and correct —
  // withholding conclusions the hook is perfectly able to draw.
  it("does not report a refetch failure while the cached params stay usable", async () => {
    const client = makeClient();
    seedResolvedParams(client);
    mockGetProtocolParamsReader.mockRejectedValue(new Error("rpc flaked"));

    const { result } = renderHook(() => usePeginPollingProtocolParams(true), {
      wrapper: makeWrapper(client),
    });

    await client.refetchQueries({ queryKey: ["protocolParams"] });

    await waitFor(() =>
      expect(
        client.getQueryState(pegInConfigQueryOptions().queryKey)?.error,
      ).toBeInstanceOf(Error),
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.resolveRequiredPrePeginDepth(PINNED_VERSION)).toBe(
      PINNED_MIN_DEPTH,
    );
  });
});
