import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
} from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { PeginPollingProvider, usePeginPolling } from "../PeginPollingContext";

const mockQueryResult = {
  errors: undefined as Map<string, Error> | undefined,
  needsWotsKey: undefined as Set<string> | undefined,
  pendingIngestion: undefined as Set<string> | undefined,
  pendingDepositorSignatures: undefined as Set<string> | undefined,
  isLoading: false,
  refetch: vi.fn(),
  depositsToPoll: [],
};

vi.mock("../../../hooks/deposit/usePeginPollingQuery", () => ({
  usePeginPollingQuery: () => mockQueryResult,
}));

// The mempool-truth hook adds network polling and a ProtocolParamsContext
// dependency neither of which this test cares about — stub it so the
// provider is renderable in isolation. The spy lets the polling-filter
// test assert which txids actually reach the mempool poller. `vi.hoisted`
// keeps the spy reference live across vi.mock's factory hoist.
const { mockUsePrePeginMempoolConfirmations } = vi.hoisted(() => ({
  mockUsePrePeginMempoolConfirmations: vi.fn<
    (txids: ReadonlyArray<string | undefined>) => {
      confirmationsByTxid: Map<string, number>;
    }
  >(() => ({ confirmationsByTxid: new Map<string, number>() })),
}));
vi.mock("../../../hooks/deposit/usePrePeginMempoolConfirmations", () => ({
  usePrePeginMempoolConfirmations: (txids: ReadonlyArray<string | undefined>) =>
    mockUsePrePeginMempoolConfirmations(txids),
}));

vi.mock("../../ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({
    config: { offchainParams: { minPrepeginDepth: 6 } },
    getOffchainParamsByVersion: () => undefined,
  }),
}));

const ACTIVITY_ID = "0xpegin" as Hex;
const BTC_PUBKEY = "ab".repeat(32);

const ACTIVITY: VaultActivity = {
  id: ACTIVITY_ID,
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  peginTxHash: ACTIVITY_ID,
  contractStatus: ContractStatus.PENDING,
  isInUse: false,
  displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
  depositorBtcPubkey: BTC_PUBKEY,
  unsignedPrePeginTx: "0xdeadbeef",
  depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
  depositorWotsPkHash: "0xwotsh",
};

function renderProvider() {
  const wrapper = ({ children }: PropsWithChildren) => (
    <PeginPollingProvider
      activities={[ACTIVITY]}
      pendingPegins={[]}
      btcPublicKey={BTC_PUBKEY}
    >
      {children}
    </PeginPollingProvider>
  );
  return renderHook(() => usePeginPolling(), { wrapper });
}

describe("PeginPollingContext", () => {
  beforeEach(() => {
    mockQueryResult.errors = undefined;
    mockQueryResult.needsWotsKey = undefined;
    mockQueryResult.pendingIngestion = undefined;
    mockQueryResult.pendingDepositorSignatures = undefined;
    mockQueryResult.isLoading = false;
    mockQueryResult.refetch.mockClear();
    mockUsePrePeginMempoolConfirmations.mockReset();
    // Default: empty confirmations. Individual tests can override via
    // `mockReturnValue` to inject a depth-reached entry.
    mockUsePrePeginMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map<string, number>(),
    });
    // The persistent confirmed-txid cache leaks across tests otherwise.
    localStorage.clear();
  });

  it("trusts an in-memory PAYOUT_SIGNED over a stale-cached transactionsReady so the Sign button hides immediately after signing", () => {
    // Reproduces the dashboard bug: after the user signs payouts, the
    // optimistic in-memory PAYOUT_SIGNED is set, but the previous 30s
    // poll cycle still has the deposit in `pendingDepositorSignatures`.
    // Without the fix, the VP cross-check in `applyTrackingOverrides`
    // rejects the optimistic status (treating it as "stale or tampered")
    // and re-exposes SIGN_PAYOUT_TRANSACTIONS until the next poll.
    mockQueryResult.pendingDepositorSignatures = new Set([ACTIVITY_ID]);

    const { result } = renderProvider();

    const before = result.current.getPollingResult(ACTIVITY_ID);
    expect(before?.peginState.availableActions).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );

    act(() => {
      result.current.setOptimisticStatus(
        ACTIVITY_ID,
        LocalStorageStatus.PAYOUT_SIGNED,
      );
    });

    const after = result.current.getPollingResult(ACTIVITY_ID);
    expect(after?.peginState.availableActions).not.toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );
    expect(after?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(after?.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.PROCESSING,
    );
  });

  it("does not suppress transactionsReady from a localStorage-only PAYOUT_SIGNED — keeps the existing stale-localStorage cross-check intact", () => {
    // Companion guarantee for the fix: the override only trusts
    // *in-memory* optimistic status (set in this session by the signing
    // flow). A PAYOUT_SIGNED loaded from localStorage on page reload could
    // be stale or tampered, so the VP cross-check must still apply.
    mockQueryResult.pendingDepositorSignatures = new Set([ACTIVITY_ID]);

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[ACTIVITY]}
        pendingPegins={[
          {
            id: ACTIVITY_ID,
            timestamp: 0,
            status: LocalStorageStatus.PAYOUT_SIGNED,
            peginTxHash: ACTIVITY_ID,
            unsignedTxHex: "0xdeadbeef",
          },
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );

    const { result } = renderHook(() => usePeginPolling(), { wrapper });

    const status = result.current.getPollingResult(ACTIVITY_ID);
    expect(status?.peginState.availableActions).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );
  });

  it("polls mempool using prePeginTxHash, not peginTxHash", () => {
    // Regression: the dashboard previously polled `peginTxHash` (the VP's
    // later activation tx, which doesn't exist on Bitcoin until post-
    // verification), so every cycle 404'd for every PENDING vault. The
    // correct key is `prePeginTxHash` — the tx the depositor actually
    // broadcasts. Distinct values per activity below so a future regression
    // that re-uses `peginTxHash` would surface in this assertion.
    const VAULT_A = "0xvaultA" as Hex;
    const VAULT_B = "0xvaultB" as Hex;
    const PEGIN_A = "0xpeginA" as Hex; // VP activation tx — must NOT be polled
    const PEGIN_B = "0xpeginB" as Hex;
    const PREPEGIN_A = "0xprepeginA" as Hex; // depositor broadcast tx — polled
    const PREPEGIN_B = "0xprepeginB" as Hex;

    const baseActivity = (
      id: Hex,
      peginHash: Hex,
      prePeginHash: Hex,
    ): VaultActivity => ({
      id,
      collateral: { amount: "0.1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: peginHash,
      prePeginTxHash: prePeginHash,
      contractStatus: ContractStatus.PENDING,
      isInUse: false,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      depositorBtcPubkey: BTC_PUBKEY,
      unsignedPrePeginTx: "0xdeadbeef",
      depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
      depositorWotsPkHash: "0xwotsh",
    });

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[
          baseActivity(VAULT_A, PEGIN_A, PREPEGIN_A),
          baseActivity(VAULT_B, PEGIN_B, PREPEGIN_B),
        ]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    renderHook(() => usePeginPolling(), { wrapper });

    // Poller receives the prePegin hashes — not the pegin hashes.
    const lastCall =
      mockUsePrePeginMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
    expect(new Set(lastCall)).toEqual(new Set([PREPEGIN_A, PREPEGIN_B]));
    expect(lastCall).not.toContain(PEGIN_A);
    expect(lastCall).not.toContain(PEGIN_B);
  });

  it("polls PENDING vaults whose Pre-PegIn might still need depth tracking", () => {
    // Poll while the FE doesn't yet know the Pre-PegIn is verified by
    // the VP — i.e., no localStorage entry, PENDING, or CONFIRMING.
    // Skip PAYOUT_SIGNED (VP already validated BTC at depth to prepare
    // payouts) and CONFIRMED (vault activated). The skipped states bring
    // no new information from the mempool; polling them is wasted work.
    const NO_LOCAL_ID = "0xnolocal" as Hex;
    const PENDING_ID = "0xpending" as Hex;
    const CONFIRMING_ID = "0xconfirming" as Hex;
    const SIGNED_ID = "0xsigned" as Hex;
    const FINALIZED_ID = "0xfinalized" as Hex;
    const NON_PENDING_ID = "0xactive" as Hex;

    const activity = (
      id: Hex,
      contractStatus: ContractStatus,
    ): VaultActivity => ({
      id,
      collateral: { amount: "0.1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: id,
      prePeginTxHash: id,
      contractStatus,
      isInUse: false,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      depositorBtcPubkey: BTC_PUBKEY,
      unsignedPrePeginTx: "0xdeadbeef",
      depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
      depositorWotsPkHash: "0xwotsh",
    });

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[
          activity(NO_LOCAL_ID, ContractStatus.PENDING),
          activity(PENDING_ID, ContractStatus.PENDING),
          activity(CONFIRMING_ID, ContractStatus.PENDING),
          activity(SIGNED_ID, ContractStatus.PENDING),
          activity(FINALIZED_ID, ContractStatus.PENDING),
          activity(NON_PENDING_ID, ContractStatus.ACTIVE),
        ]}
        pendingPegins={[
          {
            id: PENDING_ID,
            timestamp: 0,
            status: LocalStorageStatus.PENDING,
            peginTxHash: PENDING_ID,
            unsignedTxHex: "0xdeadbeef",
          },
          {
            id: CONFIRMING_ID,
            timestamp: 0,
            status: LocalStorageStatus.CONFIRMING,
            peginTxHash: CONFIRMING_ID,
            unsignedTxHex: "0xdeadbeef",
          },
          {
            id: SIGNED_ID,
            timestamp: 0,
            status: LocalStorageStatus.PAYOUT_SIGNED,
            peginTxHash: SIGNED_ID,
            unsignedTxHex: "0xdeadbeef",
          },
          {
            id: FINALIZED_ID,
            timestamp: 0,
            status: LocalStorageStatus.CONFIRMED,
            peginTxHash: FINALIZED_ID,
            unsignedTxHex: "0xdeadbeef",
          },
          // NO_LOCAL_ID intentionally absent — cross-browser / lost-state.
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    renderHook(() => usePeginPolling(), { wrapper });

    const lastCall =
      mockUsePrePeginMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
    expect(new Set(lastCall)).toEqual(
      new Set([NO_LOCAL_ID, PENDING_ID, CONFIRMING_ID]),
    );
    expect(lastCall).not.toContain(SIGNED_ID);
    expect(lastCall).not.toContain(FINALIZED_ID);
    expect(lastCall).not.toContain(NON_PENDING_ID);
  });

  it("looks up confirmations by prePeginTxHash, not peginTxHash", () => {
    // Companion to the polling-key test: the state-machine consumer at
    // `PeginPollingContext.tsx` must read confirmations keyed by the same
    // hash the poller writes. If the poller key drifts to `prePeginTxHash`
    // and the lookup stays on `peginTxHash` (or vice versa), the depth
    // signal silently goes dead.
    const VAULT_ID = "0xvault" as Hex;
    const PEGIN_HASH = "0xpeginHash" as Hex;
    const PREPEGIN_HASH = "0xprepeginHash" as Hex;
    const REQUIRED_DEPTH = 6;

    // Seed the mock so the lookup site sees a confirmation count at depth
    // ONLY when keyed by prePeginTxHash. If the consumer accidentally keys
    // by peginTxHash, it would return undefined and we'd see PENDING below.
    mockUsePrePeginMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([
        [PREPEGIN_HASH.slice(2).toLowerCase(), REQUIRED_DEPTH],
      ]),
    });

    const activity: VaultActivity = {
      id: VAULT_ID,
      collateral: { amount: "0.1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: PEGIN_HASH,
      prePeginTxHash: PREPEGIN_HASH,
      contractStatus: ContractStatus.PENDING,
      isInUse: false,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      depositorBtcPubkey: BTC_PUBKEY,
      unsignedPrePeginTx: "0xdeadbeef",
      depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
      depositorWotsPkHash: "0xwotsh",
    };
    mockQueryResult.pendingIngestion = new Set([VAULT_ID]);

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[activity]}
        pendingPegins={[
          {
            id: VAULT_ID,
            timestamp: 0,
            // Local CONFIRMING + VP `pendingIngestion` is the path where
            // `prePeginBroadcastConfirmed` actually steers the state output —
            // distinguishing "waiting for BTC confirmation" from "BTC at
            // depth, VP still ingesting". Without CONFIRMING, the state
            // machine returns SIGN_AND_BROADCAST_TO_BITCOIN before the
            // mempool-depth branch can fire.
            status: LocalStorageStatus.CONFIRMING,
            peginTxHash: PEGIN_HASH,
            unsignedTxHex: "0xdeadbeef",
          },
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    const { result } = renderHook(() => usePeginPolling(), { wrapper });

    // The state machine surfaces "Pre-PegIn confirmed, VP ingesting" when
    // `prePeginBroadcastConfirmed` is true AND `pendingIngestion` is set.
    // That path only fires if the confirmations lookup matched —
    // i.e., the consumer keyed by `prePeginTxHash`.
    const polling = result.current.getPollingResult(VAULT_ID);
    expect(polling?.peginState.awaitingVpIngestion).toBe(true);
  });

  it("stops polling a Pre-PegIn txid once it has been observed at required depth", async () => {
    // Once the mempool reports a Pre-PegIn at the protocol-required depth,
    // the answer is permanent — the chain doesn't rewind, the block height
    // is fixed, and repolling the same txid reads the same fact. The
    // confirmed-txid cache lets us drop it from the polled set so we don't
    // burn a `/tx/<txid>` request per cycle (and per page refresh) just to
    // re-confirm what we already know.
    const VAULT_ID = "0xvault" as Hex;
    const PREPEGIN_HASH = "0xprepeginConfirmed" as Hex;
    const REQUIRED_DEPTH = 6;
    const canonical = PREPEGIN_HASH.slice(2).toLowerCase();

    // Start with empty confirmations, then flip to depth-reached. The
    // effect that captures the observation runs after render — we have to
    // give React a tick for the state update + re-render that drops the
    // confirmed txid from the next polled list.
    mockUsePrePeginMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[canonical, REQUIRED_DEPTH]]),
    });

    const activity: VaultActivity = {
      id: VAULT_ID,
      collateral: { amount: "0.1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: PREPEGIN_HASH,
      prePeginTxHash: PREPEGIN_HASH,
      contractStatus: ContractStatus.PENDING,
      isInUse: false,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      depositorBtcPubkey: BTC_PUBKEY,
      unsignedPrePeginTx: "0xdeadbeef",
      depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
      depositorWotsPkHash: "0xwotsh",
    };

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[activity]}
        pendingPegins={[
          {
            id: VAULT_ID,
            timestamp: 0,
            status: LocalStorageStatus.CONFIRMING,
            peginTxHash: PREPEGIN_HASH,
            unsignedTxHex: "0xdeadbeef",
          },
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    renderHook(() => usePeginPolling(), { wrapper });

    // After the depth-observation effect runs, the next render's polled
    // list drops the now-confirmed txid.
    await waitFor(() => {
      const lastCall =
        mockUsePrePeginMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
      expect(lastCall).not.toContain(PREPEGIN_HASH);
    });
  });

  it("does not re-poll a Pre-PegIn txid present in the persistent confirmed cache", () => {
    // Page refresh equivalent: the cache was populated in a prior session
    // (or earlier dashboard mount). The provider should respect it on
    // mount and never poll the cached txid in this session.
    const VAULT_ID = "0xvault" as Hex;
    const PREPEGIN_HASH = "0xprepeginCached" as Hex;
    const canonical = PREPEGIN_HASH.slice(2).toLowerCase();

    // Simulate a prior session having persisted the confirmed txid.
    // The cache shape is `{ txid → addedAt }` so the TTL pruner can run;
    // seed with a recent timestamp so the entry isn't immediately evicted.
    localStorage.setItem(
      "tbv-confirmed-prepegin-signet",
      JSON.stringify({ [canonical]: Date.now() }),
    );

    const activity: VaultActivity = {
      id: VAULT_ID,
      collateral: { amount: "0.1", symbol: "BTC" },
      providers: [{ id: "0xprovider" }],
      peginTxHash: PREPEGIN_HASH,
      prePeginTxHash: PREPEGIN_HASH,
      contractStatus: ContractStatus.PENDING,
      isInUse: false,
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      depositorBtcPubkey: BTC_PUBKEY,
      unsignedPrePeginTx: "0xdeadbeef",
      depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
      depositorWotsPkHash: "0xwotsh",
    };

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[activity]}
        pendingPegins={[
          {
            id: VAULT_ID,
            timestamp: 0,
            status: LocalStorageStatus.CONFIRMING,
            peginTxHash: PREPEGIN_HASH,
            unsignedTxHex: "0xdeadbeef",
          },
        ]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    renderHook(() => usePeginPolling(), { wrapper });

    // Every recorded polling-hook call should exclude the cached txid.
    for (const call of mockUsePrePeginMempoolConfirmations.mock.calls) {
      expect(call[0]).not.toContain(PREPEGIN_HASH);
    }
  });
});
