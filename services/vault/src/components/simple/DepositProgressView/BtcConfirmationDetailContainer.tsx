/**
 * Wires confirmation data into the presentational BtcConfirmationDetail
 * panel. Routes through the dashboard's polling cache so the modal and the
 * PendingDepositCard never disagree about depth — both consume the same
 * coalesced `prePeginConfirmations` value. Falls back to a direct mempool
 * poll only when the deposit isn't yet indexed (e.g. moments after
 * broadcast on the active flow, or when rendered outside the dashboard's
 * PeginPollingProvider).
 */

import { useOptionalDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { useBtcConfirmations } from "@/hooks/deposit/useBtcConfirmations";

import { BtcConfirmationDetail } from "./BtcConfirmationDetail";

interface BtcConfirmationDetailContainerProps {
  /** Date.now() when the panel first rendered for this deposit. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /**
   * Required confirmation depth, pinned to the offchain-params version this
   * deposit registered against — the version the VP gates the deposit on.
   */
  requiredDepth: number;
  /** Candidate deposit ids that share this Pre-PegIn broadcast. */
  depositIds: readonly string[];
}

export function BtcConfirmationDetailContainer({
  startedAt,
  prePeginTxid,
  requiredDepth,
  depositIds,
}: BtcConfirmationDetailContainerProps) {
  const polling = useOptionalDepositPollingResult(depositIds);
  // Direct poll only runs while the polling result is missing — once the
  // dashboard's cache is the source of truth, we trust it (avoids the
  // disagreement Greptile flagged: modal showing live count growing past
  // requiredDepth while the card has coalesced to "Finalizing").
  const fallback = useBtcConfirmations(polling ? null : prePeginTxid);
  const confirmations = polling
    ? polling.prePeginConfirmations
    : fallback.confirmations;

  return (
    <BtcConfirmationDetail
      startedAt={startedAt}
      prePeginTxid={prePeginTxid}
      confirmations={confirmations}
      requiredDepth={requiredDepth}
    />
  );
}
