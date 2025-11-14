// BTC Vaults Manager - Write operations (transactions)

import {
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { mapViemErrorToContractError } from "../../../utils/errors";
import { ethClient } from "../client";

import BTCVaultsManagerABI from "./abis/BTCVaultsManager.abi.json";

/**
 * Submit a pegin request
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultsManager contract address
 * @param depositor - Depositor's Ethereum address
 * @param depositorBtcPubKey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param btcPopSignature - BIP-322 or ECDSA proof of possession signature
 * @param unsignedPegInTx - Unsigned Bitcoin peg-in transaction
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash, receipt, and vault ID
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
): Promise<{
  transactionHash: Hash;
  receipt: TransactionReceipt;
}> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
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
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "submit pegin request");
  }
}
