/**
 * PendingWithdrawSection Component
 *
 * Displays the "Pending Withdraw" dashboard section with a summary card
 * that expands to show one staged progress card per withdrawal (see
 * PendingWithdrawCard). Follows the same pattern as PendingDepositSection.
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import { ExpandMenuButton } from "@/components/shared";
import {
  CARD_DARK_BG_CLASS,
  SUMMARY_CARD_CLASS,
} from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import {
  ProtocolParamsProvider,
  useProtocolParamsContext,
} from "@/context/ProtocolParamsContext";
import { useBtcMempoolConfirmations } from "@/hooks/useBtcMempoolConfirmations";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import {
  ClaimerPegoutStatusValue,
  isPegoutInProgress,
} from "@/models/pegoutStateMachine";
import { formatBtcAmount } from "@/utils/formatting";
import { canonicalizeTxid } from "@/utils/txid";

import { PendingWithdrawCard } from "./PendingWithdrawCard";

const btcConfig = getNetworkConfigBTC();

/** React Query namespace for the Assert-tx confirmation poller. */
const ASSERT_CONFIRMATIONS_QUERY_KEY = "assertMempoolConfirmations";

interface PendingWithdrawSectionProps {
  pendingWithdrawVaults: RedeemedVaultInfo[];
  pegoutStatuses: Map<string, PegoutPollingResult>;
}

export function PendingWithdrawSection(props: PendingWithdrawSectionProps) {
  // Dashboard has no ProtocolParamsProvider (see PendingDepositSection); mount
  // one for the countdown, but only when there's something to show.
  if (props.pendingWithdrawVaults.length === 0) return null;

  return (
    <ProtocolParamsProvider>
      <PendingWithdrawSectionContent {...props} />
    </ProtocolParamsProvider>
  );
}

function PendingWithdrawSectionContent({
  pendingWithdrawVaults,
  pegoutStatuses,
}: PendingWithdrawSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { getOffchainParamsByVersion } = useProtocolParamsContext();

  // Poll Assert-tx confirmations (BIP68 payout clock) only while expanded — the
  // countdown is the only consumer and it's hidden when collapsed.
  const assertTxids = useMemo(
    () =>
      isExpanded
        ? pendingWithdrawVaults.map((vault) => {
            const claimer = pegoutStatuses.get(vault.id)?.response?.claimer;
            return claimer?.status === ClaimerPegoutStatusValue.ASSERT_BROADCAST
              ? claimer.assert_txid
              : undefined;
          })
        : [],
    [isExpanded, pendingWithdrawVaults, pegoutStatuses],
  );
  const { confirmationsByTxid } = useBtcMempoolConfirmations(
    assertTxids,
    ASSERT_CONFIRMATIONS_QUERY_KEY,
  );

  const totalBtc = pendingWithdrawVaults.reduce(
    (sum, v) => sum + v.amountBtc,
    0,
  );
  const count = pendingWithdrawVaults.length;

  // The header spinner means "work in progress". Hide it once every vault has
  // stopped progressing — payout sent, blocked, or polling timed out — so the
  // section doesn't imply activity that isn't happening.
  const anyInProgress = pendingWithdrawVaults.some((vault) => {
    const result = pegoutStatuses.get(vault.id);
    return isPegoutInProgress(
      result?.response?.claimer?.status,
      result?.displayState,
    );
  });

  return (
    <div className="w-full space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Pending Withdraw ({count})
        </h2>
        {anyInProgress && (
          <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        )}
      </div>

      {/* Summary card with expand */}
      <Card
        variant="filled"
        className={`${SUMMARY_CARD_CLASS} ${CARD_DARK_BG_CLASS}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="medium"
            />
            <span className="text-xl text-accent-primary">
              {formatBtcAmount(totalBtc)}
            </span>
          </div>
          <ExpandMenuButton
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((prev) => !prev)}
            aria-label="Pending withdraw details"
          />
        </div>

        {/* Expanded: one staged progress card per vault. */}
        {isExpanded && (
          <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
            {pendingWithdrawVaults.map((vault) => {
              const pollingResult = pegoutStatuses.get(vault.id);
              const claimer = pollingResult?.response?.claimer;

              const timelockAssert = getOffchainParamsByVersion(
                vault.offchainParamsVersion,
              )?.timelockAssert;

              // Assert-tx confirmations are the payout CSV clock; only resolved
              // while the assert tx is broadcast and being polled (expanded).
              const canonical = canonicalizeTxid(claimer?.assert_txid);
              const assertConfirmations = canonical
                ? confirmationsByTxid.get(canonical)
                : undefined;

              return (
                <PendingWithdrawCard
                  key={vault.id}
                  vault={vault}
                  pollingResult={pollingResult}
                  timelockAssertBlocks={
                    timelockAssert !== undefined
                      ? Number(timelockAssert)
                      : undefined
                  }
                  assertConfirmations={assertConfirmations}
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
