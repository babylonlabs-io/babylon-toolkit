import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "../../../copy";
import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
} from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import type { PeginPollingContextValue } from "../../../types/peginPolling";
import {
  PeginPollingProvider,
  resetPeginPollingProviderCount,
  usePeginPolling,
} from "../PeginPollingContext";
import {
  markWotsSubmitted,
  resetOptimisticDepositState,
} from "../optimisticDepositState";

const mockQueryResult = {
  polledIds: undefined as string[] | undefined,
  errors: undefined as Map<string, Error> | undefined,
  needsWotsKey: undefined as Set<string> | undefined,
  pendingIngestion: undefined as Set<string> | undefined,
  pendingDepositorSignatures: undefined as Set<string> | undefined,
  isLoading: false,
  refetch: vi.fn(),
};

vi.mock("../../../hooks/deposit/usePeginPollingQuery", () => ({
  usePeginPollingQuery: () => mockQueryResult,
}));

// The mempool-truth hook adds network polling and a ProtocolParamsContext
// dependency neither of which most tests care about — stub it so the
// provider is renderable in isolation. The spy lets polling-filter tests
// assert which txids actually reach the mempool poller, while EXPIRED
// maturity tests inject depth-reached entries via `mockReturnValue`.
// `vi.hoisted` keeps the spy reference live across vi.mock's factory hoist.
const { mockUseBtcMempoolConfirmations } = vi.hoisted(() => ({
  mockUseBtcMempoolConfirmations: vi.fn<
    (txids: ReadonlyArray<string | undefined>) => {
      confirmationsByTxid: Map<string, number>;
    }
  >(() => ({ confirmationsByTxid: new Map<string, number>() })),
}));
vi.mock("../../../hooks/useBtcMempoolConfirmations", () => ({
  useBtcMempoolConfirmations: (txids: ReadonlyArray<string | undefined>) =>
    mockUseBtcMempoolConfirmations(txids),
}));

// EXPIRED-vault HTLC refund-spend poller — stub so the provider renders
// without a real QueryClient. Default: nothing spent. Tests can inject a
// spent/confirmed entry via `mockReturnValue`.
const { mockUseBtcHtlcRefundStatus } = vi.hoisted(() => ({
  mockUseBtcHtlcRefundStatus: vi.fn<
    () => {
      refundByDepositId: Map<
        string,
        { spent: boolean; confirmed: boolean; spendingTxid?: string }
      >;
    }
  >(() => ({ refundByDepositId: new Map() })),
}));
vi.mock("../../../hooks/useBtcHtlcRefundStatus", () => ({
  useBtcHtlcRefundStatus: () => mockUseBtcHtlcRefundStatus(),
}));

// Activation-deadline gate uses react-query + chain reads — stub so the
// provider renders in isolation. Default: nothing gated. Tests can inject a
// gated vault id via `mockReturnValue`.
const { mockUseActivationDeadlineGate } = vi.hoisted(() => ({
  mockUseActivationDeadlineGate: vi.fn<() => ReadonlySet<string>>(
    () => new Set<string>(),
  ),
}));
vi.mock("../../../hooks/useActivationDeadlineGate", () => ({
  useActivationDeadlineGate: () => mockUseActivationDeadlineGate(),
}));

const mockVersionedParams = new Map<number, { tRefund: number }>();

// The provider reads params through the non-blocking hook (it mounts above the
// routes owning the blocking ProtocolParamsProvider), so stub that hook rather
// than the context. Function identities are module-stable, which matters: the
// provider memoizes on them and churning refs would re-fire its effects.
// `ready`/`error` are mutated by the unresolved-params tests below.
const mockProtocolParams = {
  ready: true,
  error: null as Error | null,
  pegInActivationTimeout: undefined as bigint | undefined,
  resolveRequiredPrePeginDepth: (): number | undefined =>
    mockProtocolParams.ready ? 6 : undefined,
  resolveRefundTimelock: (v?: number): number | undefined =>
    v !== undefined ? mockVersionedParams.get(v)?.tRefund : undefined,
};

// Captures the `enabled` argument so the provider's gate wiring is asserted
// here, not only at the hook level.
const mockParamsEnabledCalls: boolean[] = [];
vi.mock("../../../hooks/deposit/usePeginPollingProtocolParams", () => ({
  usePeginPollingProtocolParams: (enabled: boolean) => {
    mockParamsEnabledCalls.push(enabled);
    return mockProtocolParams;
  },
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
    mockParamsEnabledCalls.length = 0;
    mockQueryResult.errors = undefined;
    mockQueryResult.needsWotsKey = undefined;
    mockQueryResult.pendingIngestion = undefined;
    mockQueryResult.pendingDepositorSignatures = undefined;
    mockQueryResult.isLoading = false;
    mockQueryResult.refetch.mockClear();
    mockUseBtcMempoolConfirmations.mockReset();
    // Default: empty confirmations. Individual tests can override via
    // `mockReturnValue` to inject a depth-reached entry.
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map<string, number>(),
    });
    mockUseBtcHtlcRefundStatus.mockReset();
    mockUseBtcHtlcRefundStatus.mockReturnValue({
      refundByDepositId: new Map(),
    });
    mockVersionedParams.clear();
    mockProtocolParams.ready = true;
    mockProtocolParams.error = null;
    // The persistent confirmed-txid cache leaks across tests otherwise.
    localStorage.clear();
    // Optimistic completions are app-scoped, so they outlive any single
    // provider — and therefore any single test.
    resetOptimisticDepositState();
    // Same for the provider mount counter: a test that throws on a second
    // mount leaves the count non-zero and would trip the next test.
    resetPeginPollingProviderCount();
  });

  // Restored here, not at the end of each timer test: a failing assertion would
  // otherwise leak fake timers into every later `waitFor` and cascade timeouts.
  afterEach(() => {
    vi.useRealTimers();
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

  it("hides Sign Payouts on the dashboard row when the signing modal records the completion", () => {
    // The reported bug, now structurally impossible: the modal and the row used
    // to sit under two different providers, so a completion recorded by the
    // modal never reached the row and "Sign Payouts" stayed live for the rest
    // of the session. With one provider they share state — this pins that the
    // row actually re-renders on the write rather than reading a stale
    // memoized snapshot.
    const OTHER_ID = "0xpeginOther" as Hex;
    const OTHER_ACTIVITY: VaultActivity = { ...ACTIVITY, id: OTHER_ID };
    mockQueryResult.pendingDepositorSignatures = new Set([
      ACTIVITY_ID,
      OTHER_ID,
    ]);

    // Captured per render: `getPollingResult` is memoized on the provider's
    // inputs, so an assertion holding the pre-action context object would read
    // the pre-action snapshot and pass regardless.
    const captured: {
      row?: PeginPollingContextValue;
      modal?: PeginPollingContextValue;
    } = {};
    function DashboardRow() {
      captured.row = usePeginPolling();
      return null;
    }
    function SigningModal() {
      captured.modal = usePeginPolling();
      return null;
    }
    const rowActions = (id: string) =>
      captured.row?.getPollingResult(id)?.peginState.availableActions;

    render(
      <PeginPollingProvider
        activities={[ACTIVITY, OTHER_ACTIVITY]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <DashboardRow />
        <SigningModal />
      </PeginPollingProvider>,
    );

    expect(rowActions(ACTIVITY_ID)).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );

    act(() => {
      captured.modal?.setOptimisticStatus(
        ACTIVITY_ID,
        LocalStorageStatus.PAYOUT_SIGNED,
      );
    });

    expect(rowActions(ACTIVITY_ID)).toEqual([PeginAction.NONE]);
    // The sibling the user has not signed keeps its button.
    expect(rowActions(OTHER_ID)).toContain(
      PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    );
  });

  it("hides Submit WOTS Key once the submission resolves, before the poll clears needsWotsKey", () => {
    // The VP keeps reporting PENDING_DEPOSITOR_WOTS_PK until its daemon
    // advances, so for up to a full poll interval the row re-offered the
    // button — and clicking it re-runs the whole derivation, wallet popup
    // included, for a submission that already landed.
    mockQueryResult.needsWotsKey = new Set([ACTIVITY_ID]);
    // Real poll shape: the sets are rebuilt each cycle, so a deposit awaiting
    // its WOTS key is absent from `pendingIngestion` rather than unobserved.
    mockQueryResult.pendingIngestion = new Set();

    const { result } = renderProvider();
    expect(
      result.current.getPollingResult(ACTIVITY_ID)?.peginState.availableActions,
    ).toContain(PeginAction.SUBMIT_WOTS_KEY);

    act(() => {
      markWotsSubmitted(ACTIVITY_ID);
    });

    // Exactly NONE — suppressing the WOTS action must not fall through to
    // re-offering the Pre-PegIn broadcast the depositor already completed.
    expect(
      result.current.getPollingResult(ACTIVITY_ID)?.peginState.availableActions,
    ).toEqual([PeginAction.NONE]);
  });

  it("keeps Submit WOTS Key available for a deposit whose submission was never recorded", () => {
    // Negative control for the suppression above: the marker is per-deposit,
    // so a sibling still awaiting its key must be unaffected.
    const OTHER_ID = "0xpeginOther" as Hex;
    mockQueryResult.needsWotsKey = new Set([ACTIVITY_ID, OTHER_ID]);

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[ACTIVITY, { ...ACTIVITY, id: OTHER_ID }]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    const { result } = renderHook(() => usePeginPolling(), { wrapper });

    act(() => {
      markWotsSubmitted(ACTIVITY_ID);
    });

    expect(
      result.current.getPollingResult(OTHER_ID)?.peginState.availableActions,
    ).toContain(PeginAction.SUBMIT_WOTS_KEY);
  });

  it("recomputes Submit WOTS Key as available once the suppression window has elapsed and the vault provider is still asking", () => {
    // The marker only bridges daemon lag. A VP still asking twenty minutes on
    // is asking for real — a rejected or rotated key, or a submission lost
    // behind a 200 — and an unbounded marker would leave the row with no
    // action at all until the user thought to reload.
    //
    // Scope: this calls `getPollingResult` directly after advancing the clock,
    // so it pins the COMPUTATION flipping, not a re-render. No dep of that
    // `useCallback` changes when the clock crosses the boundary, so this would
    // pass even if nothing re-rendered. What carries it in production is
    // `refetchInterval` — see `WOTS_SUBMISSION_SUPPRESSION_MS`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    mockQueryResult.needsWotsKey = new Set([ACTIVITY_ID]);
    mockQueryResult.pendingIngestion = new Set();

    const { result } = renderProvider();

    act(() => {
      markWotsSubmitted(ACTIVITY_ID);
    });
    expect(
      result.current.getPollingResult(ACTIVITY_ID)?.peginState.availableActions,
    ).toEqual([PeginAction.NONE]);

    vi.advanceTimersByTime(21 * 60 * 1000);

    expect(
      result.current.getPollingResult(ACTIVITY_ID)?.peginState.availableActions,
    ).toContain(PeginAction.SUBMIT_WOTS_KEY);
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
      mockUseBtcMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
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
      mockUseBtcMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
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
    mockUseBtcMempoolConfirmations.mockReturnValue({
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
    expect(polling?.peginState.message).toBe(
      COPY.pegin.messages.prePeginIngesting,
    );
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
    mockUseBtcMempoolConfirmations.mockReturnValue({
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
        mockUseBtcMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
      expect(lastCall).not.toContain(PREPEGIN_HASH);
    });
  });

  it("treats a cached confirmed txid as at-depth even when the mempool poll map is empty", async () => {
    // Regression: on a fresh page load the cache excludes confirmed txids
    // from polling, so `prePeginConfirmationsByTxid` has no entry for them.
    // Without consulting the cache, `getPollingResult` would compute
    // `prePeginBroadcastConfirmed = false` and the state machine would
    // regress a cached CONFIRMING vault to "waiting for BTC confirmation"
    // until the cache expired — defeating the whole persistence design.
    const VAULT_ID = "0xvault" as Hex;
    const PREPEGIN_HASH = "0xprepeginCached" as Hex;
    const canonical = PREPEGIN_HASH.slice(2).toLowerCase();

    localStorage.setItem(
      "tbv-confirmed-prepegin-signet",
      JSON.stringify({ [canonical]: Date.now() }),
    );

    // Empty mempool result (the poll skipped this txid because cache filter dropped it).
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map<string, number>(),
    });
    mockQueryResult.pendingIngestion = new Set([VAULT_ID]);

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
    const { result } = renderHook(() => usePeginPolling(), { wrapper });

    // State machine routes to the "BTC at depth, VP ingesting" branch
    // (driven by `prePeginBroadcastConfirmed`) without any mempool hit.
    await waitFor(() => {
      expect(
        result.current.getPollingResult(VAULT_ID)?.peginState.message,
      ).toBe(COPY.pegin.messages.prePeginIngesting);
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
    for (const call of mockUseBtcMempoolConfirmations.mock.calls) {
      expect(call[0]).not.toContain(PREPEGIN_HASH);
    }
  });

  // ==========================================================================
  // EXPIRED — refund maturity wiring
  // ==========================================================================

  // Canonical (lowercased, no `0x`) txid the mempool hook keys by.
  const PRE_PEGIN_TXID_HEX = "abcd".repeat(16);
  const EXPIRED_ACTIVITY: VaultActivity = {
    ...ACTIVITY,
    contractStatus: ContractStatus.EXPIRED,
    prePeginTxHash: `0x${PRE_PEGIN_TXID_HEX}` as Hex,
    offchainParamsVersion: 3,
  };

  function renderExpired() {
    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[EXPIRED_ACTIVITY]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    return renderHook(() => usePeginPolling(), { wrapper });
  }

  it("EXPIRED: gates the refund action on CSV maturity (confirmations < tRefund → no action, maturing state)", () => {
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[PRE_PEGIN_TXID_HEX, 20]]),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(status?.peginState.refundMaturityState).toBe("maturing");
    expect(status?.peginState.refundMaturesInBlocks).toBe(144 - 20);
  });

  it("EXPIRED: exposes the refund action once CSV is satisfied (confirmations ≥ tRefund)", () => {
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[PRE_PEGIN_TXID_HEX, 144]]),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.availableActions).toEqual([
      PeginAction.REFUND_HTLC,
    ]);
    expect(status?.peginState.refundMaturityState).toBe("mature");
  });

  it("EXPIRED: hides the refund action and shows Refunded when the HTLC spend has confirmed", () => {
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[PRE_PEGIN_TXID_HEX, 144]]),
    });
    // Chain ground truth: the HTLC output was already spent (refund landed
    // and confirmed) — the dashboard must not re-offer a doomed refund.
    mockUseBtcHtlcRefundStatus.mockReturnValue({
      refundByDepositId: new Map([
        [ACTIVITY_ID.toLowerCase(), { spent: true, confirmed: true }],
      ]),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(status?.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDED);
  });

  it("EXPIRED: never marks mature when the per-deposit tRefund is unknown (no fallback to latest)", () => {
    // mockVersionedParams left empty for version 3 → tRefund undefined.
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[PRE_PEGIN_TXID_HEX, 9_999]]),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(status?.peginState.refundMaturityState).toBe("unknown");
    expect(status?.peginState.refundMaturesInBlocks).toBeUndefined();
  });

  it("EXPIRED: reports unknown when confirmations are not yet available", () => {
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map(),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(status?.peginState.refundMaturityState).toBe("unknown");
  });

  it("EXPIRED: stops polling once observed at tRefund and reads the cache as mature on next render", async () => {
    // Once mempool reports a Pre-PegIn past `tRefund`, the answer is
    // permanent. The mature cache lets us drop the txid from polling so a
    // long-stale expired vault doesn't burn `/tx/<txid>` per cycle.
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map([[PRE_PEGIN_TXID_HEX, 144]]),
    });

    renderExpired();

    await waitFor(() => {
      const lastCall =
        mockUseBtcMempoolConfirmations.mock.calls.at(-1)?.[0] ?? [];
      expect(lastCall).not.toContain(EXPIRED_ACTIVITY.prePeginTxHash);
    });
  });

  it("EXPIRED: treats a cached mature txid as mature even when polling returns nothing", async () => {
    // Page refresh equivalent: prior session cached the mature txid. The
    // poll filter drops it on mount so `prePeginConfirmationsByTxid` has
    // no entry. Without the cache OR, the state would regress to
    // "unknown" and the inline copy would say "Checking…" on every refresh.
    localStorage.setItem(
      "tbv-mature-refund-signet",
      JSON.stringify({ [PRE_PEGIN_TXID_HEX]: Date.now() }),
    );
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map(),
    });

    const { result } = renderExpired();
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.peginState.refundMaturityState).toBe("mature");
    expect(status?.peginState.availableActions).toEqual([
      PeginAction.REFUND_HTLC,
    ]);
  });

  it("EXPIRED: surfaces refund as mature for unowned vaults so the ownership-mismatch UI can disable it", () => {
    // Polling is skipped for unowned vaults (see filter), so confirmations
    // would be undefined → state would be "unknown" and no action button
    // would render. Without a button, the ownership-mismatch disable+
    // tooltip path in getActionStatus never fires, leaving the user with
    // a stale "checking…" message and no hint to switch wallets. The
    // bypass surfaces REFUND_HTLC so main's ownership flow takes over.
    const OTHER_BTC_PUBKEY = "cd".repeat(32);
    mockVersionedParams.set(3, { tRefund: 144 });
    mockUseBtcMempoolConfirmations.mockReturnValue({
      confirmationsByTxid: new Map(),
    });

    const wrapper = ({ children }: PropsWithChildren) => (
      <PeginPollingProvider
        activities={[
          { ...EXPIRED_ACTIVITY, depositorBtcPubkey: OTHER_BTC_PUBKEY },
        ]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        {children}
      </PeginPollingProvider>
    );
    const { result } = renderHook(() => usePeginPolling(), { wrapper });
    const status = result.current.getPollingResult(ACTIVITY_ID);

    expect(status?.isOwnedByCurrentWallet).toBe(false);
    expect(status?.peginState.refundMaturityState).toBe("mature");
    expect(status?.peginState.availableActions).toEqual([
      PeginAction.REFUND_HTLC,
    ]);
  });

  it("reports the deposit as loading while the protocol params are unresolved", () => {
    // The provider now reads params non-blockingly, so an unresolved depth
    // must present as "still loading" rather than a settled unknown — a card
    // that renders a resolved state off missing params misreports progress.
    mockProtocolParams.ready = false;

    const { result } = renderProvider();

    const status = result.current.getPollingResult(ACTIVITY_ID);
    expect(status?.loading).toBe(true);
    expect(status?.requiredPrePeginDepth).toBeUndefined();
  });

  it("throws in dev when a second provider mounts alongside the first", () => {
    // The guardrail. Two providers fork polling and optimistic-completion
    // state, so an action completed under one stops hiding its button under
    // the other — silent at runtime, and exactly the bug this tree was
    // collapsed to remove. Siblings count, not just nesting.
    const Tree = () => (
      <>
        <PeginPollingProvider
          activities={[ACTIVITY]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
        <PeginPollingProvider
          activities={[ACTIVITY]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
      </>
    );

    expect(() => render(<Tree />)).toThrow(
      /PeginPollingProvider instances are mounted at once/,
    );
  });

  it("gates the params reads on having deposits to evaluate", () => {
    // The wiring half of the hook-level "fires no contract read while
    // disabled" test: the provider must pass `activities.length > 0`, or the
    // gate exists but nothing ever flips it.
    const withDeposits = renderProvider();
    expect(mockParamsEnabledCalls.at(-1)).toBe(true);
    // Unmount before the empty-activities mount — the single-provider
    // invariant (rightly) throws on two live providers.
    withDeposits.unmount();

    mockParamsEnabledCalls.length = 0;
    render(
      <PeginPollingProvider
        activities={[]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>,
    );
    expect(mockParamsEnabledCalls.at(-1)).toBe(false);
  });

  it("recovers after the dev double-mount throw without a counter reset", () => {
    // The throw happens inside an effect setup, which never registers its
    // cleanup — so the offending mount's increment must be undone before
    // throwing. Otherwise the counter stays elevated for the session and a
    // CORRECTED tree (the second render here) keeps tripping the invariant
    // on every HMR update until a full reload.
    const Doubled = () => (
      <>
        <PeginPollingProvider
          activities={[ACTIVITY]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
        <PeginPollingProvider
          activities={[ACTIVITY]}
          pendingPegins={[]}
          btcPublicKey={BTC_PUBKEY}
        >
          <div />
        </PeginPollingProvider>
      </>
    );
    expect(() => render(<Doubled />)).toThrow(
      /PeginPollingProvider instances are mounted at once/,
    );

    const Single = () => (
      <PeginPollingProvider
        activities={[ACTIVITY]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );
    expect(() => render(<Single />)).not.toThrow();
  });

  it("allows a provider to remount after the previous one unmounts", () => {
    // The counter must not leak across mounts — RootLayout swaps its whole
    // content subtree for the geo-block branch, so a legitimate remount would
    // otherwise trip the invariant on the second visit.
    const Tree = () => (
      <PeginPollingProvider
        activities={[ACTIVITY]}
        pendingPegins={[]}
        btcPublicKey={BTC_PUBKEY}
      >
        <div />
      </PeginPollingProvider>
    );

    render(<Tree />).unmount();
    expect(() => render(<Tree />)).not.toThrow();
  });

  it("surfaces a protocol-params load failure on the deposit result", () => {
    // Without this the params query could fail and every row would sit on
    // "confirming" forever with nothing surfaced to the user.
    const paramsError = new Error("protocol params unavailable");
    mockProtocolParams.ready = false;
    mockProtocolParams.error = paramsError;

    const { result } = renderProvider();

    expect(result.current.getPollingResult(ACTIVITY_ID)?.error).toBe(
      paramsError,
    );
  });

  it("reports a protocol-params failure as failed, not as still loading", () => {
    // The queries have exhausted their retries, so `ready` can never flip. A
    // result asserting `loading` beside that error would park every consumer on
    // the loading branch forever — the frozen row this seam exists to prevent.
    mockProtocolParams.ready = false;
    mockProtocolParams.error = new Error("protocol params unavailable");

    const { result } = renderProvider();

    expect(result.current.getPollingResult(ACTIVITY_ID)?.loading).toBe(false);
  });

  it("still reports loading while the params are merely resolving", () => {
    // The other half of the same rule: unresolved is not failed, and a cold
    // load must not read as a settled "depth unknown".
    mockProtocolParams.ready = false;
    mockProtocolParams.error = null;

    const { result } = renderProvider();

    expect(result.current.getPollingResult(ACTIVITY_ID)?.loading).toBe(true);
  });
});
