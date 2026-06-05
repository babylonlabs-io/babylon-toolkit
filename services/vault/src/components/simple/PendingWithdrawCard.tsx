/**
 * PendingWithdrawCard
 *
 * Staged progress card for a single in-flight withdrawal (peg-out). Presents the
 * withdrawal as the Figma stages — Submitted → In progress → Challenge period →
 * Payout sent, plus the Blocked error state — with a progress bar, the
 * withdrawal's own tx hash, the submission date, and (during the challenge
 * period) a live payout-eligibility countdown and security note.
 *
 * Stage label/variant/message and the progress fraction come from
 * pegoutStateMachine; this component only lays them out.
 */

import { Avatar, Hint } from "@babylonlabs-io/core-ui";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import { CopyableHash } from "@/components/shared/CopyableHash";
import { ExplorerLink } from "@/components/shared/ExplorerLink";
import { getNetworkConfigBTC } from "@/config";
import {
  BTC_BLOCK_TIME_MINS,
  SUPPORT_URL,
  WITHDRAWAL_LATENCY_DOCS_URL,
} from "@/constants";
import { COPY } from "@/copy";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import {
  ClaimerPegoutStatusValue,
  getPegoutStageProgress,
  getPegoutTxLinkFlags,
} from "@/models/pegoutStateMachine";
import { getTokenBrandColor } from "@/services/token/tokenService";
import { truncateAddress } from "@/utils/addressUtils";
import {
  getBtcExplorerAddressUrl,
  getBtcExplorerTxUrl,
  getVpExplorerProviderUrl,
  getVpExplorerVaultUrl,
} from "@/utils/explorer";
import {
  formatBtcAmount,
  formatDateTime,
  formatDuration,
} from "@/utils/formatting";
import { payoutEtaMinutes } from "@/utils/pegoutTiming";

import { ProgressBar } from "./DepositProgressView/ProgressBar";
import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultCardRow, VaultCardShell } from "./VaultCardShell";
import { VaultStatusBadge } from "./VaultDetailCard";

const btcConfig = getNetworkConfigBTC();

// The withdrawn asset is Bitcoin; tint the progress bar with its brand color.
const ASSET_BRAND_COLOR = getTokenBrandColor(btcConfig.coinSymbol);

const CARD_COPY = COPY.pegout.card;

interface PendingWithdrawCardProps {
  vault: RedeemedVaultInfo;
  pollingResult?: PegoutPollingResult;
  /** Vault's `timelockAssert` (BTC blocks), resolved by the section from the
   *  vault's offchain-params version. Undefined while unresolved. */
  timelockAssertBlocks?: number;
  /** Assert-tx confirmations (BIP68 CSV clock) for this vault, or undefined
   *  while unknown. Only meaningful during the challenge period. */
  assertConfirmations?: number;
}

/** The single withdrawal tx hash to surface: the assert tx once it's on-chain,
 *  otherwise the claim tx once it's on-chain, otherwise a pending placeholder
 *  (the txids are pre-computed at peg-in, so they exist before broadcast). */
function WithdrawalTxValue({
  claimTxHash,
  assertTxHash,
  claimerStatus,
}: {
  claimTxHash?: string;
  assertTxHash?: string;
  claimerStatus?: string;
}) {
  const { linkClaim, linkAssert } = getPegoutTxLinkFlags(claimerStatus);

  if (linkAssert && assertTxHash) {
    return (
      <CopyableHash
        hash={assertTxHash}
        chain="BTC"
        explorerUrl={getBtcExplorerTxUrl(assertTxHash)}
      />
    );
  }
  if (linkClaim && claimTxHash) {
    return (
      <CopyableHash
        hash={claimTxHash}
        chain="BTC"
        explorerUrl={getBtcExplorerTxUrl(claimTxHash)}
      />
    );
  }
  return (
    <span className="text-sm text-accent-secondary">
      {CARD_COPY.withdrawalTxPending}
    </span>
  );
}

export function PendingWithdrawCard({
  vault,
  pollingResult,
  timelockAssertBlocks,
  assertConfirmations,
}: PendingWithdrawCardProps) {
  const displayState = pollingResult?.displayState;
  const label = displayState?.label ?? COPY.common.checking;
  const variant = displayState?.variant ?? "pending";
  const tooltip = displayState?.message;

  const claimer = pollingResult?.response?.claimer;
  const found = pollingResult?.response?.found ?? false;
  const isChallengePeriod =
    claimer?.status === ClaimerPegoutStatusValue.ASSERT_BROADCAST;
  // Only a genuine protocol block gets the error treatment (red Contact
  // Support, hidden bar). The `warning` variant is also used for transient
  // polling timeouts / unknown statuses, which should keep the normal layout.
  const isBlocked = claimer?.status === ClaimerPegoutStatusValue.PAYOUT_BLOCKED;

  const progress = getPegoutStageProgress(
    claimer?.status,
    found,
    assertConfirmations,
    timelockAssertBlocks,
  );

  // Withdrawal submission date. Only the VP claimer record carries a real
  // withdrawal timestamp — there is no on-chain redeem timestamp, and
  // vault.createdAt is the peg-in time. Omit the row until the record exists.
  const timestampMs =
    claimer?.created_at !== undefined ? claimer.created_at * 1000 : undefined;

  // Live payout-eligibility estimate, shown only during the challenge period.
  let estRemaining: string | undefined;
  if (isChallengePeriod) {
    if (
      timelockAssertBlocks !== undefined &&
      assertConfirmations !== undefined
    ) {
      const etaMinutes = payoutEtaMinutes(
        timelockAssertBlocks,
        assertConfirmations,
        BTC_BLOCK_TIME_MINS,
      );
      estRemaining =
        etaMinutes <= 0
          ? CARD_COPY.challengePeriodEndsSoon
          : CARD_COPY.challengePeriodEndsIn(formatDuration(etaMinutes));
    } else {
      estRemaining = COPY.common.checking;
    }
  }

  return (
    <VaultCardShell>
      {/* Header: amount (left) + stage badge with info tooltip (right). */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="medium"
          />
          <span className="text-xl font-medium text-accent-primary">
            {formatBtcAmount(vault.amountBtc)}
          </span>
          <ExplorerLink
            href={getVpExplorerVaultUrl(vault.id)}
            label={COPY.explorer.vaultLinkLabel}
          />
        </div>
        <VaultStatusBadge
          dotColor={STATUS_DOT_COLORS[variant]}
          label={label}
          tooltip={tooltip}
        />
      </div>

      {/* Progress bar — omitted only for a real protocol block, where the red
          badge and Contact Support carry the message instead. */}
      {!isBlocked && (
        <ProgressBar percent={progress} color={ASSET_BRAND_COLOR} />
      )}

      <VaultCardRow label={CARD_COPY.withdrawalTxLabel}>
        <WithdrawalTxValue
          claimTxHash={claimer?.claim_txid}
          assertTxHash={claimer?.assert_txid}
          claimerStatus={claimer?.status}
        />
      </VaultCardRow>

      {/* Initiated — hidden until the VP has a withdrawal record (no earlier
          withdrawal timestamp exists). */}
      {timestampMs !== undefined && (
        <VaultCardRow label={CARD_COPY.initiatedLabel}>
          <span className="text-sm text-accent-primary">
            {formatDateTime(new Date(timestampMs))}
          </span>
        </VaultCardRow>
      )}

      {estRemaining && (
        <VaultCardRow label={CARD_COPY.challengePeriodEndsLabel}>
          <span className="text-sm text-accent-primary">{estRemaining}</span>
        </VaultCardRow>
      )}

      <VaultCardRow label="Vault provider">
        <span className="inline-flex items-center gap-1.5">
          <Hint
            tooltip={truncateAddress(vault.vaultProviderAddress)}
            attachToChildren
            placement="left"
            className="text-sm text-accent-primary"
          >
            <span className="inline-flex items-center gap-1.5">
              {vault.providerIconUrl && (
                <Avatar
                  url={vault.providerIconUrl}
                  alt={vault.providerName}
                  size="small"
                  className="h-4 w-4"
                />
              )}
              {vault.providerName}
            </span>
          </Hint>
          <ExplorerLink
            href={getVpExplorerProviderUrl(vault.vaultProviderAddress)}
            label={COPY.explorer.providerLinkLabel}
            size={14}
          />
        </span>
      </VaultCardRow>

      {/* Nominated address — destination registered at vault creation. May
          differ from the currently connected BTC wallet. */}
      {vault.payoutBtcAddress && (
        <VaultCardRow label="Nominated address">
          <CopyableHash
            hash={vault.payoutBtcAddress}
            chain="BTC"
            kind="address"
            explorerUrl={getBtcExplorerAddressUrl(vault.payoutBtcAddress)}
          />
        </VaultCardRow>
      )}

      {/* Challenge-period security note. */}
      {isChallengePeriod && (
        <div className="rounded-lg bg-secondary-highlight p-3 text-sm text-accent-secondary">
          {CARD_COPY.challengeNote} {CARD_COPY.learnMorePrefix}
          <a
            href={WITHDRAWAL_LATENCY_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary underline"
          >
            {CARD_COPY.learnMoreLink}
          </a>
        </div>
      )}

      {/* Blocked: route the user to support. */}
      {isBlocked && (
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-lg bg-error-main py-3 text-center text-sm font-medium text-accent-contrast"
        >
          {CARD_COPY.contactSupport}
        </a>
      )}
    </VaultCardShell>
  );
}
