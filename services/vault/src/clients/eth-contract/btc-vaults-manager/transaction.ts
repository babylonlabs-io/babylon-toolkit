/**
 * BTC Vaults Manager - Write operations (transactions)
 */

import { type Address, type Chain, type Hex, type WalletClient } from "viem";

import {
  executeWriteWithHashRecovery,
  type TransactionResult,
} from "../transactionFactory";

import BTCVaultsManagerABI from "./abis/BTCVaultsManager.abi.json";

/**
 * Submit a pegin request
 */
export async function submitPeginRequest(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  depositor: Address,
  depositorBtcPubKey: Hex,
  btcPopSignature: Hex,
  unsignedPegInTx: Hex,
  vaultProvider: Address,
): Promise<TransactionResult> {
  return executeWriteWithHashRecovery({
    walletClient,
    chain,
    address: contractAddress,
    abi: BTCVaultsManagerABI,
    functionName: "submitPeginRequest",
    args: [
      depositor,
      depositorBtcPubKey,
      btcPopSignature,
      unsignedPegInTx,
      vaultProvider,
    ],
    errorContext: "submit pegin request",
  });
}
