// ETH smart contract client for write operations (transactions)

import {
  createWalletClient,
  custom,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem';

import { ethQueryClient } from './query';

/**
 * Submit an ERC20 token transfer transaction
 * @param contractAddress - The ERC20 token contract address
 * @param walletProvider - The wallet provider (e.g., window.ethereum) from ETHWalletProvider
 * @param recipientAddress - The address to send tokens to
 * @param amount - The amount to send (in token units, not wei)
 * @returns Transaction hash and receipt
 */
export async function submitERC20Transfer(
  contractAddress: Address,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletProvider: any,
  recipientAddress: Address,
  amount: string
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const config = ethQueryClient.getConfig();
  const publicClient = ethQueryClient.getPublicClient();

  // Create wallet client with the provider
  const walletClient = createWalletClient({
    chain: config.chain,
    transport: custom(walletProvider),
  });

  const erc20Abi = [
    {
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
    {
      name: 'decimals',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint8' }],
    },
  ] as const;

  try {
    // Get connected account from wallet
    const [account] = await walletClient.getAddresses();
    if (!account) {
      throw new Error('No account connected');
    }

    // Get decimals to format amount
    const decimals = await publicClient.readContract({
      address: contractAddress,
      abi: erc20Abi,
      functionName: 'decimals',
    });

    const amountInWei = BigInt(Math.floor(Number(amount) * 10 ** decimals));

    // Submit transaction
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress, amountInWei],
      account,
    });

    console.log(`Transaction submitted: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw new Error(
      `Failed to submit ERC20 transfer: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
