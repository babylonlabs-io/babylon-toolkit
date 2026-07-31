import { describe, expect, it } from "vitest";

import {
  computeDepositPollingResult,
  type DepositPollingInputs,
} from "@/context/deposit/computeDepositPollingResult";
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
    refundTimelock: 10,
    activationDeadlinePassed: false,
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
