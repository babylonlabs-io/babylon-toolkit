// BTC Vault Controller - Write operations (transactions)

import {
  type Address,
  type Hash,
  type TransactionReceipt,
  type Hex,
} from 'viem';
import { getWalletClient, switchChain } from '@wagmi/core';
import { getSharedWagmiConfig } from '@babylonlabs-io/wallet-connector';
import { sepolia } from 'viem/chains';
import { ethClient } from '../client';
import BTCVaultControllerABI from './abis/BTCVaultController.abi.json';

/**
 * Submit a pegin request
 * @param contractAddress - BTCVaultController contract address
 * @param unsignedPegInTx - Unsigned Bitcoin peg-in transaction
 * @param depositorBtcPubKey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash and receipt
 */
export async function submitPeginRequest(
  contractAddress: Address,
  unsignedPegInTx: Hex,
  depositorBtcPubKey: Hex,
  vaultProvider: Address,
): Promise<{
  transactionHash: Hash;
  receipt: TransactionReceipt;
}> {
  const publicClient = ethClient.getPublicClient();
  const wagmiConfig = getSharedWagmiConfig();

  try {
    // Use Sepolia for now (hardcoded for development)
    const chain = sepolia;

    // Switch to the correct chain if needed
    await switchChain(wagmiConfig, { chainId: chain.id });

    const walletClient = await getWalletClient(wagmiConfig, {
      chainId: chain.id,
    });
    if (!walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'submitPeginRequest',
      args: [unsignedPegInTx, depositorBtcPubKey, vaultProvider],
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to submit pegin request: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

