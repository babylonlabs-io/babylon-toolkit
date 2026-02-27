/**
 * Steps 1-2: ETH wallet and Pegin submission
 */

import { getETHChain } from "@babylonlabs-io/config";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Abi, Address, Hash, WalletClient } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import BTCVaultsManagerABI from "@/clients/eth-contract/btc-vaults-manager/abis/BTCVaultsManager.abi.json";
import { ethClient } from "@/clients/eth-contract/client";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import { selectUtxosForDeposit } from "@/services/vault";
import {
  preparePeginTransaction,
  registerPeginOnChain,
} from "@/services/vault/vaultTransactionService";
import { addPendingPegin } from "@/storage/peginStorage";
import { pollUntil } from "@/utils/async";
import { ContractError, mapViemErrorToContractError } from "@/utils/errors";

import type {
  PeginPrepareParams,
  PeginPrepareResult,
  PeginRegisterParams,
  PeginRegisterResult,
  SavePendingPeginParams,
} from "./types";

const ETH_CONFIRMATION_POLL_INTERVAL = 5_000; // 5s between polls
const ETH_CONFIRMATION_TIMEOUT = 120_000; // 2 minute timeout

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
// Step 2a: Prepare Pegin Transaction (build + fund BTC tx)
// ============================================================================

/**
 * Build and fund the BTC pegin transaction. Returns the btcTxid so the
 * caller can derive the Lamport keypair before on-chain registration.
 */
export async function preparePegin(
  params: PeginPrepareParams,
): Promise<PeginPrepareResult> {
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
  } = params;

  const utxosToUse = selectUtxosForDeposit({
    availableUtxos: confirmedUTXOs,
    reservedUtxoRefs,
    requiredAmount: amount,
    feeRate,
  });

  const result = await preparePeginTransaction(btcWalletProvider, walletClient, {
    pegInAmount: amount,
    feeRate,
    changeAddress: btcAddress,
    vaultProviderAddress: selectedProviders[0] as Address,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    availableUTXOs: utxosToUse,
  });

  return {
    btcTxid: result.btcTxHash,
    depositorBtcPubkey: result.depositorBtcPubkey,
    btcTxHex: result.fundedTxHex,
    selectedUTXOs: result.selectedUTXOs,
    fee: result.fee,
  };
}

// ============================================================================
// Step 2b: Register Pegin On-Chain (PoP + ETH tx + wait confirmation)
// ============================================================================

/**
 * Submit the PoP signature and ETH transaction, then wait for confirmation.
 */
export async function registerPeginAndWait(
  params: PeginRegisterParams,
): Promise<PeginRegisterResult> {
  const {
    btcWalletProvider,
    walletClient,
    depositorBtcPubkey,
    fundedTxHex,
    vaultProviderAddress,
    depositorLamportPkHash,
    onPopSigned,
  } = params;

  const result = await registerPeginOnChain(btcWalletProvider, walletClient, {
    depositorBtcPubkey,
    fundedTxHex,
    vaultProviderAddress: vaultProviderAddress as Address,
    depositorLamportPkHash,
    onPopSigned,
  });

  await waitForEthConfirmation(result.transactionHash);

  return {
    btcTxid: result.btcTxHash,
    ethTxHash: result.transactionHash,
  };
}

// ============================================================================
// ETH Confirmation Polling
// ============================================================================

/**
 * Poll for ETH transaction receipt, retrying on transient RPC errors.
 *
 * This polls with retries so a submitted transaction isn't lost
 * due to a momentary network hiccup.
 */
async function waitForEthConfirmation(ethTxHash: Hash): Promise<void> {
  const publicClient = ethClient.getPublicClient();

  try {
    await pollUntil(
      async () => {
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: ethTxHash,
          });

          if (receipt.status === "reverted") {
            throw mapViemErrorToContractError(
              new Error(
                `Transaction reverted. Hash: ${ethTxHash}. Check the transaction on block explorer for details.`,
              ),
              "pegin confirmation",
              [BTCVaultsManagerABI as Abi],
            );
          }

          return receipt;
        } catch (error) {
          if (error instanceof ContractError) throw error;
          return null;
        }
      },
      {
        intervalMs: ETH_CONFIRMATION_POLL_INTERVAL,
        timeoutMs: ETH_CONFIRMATION_TIMEOUT,
      },
    );
  } catch (error) {
    if (error instanceof ContractError) throw error;

    throw new Error(
      `ETH transaction not confirmed within ${ETH_CONFIRMATION_TIMEOUT / 1000}s. ` +
        `It may still be pending. Please check the transaction on a block explorer. ` +
        `Hash: ${ethTxHash}`,
    );
  }
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
