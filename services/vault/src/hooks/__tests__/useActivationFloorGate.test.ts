// The floor gate is the mirror of `useActivationDeadlineGate` with the
// fail-safe direction INVERTED: unresolved must mean GATED. These tests exist
// mainly to pin that — every "unresolved" path must keep the vault gated, and
// a key may only leave the map on proof that the window is open.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ethClient } from "@/clients/eth-contract/client";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { useActivationFloorGate } from "../useActivationFloorGate";

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: vi.fn() },
}));
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
  getProtocolParamsReader: vi.fn(),
}));

const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/config/featureFlags", () => ({
  default: {
    get isActivationDelayEnabled() {
      return flagMock.enabled;
    },
  },
}));

const mockGetBlockNumber = vi.fn();
const mockGetPeginActivationDelay = vi.fn();
const mockGetProtocolInfoBatch = vi.fn();
const mockGetVaultProtocolInfo = vi.fn();

const VAULT_ID = `0x${"11".repeat(32)}`;
const VERIFIED_AT = 1_000n;
const DELAY = 150n; // window opens at block 1150

function makeActivity(overrides: Partial<VaultActivity> = {}): VaultActivity {
  return {
    id: VAULT_ID,
    collateral: { amount: "1", symbol: "BTC" },
    providers: [],
    displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    unsignedPrePeginTx: "00",
    depositorWotsPkHash: `0x${"00".repeat(32)}`,
    contractStatus: ContractStatus.VERIFIED,
    ...overrides,
  } as VaultActivity;
}

function renderGate(activities: VaultActivity[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const rendered = renderHook(() => useActivationFloorGate(activities), {
    wrapper,
  });
  // The gated-with-`null` map is ALSO the pending state, so asserting it
  // straight after render proves nothing about the error path. Await the
  // cache's own status to separate "not resolved yet" from "resolved to this".
  const settled = (status: "success" | "error") =>
    waitFor(() =>
      expect(client.getQueryCache().getAll()[0]?.state.status).toBe(status),
    );
  return { ...rendered, settled, cache: client.getQueryCache() };
}

describe("useActivationFloorGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flagMock.enabled = true;
    vi.mocked(ethClient.getPublicClient).mockReturnValue({
      getBlockNumber: mockGetBlockNumber,
    } as never);
    vi.mocked(getProtocolParamsReader).mockResolvedValue({
      getPeginActivationDelay: mockGetPeginActivationDelay,
    } as never);
    vi.mocked(getVaultRegistryReader).mockReturnValue({
      getProtocolInfoBatch: mockGetProtocolInfoBatch,
      getVaultProtocolInfo: mockGetVaultProtocolInfo,
    } as never);
    mockGetPeginActivationDelay.mockResolvedValue(DELAY);
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: VERIFIED_AT }]);
  });

  afterEach(() => {
    flagMock.enabled = false;
  });

  it("issues no contract read and gates nothing when the flag is off", async () => {
    flagMock.enabled = false;

    const { result } = renderGate([makeActivity()]);

    // Asserting `not.toHaveBeenCalled()` synchronously would pass even if the
    // reads DID fire, because they are async. Give the query every chance to
    // run first, then assert it never did.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetPeginActivationDelay).not.toHaveBeenCalled();
    expect(mockGetBlockNumber).not.toHaveBeenCalled();
    expect(mockGetProtocolInfoBatch).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("ignores vaults that are not VERIFIED", async () => {
    const { result } = renderGate([
      makeActivity({ contractStatus: ContractStatus.ACTIVE }),
    ]);

    expect(result.current.size).toBe(0);
    expect(mockGetProtocolInfoBatch).not.toHaveBeenCalled();
  });

  it("gates with an unknown remainder while the read is still in flight", () => {
    mockGetBlockNumber.mockReturnValue(new Promise(() => {})); // never settles

    const { result } = renderGate([makeActivity()]);

    // Pending is unresolved, and unresolved gates — the button must not be
    // live on the first paint before anything has been proven.
    expect(result.current.get(VAULT_ID.toLowerCase())).toBeNull();
  });

  it("gates with an unknown remainder when a read fails", async () => {
    mockGetPeginActivationDelay.mockRejectedValue(new Error("RPC down"));
    mockGetBlockNumber.mockResolvedValue(9_999n); // window long since open

    const { result, settled } = renderGate([makeActivity()]);

    // The query RESOLVES on a failed read — it returns the fail-closed map
    // rather than rejecting, so a mounted app-wide query cannot spam the
    // global error handler. Safety comes from the map, not from the status.
    await settled("success");
    expect(result.current.get(VAULT_ID.toLowerCase())).toBeNull();
    expect(result.current.size).toBe(1);
  });

  it("does not reject, so a failing read cannot flood the global error handler", async () => {
    mockGetPeginActivationDelay.mockRejectedValue(new Error("getter absent"));
    mockGetBlockNumber.mockResolvedValue(9_999n);

    const { settled, cache } = renderGate([makeActivity()]);

    await settled("success");
    expect(cache.getAll()[0]?.state.error).toBeNull();
  });

  it("keeps one unreadable vault from gating the others", async () => {
    // getProtocolInfoBatch is allowFailure:false — it throws for the whole
    // batch if any single vault is unreadable. Without a per-vault fallback,
    // one lagging record would disable Activate on every vault in the wallet.
    const OTHER = `0x${"22".repeat(32)}`;
    mockGetBlockNumber.mockResolvedValue(9_999n); // both well past the floor
    mockGetProtocolInfoBatch.mockRejectedValue(new Error("one vault missing"));
    mockGetVaultProtocolInfo.mockImplementation(async (id: string) =>
      id === VAULT_ID
        ? { verifiedAt: VERIFIED_AT }
        : Promise.reject(new Error("nope")),
    );

    const { result, settled } = renderGate([
      makeActivity(),
      makeActivity({ id: OTHER as `0x${string}` }),
    ]);

    await settled("success");
    // The readable one is released; only the unreadable one stays gated.
    expect(result.current.has(VAULT_ID.toLowerCase())).toBe(false);
    expect(result.current.get(OTHER.toLowerCase())).toBeNull();
  });

  it("reports the remaining blocks while the window is closed", async () => {
    mockGetBlockNumber.mockResolvedValue(1_100n); // 50 short of 1150

    const { result } = renderGate([makeActivity()]);

    await waitFor(() =>
      expect(result.current.get(VAULT_ID.toLowerCase())).toBe(50),
    );
  });

  it("stops gating at the boundary block, matching the contract's inclusive check", async () => {
    mockGetBlockNumber.mockResolvedValue(1_150n);

    const { result } = renderGate([makeActivity()]);

    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it("never gates when the protocol delay is 0 (the disabled value)", async () => {
    // The likely first-rollout state: flag on before governance sets a delay.
    mockGetPeginActivationDelay.mockResolvedValue(0n);
    mockGetBlockNumber.mockResolvedValue(VERIFIED_AT);

    const { result } = renderGate([makeActivity()]);

    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it("stays gated when the batch returns no usable verifiedAt", async () => {
    // Index mismatch or an unregistered vault: no proof the window is open,
    // so the vault must not be released.
    mockGetProtocolInfoBatch.mockResolvedValue([{ verifiedAt: 0n }]);
    mockGetBlockNumber.mockResolvedValue(9_999n);

    const { result, settled } = renderGate([makeActivity()]);

    await settled("success");
    // The read SUCCEEDED — it just carried nothing usable. A regression that
    // treated that as "open" would have deleted the key.
    expect(result.current.get(VAULT_ID.toLowerCase())).toBeNull();
    expect(result.current.size).toBe(1);
  });
});
