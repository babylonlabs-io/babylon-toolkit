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

  let hash: Hash | undefined;

  try {
    hash = await walletClient.writeContract({
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

    // Wait for transaction receipt with extended timeout for testnet/mainnet
    // Ethereum blocks can take 12-15 seconds, testnets can be slower
    // 5 minutes should be sufficient for most cases
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 300_000, // 5 minutes in milliseconds
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    // If we have a transaction hash, the transaction was submitted successfully
    // even if we timed out waiting for the receipt
    if (hash) {
      // Re-throw with the transaction hash included so user can check Etherscan
      const enhancedError = new Error(
        `Transaction submitted with hash ${hash}, but receipt polling timed out. ` +
        `Please check the transaction on Etherscan. The transaction may still be pending or confirmed. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
      enhancedError.cause = error;
      throw enhancedError;
    }

    throw mapViemErrorToContractError(error, "submit pegin request");
  }
}
