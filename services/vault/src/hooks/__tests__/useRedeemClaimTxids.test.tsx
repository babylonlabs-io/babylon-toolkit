/**
 * The claim-link poll. The resolver returns no entry for a vault the provider
 * has not claimed yet and drops provider failures, so the hook's refetch
 * interval is the only thing that turns a later broadcast into a link, the
 * only thing that must stop once every listed vault has one, and a resolved
 * link must survive later reads, list changes and remounts.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POLLING_INTERVAL_MS } from "@/config/polling";
import { useRedeemClaimTxids } from "@/hooks/useRedeemClaimTxids";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import { resolveRedeemClaimTxids } from "@/services/activity/claimTxResolver";
import type { VaultActivity } from "@/types/activity";

vi.mock("@/services/activity/claimTxResolver", () => ({
  resolveRedeemClaimTxids: vi.fn(),
}));

const VAULT_A = "0xaaaa" as Hex;
const VAULT_B = "0xbbbb" as Hex;
const VAULT_C = "0xcccc" as Hex;
const CLAIM_A = "ca".repeat(32);
const CLAIM_B = "cb".repeat(32);

function redeemed(id: Hex, peginTxHash: Hex | undefined): VaultActivity {
  return {
    id,
    collateral: { amount: "0.1", symbol: "BTC" },
    providers: [{ id: "0xprovider" }],
    contractStatus: ContractStatus.REDEEMED,
    displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
    depositorWotsPkHash: "0xwotshash",
    unsignedPrePeginTx: "0xdeadbeef",
    peginTxHash,
  };
}

const A = redeemed(VAULT_A, "0xpegina");
const B = redeemed(VAULT_B, "0xpeginb");
const C = redeemed(VAULT_C, "0xpeginc");

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const resolver = vi.mocked(resolveRedeemClaimTxids);

/** The ids the resolver was asked about on its nth call (1-based). */
const askedOnCall = (n: number) =>
  resolver.mock.calls[n - 1]?.[0].map((ref) => ref.vaultId);

/** A hook over a list the test can change. */
function renderLinks(activities: VaultActivity[]) {
  return renderHook(
    ({ activities }: { activities: VaultActivity[] }) =>
      useRedeemClaimTxids(activities),
    { wrapper, initialProps: { activities } },
  );
}

// Cached links outlive a remount, as under the app's QueryClient.
const CACHED_QUERY_OPTIONS = { retry: false, gcTime: Infinity };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  queryClient = new QueryClient({
    defaultOptions: { queries: CACHED_QUERY_OPTIONS },
  });
});

afterEach(() => {
  resolver.mockReset();
  vi.useRealTimers();
});

describe("useRedeemClaimTxids", () => {
  it("links a claim the provider reports on a later poll, then stops polling", async () => {
    // First read: nothing linked — the claim is not broadcast yet, or the
    // provider read failed; the hook cannot tell them apart and need not.
    resolver
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      .mockResolvedValue(new Map([[VAULT_B, CLAIM_B]]));

    const { result } = renderLinks([A, B]);

    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    await waitFor(() => expect(result.current.get(VAULT_A)).toBe(CLAIM_A));
    // One vault still unlinked: the poll goes on, and asks about it alone.
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    await waitFor(() => expect(result.current.get(VAULT_B)).toBe(CLAIM_B));
    expect(resolver).toHaveBeenCalledTimes(3);
    expect(askedOnCall(3)).toEqual([VAULT_B]);
    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);

    // Every vault linked: no further request.
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2));
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  it("keeps a resolved link through a later read that fails to return it", async () => {
    resolver
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      // The provider is unreachable this tick: the resolver drops it.
      .mockResolvedValue(new Map());

    const { result } = renderLinks([A, B]);

    await waitFor(() => expect(result.current.get(VAULT_A)).toBe(CLAIM_A));
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));

    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
  });

  it("reads a vault joining the list on arrival, asking about it alone", async () => {
    resolver
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      .mockResolvedValue(new Map());

    const { result, rerender } = renderLinks([A]);
    await waitFor(() => expect(result.current.get(VAULT_A)).toBe(CLAIM_A));

    rerender({ activities: [A, B, C] });

    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    expect(askedOnCall(2)).toEqual([VAULT_B, VAULT_C]);
    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
  });

  it("does not read again when the list is rebuilt with the same vaults", async () => {
    resolver.mockResolvedValue(new Map());

    const { rerender } = renderLinks([A, B]);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));

    // The page rebuilds the array on any upstream change; only a membership
    // change is an arrival.
    rerender({ activities: [{ ...A }, { ...B }] });

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS / 2));
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("keeps a link when the list shrinks back to one it was read under before", async () => {
    // A: read once while alone, nothing linked; linked while listed with B;
    // then B's payout lands and B leaves the list.
    resolver
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      .mockResolvedValue(new Map());

    const { result, rerender } = renderLinks([A]);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    rerender({ activities: [A, B] });
    await waitFor(() => expect(result.current.get(VAULT_A)).toBe(CLAIM_A));

    rerender({ activities: [A] });

    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
    // Every listed vault is linked: nothing more is asked.
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2));
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
  });

  it("keeps a resolved link across a remount, even when the read on return fails", async () => {
    resolver
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      .mockResolvedValue(new Map());

    const first = renderLinks([A, B]);
    await waitFor(() =>
      expect(first.result.current.get(VAULT_A)).toBe(CLAIM_A),
    );
    first.unmount();

    // Navigating back: a fresh instance over the same query cache.
    const { result } = renderLinks([A, B]);

    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    expect(askedOnCall(2)).toEqual([VAULT_B]);
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
  });

  it("keeps a link learned under one list when a remount shows another", async () => {
    // Within the app's stale time the remount runs no read of its own.
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { ...CACHED_QUERY_OPTIONS, staleTime: Infinity },
      },
    });
    resolver
      .mockResolvedValueOnce(new Map([[VAULT_A, CLAIM_A]]))
      .mockResolvedValue(new Map());

    const first = renderLinks([A, B]);
    await waitFor(() =>
      expect(first.result.current.get(VAULT_A)).toBe(CLAIM_A),
    );
    first.unmount();

    // B's payout landed while away; the provider is unreachable on return.
    const { result } = renderLinks([A]);

    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(result.current.get(VAULT_A)).toBe(CLAIM_A);
  });

  it("asks the resolver only about vaults that carry a peg-in hash and a provider", async () => {
    resolver.mockResolvedValue(new Map());
    const noPegin = redeemed(VAULT_C, undefined);

    renderLinks([A, noPegin]);

    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    expect(resolver).toHaveBeenCalledWith(
      [{ vaultId: VAULT_A }],
      new Map([
        [VAULT_A, { peginTxHash: "0xpegina", vaultProvider: "0xprovider" }],
      ]),
    );
  });

  it("requests nothing when no vault can resolve", async () => {
    resolver.mockResolvedValue(new Map());

    const { result } = renderLinks([redeemed(VAULT_C, undefined)]);

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    expect(resolver).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});
