/**
 * Wires the live confirmation poll and the protocol-required depth into the
 * presentational BtcConfirmationDetail. Mounted only while the deposit is on
 * the AWAIT_BTC_CONFIRMATION step, so the mempool poll runs only then.
 */

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useBtcConfirmations } from "@/hooks/deposit/useBtcConfirmations";

import { BtcConfirmationDetail } from "./BtcConfirmationDetail";

interface BtcConfirmationDetailContainerProps {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
}

export function BtcConfirmationDetailContainer({
  startedAt,
  prePeginTxid,
}: BtcConfirmationDetailContainerProps) {
  const { confirmations } = useBtcConfirmations(prePeginTxid);
  const { config } = useProtocolParamsContext();

  return (
    <BtcConfirmationDetail
      startedAt={startedAt}
      prePeginTxid={prePeginTxid}
      confirmations={confirmations}
      requiredDepth={config.offchainParams.minPrepeginDepth}
    />
  );
}
