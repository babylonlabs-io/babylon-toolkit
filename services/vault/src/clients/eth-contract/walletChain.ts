import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { getETHChain } from "@/config/network";
import { ETH_MAINNET_CHAIN_ID } from "@/config/network/constants";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

/**
 * Get a wallet client on the app's Ethereum chain, asking the wallet to
 * switch network first.
 */
export async function getWalletClientOnExpectedChain(
  account: Address,
): Promise<WalletClient> {
  const wagmiConfig = getSharedWagmiConfig();
  const expectedChainId = getETHChain().id;

  try {
    await switchChain(wagmiConfig, { chainId: expectedChainId });
  } catch (switchError) {
    logger.error(switchError, { data: { context: "Failed to switch chain" } });
    throw new Error(
      COPY.wallet.chainSwitch.required(
        expectedChainId === ETH_MAINNET_CHAIN_ID
          ? COPY.wallet.chainSwitch.ethereumMainnet
          : COPY.wallet.chainSwitch.sepoliaTestnet,
      ),
    );
  }

  const walletClient = await getWalletClient(wagmiConfig, {
    chainId: expectedChainId,
    account,
  });

  if (!walletClient) {
    throw new Error("Failed to get wallet client");
  }

  return walletClient;
}

/**
 * Return the connected wallet client when it is already on the app's Ethereum
 * chain; otherwise ask the wallet to switch first.
 */
export async function ensureWalletClientOnExpectedChain(
  walletClient: WalletClient,
  account: Address,
): Promise<WalletClient> {
  return walletClient.chain?.id === getETHChain().id
    ? walletClient
    : getWalletClientOnExpectedChain(account);
}
