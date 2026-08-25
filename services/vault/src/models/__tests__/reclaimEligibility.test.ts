import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import {
  RECLAIM_MIN_PAYOUT_CONFIRMATIONS,
  getReclaimEligibility,
  type ReclaimEligibilityInput,
} from "@/models/reclaimEligibility";

const TIP_HEIGHT = 900_000;
/** A Payout buried exactly at the required depth. */
const DEEP_PAYOUT_HEIGHT = TIP_HEIGHT - RECLAIM_MIN_PAYOUT_CONFIRMATIONS + 1;

function makeInput(
  overrides: Partial<ReclaimEligibilityInput> = {},
): ReclaimEligibilityInput {
  return {
    onChainStatus: OnChainBtcVaultStatus.REDEEMED,
    payoutSpend: {
      spent: true,
      confirmed: true,
      blockHeight: DEEP_PAYOUT_HEIGHT,
    },
    reserveSpend: { spent: false, confirmed: false },
    tipHeight: TIP_HEIGHT,
    isOwnedByWallet: true,
    isLedgerWallet: false,
    isWithdrawBlocked: false,
    isReclaimInFlight: false,
    ...overrides,
  };
}

describe("getReclaimEligibility", () => {
  it("offers the reclaim once the payout is deeply confirmed and the reserve is unspent", () => {
    expect(getReclaimEligibility(makeInput())).toEqual({ type: "available" });
  });

  it("hides the reclaim when the contract says redeemed but the vault UTXO is unspent", () => {
    // The case an Ethereum-status-only gate would wrongly allow: the contract
    // sets Redeemed before any Bitcoin claim happens, so the depositor's claim
    // right — funded by this very reserve — still matters here.
    const result = getReclaimEligibility(
      makeInput({ payoutSpend: { spent: false, confirmed: false } }),
    );

    expect(result).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the payout spend is unconfirmed", () => {
    expect(
      getReclaimEligibility(
        makeInput({ payoutSpend: { spent: true, confirmed: false } }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the payout is confirmed but not deep enough", () => {
    expect(
      getReclaimEligibility(
        makeInput({
          payoutSpend: {
            spent: true,
            confirmed: true,
            blockHeight: DEEP_PAYOUT_HEIGHT + 1,
          },
        }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("treats a confirmed payout with no block height as a single confirmation", () => {
    // A partial esplora response delays the offer rather than waving it through.
    expect(
      getReclaimEligibility(
        makeInput({ payoutSpend: { spent: true, confirmed: true } }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("keeps the row actionless once the reserve spend has confirmed", () => {
    expect(
      getReclaimEligibility(
        makeInput({ reserveSpend: { spent: true, confirmed: true } }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("reports reclaiming while the sweep is broadcast but unconfirmed", () => {
    expect(
      getReclaimEligibility(
        makeInput({ reserveSpend: { spent: true, confirmed: false } }),
      ),
    ).toEqual({ type: "reclaiming" });
  });

  it("reports reclaiming from the in-session marker before the poll sees the spend", () => {
    // The 60s poll still shows the reserve unspent; without the marker the row
    // would keep offering an enabled button for up to a minute after confirm.
    expect(
      getReclaimEligibility(makeInput({ isReclaimInFlight: true })),
    ).toEqual({ type: "reclaiming" });
  });

  it("does not report reclaiming for a spend on a vault that never passed the gate", () => {
    // An unconfirmed spend without a settled payout is a protocol claim_tx,
    // not a reclaim — do not attribute it to this feature.
    expect(
      getReclaimEligibility(
        makeInput({
          payoutSpend: { spent: false, confirmed: false },
          reserveSpend: { spent: true, confirmed: false },
        }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("ignores the in-session marker when the vault is not eligible anyway", () => {
    expect(
      getReclaimEligibility(
        makeInput({
          isReclaimInFlight: true,
          payoutSpend: { spent: false, confirmed: false },
        }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim for a vault that is not redeemed on chain", () => {
    expect(
      getReclaimEligibility(
        makeInput({ onChainStatus: OnChainBtcVaultStatus.ACTIVE }),
      ),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim for a vault the connected wallet does not own", () => {
    expect(
      getReclaimEligibility(makeInput({ isOwnedByWallet: false })),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the on-chain status has not loaded", () => {
    expect(
      getReclaimEligibility(makeInput({ onChainStatus: undefined })),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the payout spend read has not loaded", () => {
    expect(
      getReclaimEligibility(makeInput({ payoutSpend: undefined })),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the reserve spend read has not loaded", () => {
    expect(
      getReclaimEligibility(makeInput({ reserveSpend: undefined })),
    ).toEqual({ type: "absent" });
  });

  it("hides the reclaim while the chain tip has not loaded", () => {
    expect(getReclaimEligibility(makeInput({ tipHeight: undefined }))).toEqual({
      type: "absent",
    });
  });

  it("blocks with an explanation while the protocol has paused exits", () => {
    expect(
      getReclaimEligibility(makeInput({ isWithdrawBlocked: true })),
    ).toEqual({
      type: "blocked",
      tooltip: COPY.reclaim.blocked.protocolPaused,
    });
  });

  it("blocks with an explanation on the Ledger vault wallet", () => {
    // Blocked rather than hidden: the device firmware cannot sign this shape,
    // and a silent absence would mean Ledger users never learn the reserve
    // exists.
    expect(getReclaimEligibility(makeInput({ isLedgerWallet: true }))).toEqual({
      type: "blocked",
      tooltip: COPY.reclaim.blocked.ledgerUnsupported,
    });
  });

  it("prefers the reclaiming state over the Ledger block once a sweep is in flight", () => {
    // A sweep already broadcast from another wallet is in flight regardless of
    // what this session is connected with.
    expect(
      getReclaimEligibility(
        makeInput({
          isLedgerWallet: true,
          reserveSpend: { spent: true, confirmed: false },
        }),
      ),
    ).toEqual({ type: "reclaiming" });
  });

  it("hides rather than blocks on Ledger when the vault is not eligible anyway", () => {
    // The wallet check sits behind the eligibility checks, so an ineligible
    // vault never advertises a reclaim the depositor could not perform.
    expect(
      getReclaimEligibility(
        makeInput({
          isLedgerWallet: true,
          reserveSpend: { spent: true, confirmed: true },
        }),
      ),
    ).toEqual({ type: "absent" });
  });
});
