/**
 * Steps 1-2: ETH wallet and Pegin submission
 */

import { getETHChain } from "@babylonlabs-io/config";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { logger } from "@/infrastructure";
import { registerPeginOnChain } from "@/services/vault/vaultTransactionService";

import type { PeginRegisterParams, PeginRegisterResult } from "./types";

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
 * Receipt verification is handled by the SDK's registerPeginOnChain().
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
    depositorWotsPkHash,
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
    depositorWotsPkHash,
    preSignedBtcPopSignature,
    depositorSecretHash,
  });

  return {
    btcTxid: result.btcTxHash,
    ethTxHash: result.transactionHash,
    btcPopSignature: result.btcPopSignature,
  };
}
