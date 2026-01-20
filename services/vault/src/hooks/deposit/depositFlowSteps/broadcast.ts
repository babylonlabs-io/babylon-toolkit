/**
 * Step 4: BTC transaction broadcast
 */

import type { Address, Hex } from "viem";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import { waitForContractVerification } from "@/services/deposit/polling";
import { broadcastPeginTransaction, fetchVaultById } from "@/services/vault";
import { updatePendingPeginStatus } from "@/storage/peginStorage";

import type { BroadcastParams } from "./types";

// Re-export for convenience - caller uses this before broadcastBtcTransaction
export { waitForContractVerification };

/**
 * Broadcast BTC transaction after verification is complete.
 * Returns the broadcast transaction ID.
 *
 * Note: Call waitForContractVerification() first to ensure the vault is verified.
 */
export async function broadcastBtcTransaction(
  params: BroadcastParams,
  depositorEthAddress: Address,
): Promise<string> {
  const { btcTxid, depositorBtcPubkey, btcWalletProvider } = params;

  // Fetch vault to get unsigned tx
  const vault = await fetchVaultById(btcTxid as Hex);
  if (!vault?.unsignedBtcTx) {
    throw new Error("Vault or unsigned transaction not found");
  }

  // Broadcast BTC transaction
  const broadcastTxId = await broadcastPeginTransaction({
    unsignedTxHex: vault.unsignedBtcTx,
    btcWalletProvider: {
      signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
    },
    depositorBtcPubkey,
  });

  // Update localStorage
  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.CONFIRMING,
    broadcastTxId,
  );

  return broadcastTxId;
}
