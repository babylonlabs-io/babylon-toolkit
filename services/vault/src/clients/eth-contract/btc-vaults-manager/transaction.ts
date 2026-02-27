/**
 * BTC Vaults Manager - Write operations (transactions)
 */

import { BYTES32_ZERO } from "@babylonlabs-io/ts-sdk/tbv/core";
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
  depositorLamportPkHash: Hex = BYTES32_ZERO,
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
      depositorLamportPkHash,
    ],
    errorContext: "submit pegin request",
  });
}
