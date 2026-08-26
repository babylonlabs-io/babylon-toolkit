import { describe, expect, it } from "vitest";

import {
  computeDepositPollingResult,
  type DepositPollingInputs,
} from "@/context/deposit/computeDepositPollingResult";
import { COPY } from "@/copy";
import {
  ContractStatus,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
  PeginAction,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import { canonicalizeTxid } from "@/utils/txid";

const VAULT_ID = `0x${"11".repeat(32)}` as const;
const PREPEGIN_TX = `0x${"ab".repeat(32)}` as const;
const PEGIN_TX = `0x${"cd".repeat(32)}` as const;
const REFUND_TX = `0x${"ef".repeat(32)}` as const;
const PUBKEY = "ab".repeat(32);
// matureRefundTxids keys off the canonical (lowercased, no-0x) Pre-PegIn txid.
const CANONICAL_PREPEGIN = canonicalizeTxid(PREPEGIN_TX) as string;

function makeExpiredActivity(): VaultActivity {
  return {
    id: VAULT_ID,
    collateral: { amount: "1", symbol: "BTC" },
    providers: [],
    displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
    unsignedPrePeginTx: "00",
    depositorWotsPkHash: `0x${"00".repeat(32)}`,
    prePeginTxHash: PREPEGIN_TX,
    contractStatus: ContractStatus.EXPIRED,
    depositorBtcPubkey: PUBKEY,
    htlcVout: 0,
  };
}

function makeInputs(
  overrides: Partial<DepositPollingInputs> = {},
): DepositPollingInputs {
  return {
    activity: makeExpiredActivity(),
    activationFloorBlocksRemaining: undefined,
    pendingPegins: [],
    pendingDepositorSignatures: undefined,
    errors: undefined,
    needsWotsKey: undefined,
    pendingIngestion: undefined,
    prePeginConfirmationsByTxid: new Map(),
    confirmedTxids: new Set(),
    // Cached-mature → refundMaturityState "mature" without needing live confs.
    matureRefundTxids: new Set([CANONICAL_PREPEGIN]),
    htlcRefundByDepositId: new Map(),
    refundedHtlcVaultIds: new Set(),
    requiredDepth: 6,
    protocolParamsError: null,
    refundTimelock: 10,
    activationDeadlinePassed: false,
    stuckStateConfirmedOnChain: false,
    isLoading: false,
    optimisticStatuses: new Map(),
    optimisticRefundBroadcastAt: new Map(),
    wotsSubmittedAt: new Map(),
    btcPublicKey: PUBKEY,
    ...overrides,
  };
}

describe("computeDepositPollingResult — refund settlement", () => {
  it("offers the refund action for a mature EXPIRED vault whose HTLC is unspent", () => {
    const result = computeDepositPollingResult(makeInputs());
    expect(result.peginState.availableActions).toContain(
      PeginAction.REFUND_HTLC,
    );
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
  });

  it("hides the refund action and shows Refunded once the HTLC spend confirms", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        htlcRefundByDepositId: new Map([
          [VAULT_ID.toLowerCase(), { spent: true, confirmed: true }],
        ]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDED);
  });

  it("shows Refunding while the HTLC spend is seen but unconfirmed", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        htlcRefundByDepositId: new Map([
          [VAULT_ID.toLowerCase(), { spent: true, confirmed: false }],
        ]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDING);
  });

  it("treats a cached confirmed-refund as settled even when the live poll is empty", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        htlcRefundByDepositId: new Map(),
        refundedHtlcVaultIds: new Set([VAULT_ID.toLowerCase()]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDED);
  });
});

describe("computeDepositPollingResult — activation deadline gate", () => {
  function makeVerifiedActivity(): VaultActivity {
    return {
      ...makeExpiredActivity(),
      displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
      contractStatus: ContractStatus.VERIFIED,
      peginTxHash: PEGIN_TX,
    };
  }

  it("gates Activate to expired when the deadline is confirmed passed", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        activationDeadlinePassed: true,
      }),
    );
    expect(result.peginState.availableActions).toEqual([PeginAction.NONE]);
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.EXPIRED);
  });

  it("leaves Activate available when the deadline has not passed", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        activationDeadlinePassed: false,
      }),
    );
    expect(result.peginState.availableActions).toContain(
      PeginAction.ACTIVATE_VAULT,
    );
    expect(result.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    );
  });

  it("flags the stuck state when the HTLC is spent by the PegIn tx while still VERIFIED", () => {
    // The spender arrives in esplora's bare-hex form while the activity's
    // PegIn txid is 0x-prefixed indexer hex — the comparison must hold
    // ACROSS forms, so the fixture deliberately mismatches them. Same-form
    // fixtures would keep passing even if canonicalization broke, which
    // would silently disable the hatch for genuinely swept vaults.
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        stuckStateConfirmedOnChain: true,
        htlcRefundByDepositId: new Map([
          [
            VAULT_ID.toLowerCase(),
            {
              spent: true,
              confirmed: false,
              spendingTxid: PEGIN_TX.slice("0x".length),
            },
          ],
        ]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([
      PeginAction.ACTIVATE_AND_REDEEM,
    ]);
    expect(result.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.ACTIVATION_INCOMPLETE,
    );
  });

  it("does not flag the stuck state when the chain has not confirmed it", () => {
    // The indexer-lag case, and the reason the on-chain confirm exists. The
    // BTC evidence here is IDENTICAL to the test above — the VP's sweep is what
    // activation looks like on the BTC side — so the only thing separating a
    // healthy activated deposit from a genuinely stuck one is whether the chain
    // still reports VERIFIED. Without this gate a second device (or a cleared
    // profile, having no local reveal marker) rendered "Activation incomplete"
    // and fired a signing prompt on a perfectly healthy deposit.
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        stuckStateConfirmedOnChain: false,
        htlcRefundByDepositId: new Map([
          [
            VAULT_ID.toLowerCase(),
            {
              spent: true,
              confirmed: false,
              spendingTxid: PEGIN_TX.slice("0x".length),
            },
          ],
        ]),
      }),
    );
    expect(result.peginState.availableActions).not.toContain(
      PeginAction.ACTIVATE_AND_REDEEM,
    );
    expect(result.peginState.displayLabel).not.toBe(
      PEGIN_DISPLAY_LABELS.ACTIVATION_INCOMPLETE,
    );
  });

  it("does not flag the stuck state when the HTLC spender is not the PegIn tx", () => {
    // A spent HTLC can be the depositor's own CSV refund — the ETH-side
    // VERIFIED status says nothing about BTC-side timing. Offering the
    // secret-revealing escape hatch there would burn the secret for a vault
    // whose funds already came back; the normal flow must stand.
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        htlcRefundByDepositId: new Map([
          [
            VAULT_ID.toLowerCase(),
            { spent: true, confirmed: false, spendingTxid: REFUND_TX },
          ],
        ]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([
      PeginAction.ACTIVATE_VAULT,
    ]);
    expect(result.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    );
  });

  it("does not flag the stuck state when the spender is unknown (fail-safe)", () => {
    // An outspend row without `spendingTxid` is ambiguous evidence — the
    // hatch reveals the secret, so it is only offered on proof.
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        htlcRefundByDepositId: new Map([
          [VAULT_ID.toLowerCase(), { spent: true, confirmed: false }],
        ]),
      }),
    );
    expect(result.peginState.availableActions).toEqual([
      PeginAction.ACTIVATE_VAULT,
    ]);
  });

  it("does not flag the stuck state from the refunded cache alone (live probe only)", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makeVerifiedActivity(),
        htlcRefundByDepositId: new Map(),
        refundedHtlcVaultIds: new Set([VAULT_ID.toLowerCase()]),
      }),
    );
    expect(result.peginState.availableActions).toContain(
      PeginAction.ACTIVATE_VAULT,
    );
    expect(result.peginState.displayLabel).toBe(
      PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    );
  });
});

describe("computeDepositPollingResult — unresolved protocol params", () => {
  function makePendingActivity(): VaultActivity {
    return {
      ...makeExpiredActivity(),
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      contractStatus: ContractStatus.PENDING,
    };
  }

  it("never reports the Pre-PegIn at depth while the required depth is unknown", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makePendingActivity(),
        matureRefundTxids: new Set(),
        // 100 confirmations would clear any real threshold. Guards against a
        // future `requiredDepth ?? SOME_DEFAULT`: today an undefined threshold
        // already fails the comparison via NaN, so this pins the invariant
        // rather than the mechanism.
        prePeginConfirmationsByTxid: new Map([[CANONICAL_PREPEGIN, 100]]),
        confirmedTxids: new Set(),
        requiredDepth: undefined,
        pendingIngestion: new Set([VAULT_ID]),
      }),
    );
    expect(result.requiredPrePeginDepth).toBeUndefined();
    expect(result.peginState.message).not.toBe(
      COPY.pegin.messages.prePeginIngesting,
    );
  });

  it("reports no confirmation count from a cached at-depth txid while the required depth is unknown", () => {
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makePendingActivity(),
        matureRefundTxids: new Set(),
        confirmedTxids: new Set([CANONICAL_PREPEGIN]),
        requiredDepth: undefined,
      }),
    );
    expect(result.prePeginConfirmations).toBeNull();
  });

  it("still reports a cached at-depth txid as confirmed while the required depth is unknown", () => {
    // The deliberate other half of the case above, previously uncovered. The
    // cache entry was only written while the threshold WAS known and depth
    // never rewinds, so the boolean stays sound — only the count is
    // unrecoverable. Pinned via the state machine's ingesting branch, which
    // fires solely on `prePeginBroadcastConfirmed`.
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makePendingActivity(),
        matureRefundTxids: new Set(),
        confirmedTxids: new Set([CANONICAL_PREPEGIN]),
        requiredDepth: undefined,
        pendingIngestion: new Set([VAULT_ID]),
      }),
    );
    expect(result.peginState.message).toBe(
      COPY.pegin.messages.prePeginIngesting,
    );
    expect(result.prePeginConfirmations).toBeNull();
  });

  it("surfaces a protocol-params failure as the deposit error", () => {
    const paramsError = new Error("protocol params unavailable");
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makePendingActivity(),
        matureRefundTxids: new Set(),
        requiredDepth: undefined,
        protocolParamsError: paramsError,
      }),
    );
    expect(result.error).toBe(paramsError);
  });

  it("prefers a per-deposit polling error over the protocol-params failure", () => {
    const depositError = new Error("provider unreachable");
    const result = computeDepositPollingResult(
      makeInputs({
        activity: makePendingActivity(),
        matureRefundTxids: new Set(),
        errors: new Map([[VAULT_ID, depositError]]),
        protocolParamsError: new Error("protocol params unavailable"),
      }),
    );
    expect(result.error).toBe(depositError);
  });
});

/**
 * Both sides of the WOTS suppression window, driven by the injected `now`
 * rather than a faked system clock — which is the point of `DepositPollingInputs.now`
 * existing. The equivalent tests at the provider and store levels need
 * `vi.useFakeTimers`, because they exercise the `Date.now()` default; these do
 * not, and that is what makes this module's "pure per-deposit compute" header
 * true in practice rather than only in the type. Same shape as
 * `isRefundBroadcastWithinTtl`'s `now`, which `peginStateMachine.test.ts`
 * exercises the same way.
 */
describe("computeDepositPollingResult — WOTS suppression clock", () => {
  const SUBMITTED_AT = Date.parse("2026-07-27T12:00:00Z");
  const INSIDE_WINDOW = SUBMITTED_AT + 5 * 60 * 1000;
  const PAST_WINDOW = SUBMITTED_AT + 21 * 60 * 1000;

  function makeAwaitingWotsInputs(now: number): DepositPollingInputs {
    return makeInputs({
      activity: {
        ...makeExpiredActivity(),
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        contractStatus: ContractStatus.PENDING,
      },
      needsWotsKey: new Set([VAULT_ID]),
      wotsSubmittedAt: new Map([[VAULT_ID, SUBMITTED_AT]]),
      now,
    });
  }

  it("suppresses Submit WOTS Key while the submission is inside the window", () => {
    const result = computeDepositPollingResult(
      makeAwaitingWotsInputs(INSIDE_WINDOW),
    );
    expect(result.peginState.availableActions).not.toContain(
      PeginAction.SUBMIT_WOTS_KEY,
    );
  });

  it("re-offers Submit WOTS Key once the injected clock is past the window", () => {
    const result = computeDepositPollingResult(
      makeAwaitingWotsInputs(PAST_WINDOW),
    );
    expect(result.peginState.availableActions).toContain(
      PeginAction.SUBMIT_WOTS_KEY,
    );
  });
});

/**
 * The injected `now` must also reach the refund-broadcast TTL inside
 * `getPeginState` — one clock for every suppression window a single call
 * judges. Without the forward, the WOTS decision would honor the injected
 * time while the refund decision silently read `Date.now()`; the
 * inside-the-window case below fails in that world, because the real clock
 * sits years past the fixture's broadcast time.
 */
describe("computeDepositPollingResult — refund suppression clock", () => {
  const BROADCAST_AT = Date.parse("2026-07-27T12:00:00Z");
  const INSIDE_WINDOW = BROADCAST_AT + 60 * 60 * 1000;
  const PAST_WINDOW = BROADCAST_AT + 7 * 60 * 60 * 1000;

  function makeBroadcastRefundInputs(now: number): DepositPollingInputs {
    return makeInputs({
      optimisticStatuses: new Map([
        [VAULT_ID, LocalStorageStatus.REFUND_BROADCAST],
      ]),
      optimisticRefundBroadcastAt: new Map([[VAULT_ID, BROADCAST_AT]]),
      now,
    });
  }

  it("suppresses the refund action while the broadcast is inside the window", () => {
    const result = computeDepositPollingResult(
      makeBroadcastRefundInputs(INSIDE_WINDOW),
    );
    expect(result.peginState.availableActions).not.toContain(
      PeginAction.REFUND_HTLC,
    );
    expect(result.peginState.displayLabel).toBe(PEGIN_DISPLAY_LABELS.REFUNDING);
  });

  it("re-offers the refund action once the injected clock is past the window", () => {
    const result = computeDepositPollingResult(
      makeBroadcastRefundInputs(PAST_WINDOW),
    );
    expect(result.peginState.availableActions).toContain(
      PeginAction.REFUND_HTLC,
    );
  });
});
