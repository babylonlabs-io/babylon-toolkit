/**
 * Wires the live confirmation poll into the presentational
 * BtcConfirmationDetail. Mounted only while the deposit is on the
 * AWAIT_BTC_CONFIRMATION step, so the mempool poll runs only then.
 */

import { useBtcConfirmations } from "@/hooks/deposit/useBtcConfirmations";

import { BtcConfirmationDetail } from "./BtcConfirmationDetail";

interface BtcConfirmationDetailContainerProps {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /**
   * Required confirmation depth, pinned to the offchain-params version this
   * deposit registered against — the version the VP gates the deposit on.
   */
  requiredDepth: number;
}

export function BtcConfirmationDetailContainer({
  startedAt,
  prePeginTxid,
  requiredDepth,
}: BtcConfirmationDetailContainerProps) {
  const { confirmations } = useBtcConfirmations(prePeginTxid);

  return (
    <BtcConfirmationDetail
      startedAt={startedAt}
      prePeginTxid={prePeginTxid}
      confirmations={confirmations}
      requiredDepth={requiredDepth}
    />
  );
}
