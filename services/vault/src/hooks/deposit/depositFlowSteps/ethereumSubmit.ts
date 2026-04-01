/**
 * Steps 1-2: ETH wallet and Pegin submission
 */

import { getETHChain } from "@babylonlabs-io/config";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Abi, Address, Hash, WalletClient } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import BTCVaultRegistryABI from "@/clients/eth-contract/btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import { ethClient } from "@/clients/eth-contract/client";
import { logger } from "@/infrastructure";
import { registerPeginOnChain } from "@/services/vault/vaultTransactionService";
import { pollUntil } from "@/utils/async";
import { ContractError, mapViemErrorToContractError } from "@/utils/errors";

import type { PeginRegisterParams, PeginRegisterResult } from "./types";

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
    logger.error(
      switchError instanceof Error
        ? switchError
        : new Error(String(switchError)),
      { data: { context: "Failed to switch chain" } },
    );
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
    peginTxHex,
    unsignedPrePeginTxHex,
    hashlock,
    htlcVout,
    vaultProviderAddress,
    onPopSigned,
    depositorPayoutBtcAddress,
    depositorLamportPkHash,
    preSignedBtcPopSignature,
    depositorSecretHash,
  } = params;

  const result = await registerPeginOnChain(btcWalletProvider, walletClient, {
    depositorBtcPubkey,
    unsignedPrePeginTxHex,
    peginTxHex,
    hashlock,
    htlcVout,
    vaultProviderAddress: vaultProviderAddress as Address,
    onPopSigned,
    depositorPayoutBtcAddress,
    depositorLamportPkHash,
    preSignedBtcPopSignature,
    depositorSecretHash,
  });

  await waitForEthConfirmation(result.transactionHash);

  return {
    btcTxid: result.btcTxHash,
    ethTxHash: result.transactionHash,
    btcPopSignature: result.btcPopSignature,
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
              [BTCVaultRegistryABI as Abi],
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
