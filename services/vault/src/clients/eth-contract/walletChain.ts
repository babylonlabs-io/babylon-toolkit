import {
  ETH_EMPTY_ACCOUNT_GRACE_MS,
  getSharedWagmiConfig,
} from "@babylonlabs-io/wallet-connector";
import type { Address, WalletClient } from "viem";
import {
  ConnectorAccountNotFoundError,
  ConnectorChainMismatchError,
} from "wagmi";
import {
  getAccount,
  getWalletClient,
  switchChain,
  watchAccount,
} from "wagmi/actions";

import { getETHChain } from "@/config/network";
import { ETH_MAINNET_CHAIN_ID } from "@/config/network/constants";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { ErrorCode, WalletError } from "@/utils/errors";

const walletNotConnected = () =>
  new WalletError(
    COPY.wallet.connectToContinue,
    ErrorCode.WALLET_NOT_CONNECTED,
  );

const chainSwitchRequired = (expectedChainId: number) =>
  new Error(
    COPY.wallet.chainSwitch.required(
      expectedChainId === ETH_MAINNET_CHAIN_ID
        ? COPY.wallet.chainSwitch.ethereumMainnet
        : COPY.wallet.chainSwitch.sepoliaTestnet,
    ),
  );

// wagmi's getConnectorClient throws ConnectorNotConnectedError when the
// connection drops mid-call. The class is not exported from "wagmi". A
// reconnect can also leave the connector briefly on another chain.
const isConnectionLostError = (error: unknown) =>
  error instanceof ConnectorAccountNotFoundError ||
  error instanceof ConnectorChainMismatchError ||
  (error instanceof Error && error.name === "ConnectorNotConnectedError");

type WagmiConfig = ReturnType<typeof getSharedWagmiConfig>;

// Mobile wallets can emit an empty account list and then re-emit the account,
// which wagmi reports as disconnected in between.
const waitForConnection = async (wagmiConfig: WagmiConfig) => {
  if (getAccount(wagmiConfig).status === "connected") return;
  await new Promise<void>((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      unwatch();
      resolve();
    };
    const unwatch = watchAccount(wagmiConfig, {
      onChange: (account) => {
        if (account.status === "connected") settle();
      },
    });
    const timer = setTimeout(settle, ETH_EMPTY_ACCOUNT_GRACE_MS);
  });
};

/**
 * Get a wallet client on the app's Ethereum chain, asking the wallet to
 * switch network only when its live connection is on another chain.
 *
 * Call this at click time. Wagmi's `useWalletClient` drops its data whenever
 * the component that reads it unmounts, so a client held from render can be
 * missing while the wallet is still connected.
 */
export async function getWalletClientOnExpectedChain(
  account: Address,
): Promise<WalletClient> {
  const wagmiConfig = getSharedWagmiConfig();
  const expectedChainId = getETHChain().id;

  let connection = getAccount(wagmiConfig);

  const fetchClient = async (): Promise<WalletClient> => {
    await waitForConnection(wagmiConfig);
    if (connection.status !== "connected") connection = getAccount(wagmiConfig);
    if (connection.status !== "connected" || !connection.connector) {
      throw walletNotConnected();
    }

    // Connectors throw provider errors here, not wagmi's connection-lost errors;
    // a connector that cannot report its chain cannot sign.
    const walletChainId = await connection.connector
      .getChainId()
      .catch((error: unknown) => {
        logger.error(error, {
          data: { context: "[walletChain] connector.getChainId failed" },
        });
        throw walletNotConnected();
      });

    if (walletChainId !== expectedChainId) {
      try {
        await switchChain(wagmiConfig, {
          chainId: expectedChainId,
          connector: connection.connector,
        });
      } catch (switchError) {
        logger.error(switchError, {
          data: { context: "Failed to switch chain" },
        });
        throw chainSwitchRequired(expectedChainId);
      }
    }

    return getWalletClient(wagmiConfig, {
      chainId: expectedChainId,
      account,
      connector: connection.connector,
    });
  };

  return fetchClient()
    .catch((error: unknown) => {
      if (!isConnectionLostError(error)) throw error;
      return fetchClient();
    })
    .catch((error: unknown) => {
      if (error instanceof ConnectorChainMismatchError) {
        throw chainSwitchRequired(expectedChainId);
      }
      throw isConnectionLostError(error) ? walletNotConnected() : error;
    });
}
