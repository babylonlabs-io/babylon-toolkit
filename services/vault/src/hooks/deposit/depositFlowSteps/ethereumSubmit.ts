/**
 * Steps 1-2: ETH wallet and Pegin submission
 */

import { getETHChain } from "@babylonlabs-io/config";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import {
  getWalletClient,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import { selectUtxosForDeposit } from "@/services/vault";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import { addPendingPegin } from "@/storage/peginStorage";
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

  // Wait for ETH transaction confirmation
  const wagmiConfig = getSharedWagmiConfig();
  try {
    await waitForTransactionReceipt(wagmiConfig, {
      hash: ethTxHash,
      confirmations: 1,
    });
  } catch {
    throw new Error(
      `ETH transaction not confirmed. It may have been dropped or replaced. ` +
        `Please check your wallet and retry. Hash: ${ethTxHash}`,
    );
  }

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
