import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import { COPY } from "@/copy";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import {
  ClaimerPegoutStatusValue,
  getPegoutDisplayState,
  TIMED_OUT_STATE,
} from "@/models/pegoutStateMachine";

import { PendingWithdrawCard } from "../PendingWithdrawCard";

const CARD = COPY.pegout.card;

const CLAIM_TXID = "a".repeat(64);
const ASSERT_TXID = "b".repeat(64);
const PEGIN_TXID = "c".repeat(64);
const CLAIMER_CREATED_AT = 1_700_000_500; // unix seconds

function makeVault(
  overrides: Partial<RedeemedVaultInfo> = {},
): RedeemedVaultInfo {
  return {
    id: "0xvault",
    peginTxHash: PEGIN_TXID,
    amountBtc: 0.6,
    providerName: "Test VP",
    vaultProviderAddress: `0x${"1".repeat(40)}`,
    createdAt: 1_690_000_000_000,
    offchainParamsVersion: 1,
    ...overrides,
  };
}

/** Polling result for a vault the VP has a claimer record for. */
function resultForStatus(status: string): PegoutPollingResult {
  return {
    displayState: getPegoutDisplayState(status, true),
    response: {
      pegin_txid: PEGIN_TXID,
      found: true,
      claimer: {
        status,
        failed: status === ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
        claim_txid: CLAIM_TXID,
        claimer_pubkey: "",
        assert_txid: ASSERT_TXID,
        created_at: CLAIMER_CREATED_AT,
        updated_at: CLAIMER_CREATED_AT,
      },
      challengers: [],
    },
  };
}

function renderCard(
  pollingResult: PegoutPollingResult,
  props: Partial<{
    timelockAssertBlocks: number;
    assertConfirmations: number;
  }> = {},
) {
  render(
    <PendingWithdrawCard
      vault={makeVault()}
      pollingResult={pollingResult}
      timelockAssertBlocks={props.timelockAssertBlocks}
      assertConfirmations={props.assertConfirmations}
    />,
  );
}

describe("PendingWithdrawCard — stage presentation", () => {
  it("shows a Pending tx placeholder and no Date row before the VP has a record", () => {
    // found === false: no claimer, no withdrawal timestamp yet.
    renderCard({ displayState: getPegoutDisplayState(undefined, false) });

    expect(screen.getByText(CARD.withdrawalTxLabel)).toBeInTheDocument();
    expect(screen.getByText(CARD.withdrawalTxPending)).toBeInTheDocument();
    expect(screen.queryByText(CARD.initiatedLabel)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(CARD.contactSupport)).not.toBeInTheDocument();
  });

  it("links the claim tx and shows the Initiated row while In progress", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.CLAIM_BROADCAST));

    expect(screen.getByText(CARD.initiatedLabel)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining(CLAIM_TXID));
  });

  it("shows the challenge-period countdown and note, linking the assert tx", () => {
    // 144 timelock − 72 confirmations = 72 blocks × 10 min = 720 min = 12 hours.
    renderCard(resultForStatus(ClaimerPegoutStatusValue.ASSERT_BROADCAST), {
      timelockAssertBlocks: 144,
      assertConfirmations: 72,
    });

    expect(screen.getByText(CARD.challengePeriodEndsLabel)).toBeInTheDocument();
    expect(
      screen.getByText(CARD.challengePeriodEndsIn("12 hours")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CARD.challengeNote, { exact: false }),
    ).toBeInTheDocument();
    // The withdrawal tx link now points at the assert tx (the latest on-chain tx).
    const assertLinked = screen
      .getAllByRole("link")
      .some((a) => a.getAttribute("href")?.includes(ASSERT_TXID));
    expect(assertLinked).toBe(true);
  });

  it("shows the live confirmation count toward the payout clock during the challenge period", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.ASSERT_BROADCAST), {
      timelockAssertBlocks: 144,
      assertConfirmations: 72,
    });

    expect(screen.getByText(CARD.confirmationsLabel)).toBeInTheDocument();
    expect(
      screen.getByText(CARD.confirmationsValue(72, 144)),
    ).toBeInTheDocument();
  });

  it("clamps the confirmation count so an overshoot never exceeds the timelock", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.ASSERT_BROADCAST), {
      timelockAssertBlocks: 144,
      assertConfirmations: 200,
    });

    expect(
      screen.getByText(CARD.confirmationsValue(144, 144)),
    ).toBeInTheDocument();
  });

  it("omits the confirmation count until the live count is known", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.ASSERT_BROADCAST), {
      timelockAssertBlocks: 144,
    });

    expect(screen.queryByText(CARD.confirmationsLabel)).not.toBeInTheDocument();
  });

  it("states the typical challenge-period duration derived from the timelock", () => {
    // 144 blocks × 10 min = 1440 min = 1 day.
    renderCard(resultForStatus(ClaimerPegoutStatusValue.ASSERT_BROADCAST), {
      timelockAssertBlocks: 144,
      assertConfirmations: 72,
    });

    expect(
      screen.getByText(CARD.challengePeriodTypicalDuration("1 day"), {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the progress bar and shows no Contact Support for Payout sent", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.PAYOUT_BROADCAST));

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(CARD.contactSupport)).not.toBeInTheDocument();
  });

  it("shows Contact Support and hides the progress bar only when truly Blocked", () => {
    renderCard(resultForStatus(ClaimerPegoutStatusValue.PAYOUT_BLOCKED));

    expect(
      screen.getByRole("link", { name: CARD.contactSupport }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("PendingWithdrawCard — warning states are not treated as Blocked", () => {
  it("a polling timeout keeps the bar and shows no Contact Support", () => {
    // TIMED_OUT_STATE has the warning variant but is not a protocol block.
    renderCard({ displayState: TIMED_OUT_STATE });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(CARD.contactSupport)).not.toBeInTheDocument();
  });

  it("an unrecognized status keeps the bar and shows no Contact Support", () => {
    renderCard(resultForStatus("SomeFutureStatus"));

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(CARD.contactSupport)).not.toBeInTheDocument();
  });
});
