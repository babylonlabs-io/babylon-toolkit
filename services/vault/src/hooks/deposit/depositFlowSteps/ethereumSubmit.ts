/**
 * Steps 1-2: ETH wallet and Pegin submission
 */

import { getETHChain } from "@babylonlabs-io/config";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import {
  getTransaction,
  getWalletClient,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";

import {
  ETH_CONFIRMATION_RETRY_INTERVAL,
  ETH_CONFIRMATION_TIMEOUT,
} from "@/constants";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import { selectUtxosForDeposit } from "@/services/vault";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import { addPendingPegin } from "@/storage/peginStorage";
import { pollUntil } from "@/utils/async";
import { processPublicKeyToXOnly } from "@/utils/btc";

import type {
  PeginSubmitParams,
  PeginSubmitResult,
  SavePendingPeginParams,
} from "./types";

// ============================================================================
// Step 1: Get ETH Wallet Client
// ============================================================================

/**
 * Get ETH wallet client, switching chain if needed.
 */
export async function getEthWalletClient(
  depositorEthAddress: Address,
): Promise<WalletClient> {
  const wagmiConfig = getSharedWagmiConfig();
  const expectedChainId = getETHChain().id;

  try {
    await switchChain(wagmiConfig, { chainId: expectedChainId });
  } catch (switchError) {
    console.error("Failed to switch chain:", switchError);
    throw new Error(
      `Please switch to ${expectedChainId === 1 ? "Ethereum Mainnet" : "Sepolia Testnet"} in your wallet`,
    );
  }

  const walletClient = await getWalletClient(wagmiConfig, {
    chainId: expectedChainId,
    account: depositorEthAddress,
  });

  if (!walletClient) {
    throw new Error("Failed to get wallet client");
  }

  return walletClient;
}

// ============================================================================
// Step 2: Submit Pegin Request
// ============================================================================

/**
 * Wait for ETH transaction confirmation with retry logic.
 *
 * This handles transient network errors (timeouts, RPC issues) that can cause
 * false "transaction dropped" errors even when the transaction succeeded.
 *
 * @param ethTxHash - The transaction hash to wait for
 * @throws Error if transaction is actually dropped/failed or timeout exceeded
 */
async function waitForEthConfirmation(ethTxHash: `0x${string}`): Promise<void> {
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Use pollUntil for retry logic on transient network errors
    await pollUntil<true>(
      async () => {
        try {
          const receipt = await waitForTransactionReceipt(wagmiConfig, {
            hash: ethTxHash,
            confirmations: 1,
            // Short timeout per attempt - pollUntil handles overall timeout
            timeout: 30_000,
          });

          // Check if transaction actually failed on-chain
          if (receipt.status === "reverted") {
            throw new Error(
              `ETH transaction reverted on-chain. Hash: ${ethTxHash}`,
            );
          }

          return true;
        } catch (error) {
          // If it's a revert error, don't retry - propagate immediately
          if (
            error instanceof Error &&
            error.message.includes("reverted on-chain")
          ) {
            throw error;
          }

          // For other errors (timeout, network), check if tx exists on-chain
          // This helps distinguish "actually dropped" from "network hiccup"
          try {
            const tx = await getTransaction(wagmiConfig, { hash: ethTxHash });
            if (tx) {
              // Transaction exists on-chain, just network issues - retry
              return null;
            }
          } catch {
            // Can't verify tx existence - assume transient, retry
          }

          // Return null to continue polling/retrying
          return null;
        }
      },
      {
        intervalMs: ETH_CONFIRMATION_RETRY_INTERVAL,
        timeoutMs: ETH_CONFIRMATION_TIMEOUT,
        // All errors in pollFn are handled internally, so no isTransient needed
      },
    );
  } catch (error) {
    // pollUntil timed out or a non-retryable error occurred
    const isTimeout =
      error instanceof Error && error.message.includes("timeout");

    if (isTimeout) {
      throw new Error(
        `ETH transaction confirmation timed out. The transaction may still be processing. ` +
          `Please close this dialog and check the Deposits table below - your vault should appear there once confirmed. ` +
          `Hash: ${ethTxHash}`,
      );
    }

    // Re-throw revert errors or other non-transient errors
    if (error instanceof Error && error.message.includes("reverted")) {
      throw error;
    }

    throw new Error(
      `ETH transaction not confirmed. It may have been dropped or replaced. ` +
        `If you see the transaction as confirmed in your wallet, close this dialog and check the Deposits table. ` +
        `Hash: ${ethTxHash}`,
    );
  }
}

/**
 * Submit pegin request (PoP signature + ETH transaction).
 * Returns transaction details after ETH confirmation.
 */
export async function submitPeginAndWait(
  params: PeginSubmitParams,
): Promise<PeginSubmitResult> {
  const {
    btcWalletProvider,
    walletClient,
    amount,
    feeRate,
    btcAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    confirmedUTXOs,
    reservedUtxoRefs,
    onPopSigned,
  } = params;

  const utxosToUse = selectUtxosForDeposit({
    availableUtxos: confirmedUTXOs,
    reservedUtxoRefs,
    requiredAmount: amount,
    feeRate,
  });

  // Submit pegin request
  const result = await submitPeginRequest(btcWalletProvider, walletClient, {
    pegInAmount: amount,
    feeRate,
    changeAddress: btcAddress,
    // TODO: support multiple vault providers
    vaultProviderAddress: selectedProviders[0] as Address,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    availableUTXOs: utxosToUse,
    onPopSigned,
  });

  // Get depositor's BTC public key
  const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
  const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

  const btcTxid = result.btcTxHash;
  const ethTxHash = result.transactionHash;

  // Wait for ETH transaction confirmation with retry logic
  await waitForEthConfirmation(ethTxHash);

  return {
    btcTxid,
    ethTxHash,
    depositorBtcPubkey,
    btcTxHex: result.btcTxHex,
    selectedUTXOs: result.selectedUTXOs,
    fee: result.fee,
  };
}

// ============================================================================
// LocalStorage Helper
// ============================================================================

/**
 * Save pending pegin to localStorage.
 */
export function savePendingPegin(params: SavePendingPeginParams): void {
  const {
    depositorEthAddress,
    btcTxid,
    ethTxHash,
    amount,
    selectedProviders,
    applicationController,
    unsignedTxHex,
    selectedUTXOs,
  } = params;

  const amountBtc = depositService.formatSatoshisToBtc(amount);

  addPendingPegin(depositorEthAddress, {
    id: btcTxid,
    amount: amountBtc,
    providerIds: selectedProviders,
    applicationController,
    status: LocalStorageStatus.PENDING,
    btcTxHash: ethTxHash,
    unsignedTxHex,
    selectedUTXOs: selectedUTXOs.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value.toString(),
      scriptPubKey: utxo.scriptPubKey,
    })),
  });
}
