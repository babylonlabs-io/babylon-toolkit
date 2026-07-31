import { describe, expect, it } from "vitest";

import {
  computeDepositPollingResult,
  type DepositPollingInputs,
} from "@/context/deposit/computeDepositPollingResult";
import {
  ContractStatus,
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
    wotsSubmitted: new Set(),
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
