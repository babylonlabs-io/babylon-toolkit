/**
 * Steps 1-3: ETH wallet acquisition, BIP-322 PoP signing, pegin submission.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { PopSignature } from "@babylonlabs-io/ts-sdk/tbv/core";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { logger } from "@/infrastructure";
import {
  registerPeginBatchOnChain,
  signProofOfPossession as sdkSignProofOfPossession,
} from "@/services/vault/vaultTransactionService";

import type {
  PeginBatchRegisterParams,
  PeginBatchRegisterResult,
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
// Step 2: Sign BIP-322 Proof of Possession (one wallet popup per session)
// ============================================================================

export async function signProofOfPossession(
  btcWalletProvider: BitcoinWallet,
  walletClient: WalletClient,
): Promise<PopSignature> {
  return sdkSignProofOfPossession(btcWalletProvider, walletClient);
}

// ============================================================================
// Step 3: Batch Register Pegins On-Chain (single ETH tx for N vaults)
// ============================================================================

/**
 * Submit all vault registrations in a single ETH transaction using
 * submitPeginRequestBatch(). Receipt verification is handled by the SDK.
 */
export async function registerPeginBatchAndWait(
  params: PeginBatchRegisterParams,
): Promise<PeginBatchRegisterResult> {
  const {
    btcWalletProvider,
    walletClient,
    vaultProviderAddress,
    unsignedPrePeginTx,
    requests,
    popSignature,
  } = params;

  const result = await registerPeginBatchOnChain(
    btcWalletProvider,
    walletClient,
    {
      vaultProviderAddress: vaultProviderAddress as Address,
      unsignedPrePeginTx,
      requests,
      popSignature,
    },
  );

  return {
    ethTxHash: result.ethTxHash,
    vaults: result.vaults,
  };
}
