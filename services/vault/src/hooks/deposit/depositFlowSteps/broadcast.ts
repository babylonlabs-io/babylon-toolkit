/**
 * Step 3: Broadcast Pre-PegIn BTC transaction
 */

import type { Address } from "viem";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import { waitForContractVerification } from "@/services/deposit/polling";
import { broadcastPrePeginTransaction } from "@/services/vault";
import { updatePendingPeginStatus } from "@/storage/peginStorage";

import type { BroadcastParams } from "./types";

// Re-export for convenience - caller uses this before broadcastBtcTransaction
export { waitForContractVerification };

/**
 * Sign and broadcast the funded Pre-PegIn transaction to Bitcoin.
 *
 * Uses the funded tx hex passed directly from memory rather than
 * re-fetching from the indexer, since broadcast now runs right after
 * ETH submission (before the indexer has processed the event).
 */
export async function broadcastBtcTransaction(
  params: BroadcastParams,
  depositorEthAddress: Address,
): Promise<string> {
  const {
    vaultId,
    depositorBtcPubkey,
    btcWalletProvider,
    fundedPrePeginTxHex,
    expectedUtxos,
  } = params;

  const broadcastTxId = await broadcastPrePeginTransaction({
    unsignedTxHex: fundedPrePeginTxHex,
    btcWalletProvider: {
      signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
    },
    depositorBtcPubkey,
    expectedUtxos,
  });

  // Update localStorage
  updatePendingPeginStatus(
    depositorEthAddress,
    vaultId,
    LocalStorageStatus.CONFIRMING,
  );

  return broadcastTxId;
}
