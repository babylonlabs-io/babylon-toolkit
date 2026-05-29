/**
 * PendingWithdrawSection Component
 *
 * Displays the "Pending Withdraw" dashboard section with a summary card
 * that expands to show individual vault details (amount, status, provider, tx hash).
 * Follows the same pattern as PendingDepositSection.
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
import { BTC_BLOCK_TIME_MINS } from "@/constants";
import {
  ProtocolParamsProvider,
  useProtocolParamsContext,
} from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { useBtcMempoolConfirmations } from "@/hooks/useBtcMempoolConfirmations";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import { ClaimerPegoutStatusValue } from "@/models/pegoutStateMachine";
import { formatBtcAmount, formatDuration } from "@/utils/formatting";
import { payoutEtaMinutes } from "@/utils/pegoutTiming";
import { canonicalizeTxid } from "@/utils/txid";

import { PegoutTxHashRow } from "./PegoutTxHashRow";
import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultDetailCard, VaultStatusBadge } from "./VaultDetailCard";

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

  return (
    <div className="w-full space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Pending Withdraw ({count})
        </h2>
        <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
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

        {/* Expanded: individual vault detail cards */}
        {isExpanded && (
          <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
            {pendingWithdrawVaults.map((vault) => {
              const pollingResult = pegoutStatuses.get(vault.id);
              const displayState = pollingResult?.displayState;
              const label = displayState?.label ?? COPY.common.checking;
              const variant = displayState?.variant ?? "pending";
              const tooltip = displayState?.message;
              const claimer = pollingResult?.response?.claimer;

              // Payout ETA for any in-progress (pending) state: a static estimate
              // before the assert is on-chain, a live countdown once it is.
              let payoutEta: string | undefined;
              const timelockAssert = getOffchainParamsByVersion(
                vault.offchainParamsVersion,
              )?.timelockAssert;
              if (variant === "pending" && timelockAssert !== undefined) {
                const isAsserting =
                  claimer?.status === ClaimerPegoutStatusValue.ASSERT_BROADCAST;
                // Pre-assert: the full timelock remains (confirmations = 0).
                // Asserting: use live confirmations, but leave the ETA blank
                // until they're known so a transient unknown (initial load /
                // mempool 429) doesn't flash the full multi-day wait.
                const canonical = isAsserting
                  ? canonicalizeTxid(claimer?.assert_txid)
                  : undefined;
                const confirmations = isAsserting
                  ? canonical
                    ? confirmationsByTxid.get(canonical)
                    : undefined
                  : 0;
                if (confirmations !== undefined) {
                  const etaMinutes = payoutEtaMinutes(
                    Number(timelockAssert),
                    confirmations,
                    BTC_BLOCK_TIME_MINS,
                  );
                  payoutEta =
                    etaMinutes <= 0
                      ? COPY.pegout.payoutImminent
                      : COPY.pegout.payoutEta(formatDuration(etaMinutes));
                }
              }

              return (
                <VaultDetailCard
                  key={vault.id}
                  amountBtc={vault.amountBtc}
                  amountSubtext={
                    payoutEta ? (
                      <span className="text-sm text-accent-secondary">
                        {payoutEta}
                      </span>
                    ) : undefined
                  }
                  txHashRow={
                    <PegoutTxHashRow
                      claimTxHash={claimer?.claim_txid}
                      assertTxHash={claimer?.assert_txid}
                      claimerStatus={claimer?.status}
                    />
                  }
                  providerName={vault.providerName}
                  providerIconUrl={vault.providerIconUrl}
                  providerAddress={vault.vaultProviderAddress}
                  payoutBtcAddress={vault.payoutBtcAddress}
                  statusContent={
                    <VaultStatusBadge
                      dotColor={STATUS_DOT_COLORS[variant]}
                      label={label}
                      tooltip={tooltip}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
