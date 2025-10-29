import { ONE_MINUTE, ONE_SECOND } from "@/ui/common/constants";
import { useBbnRpc } from "@/ui/common/context/rpc/BbnRpcProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { ClientError } from "@/ui/common/errors";
import { ERROR_CODES } from "@/ui/common/errors/codes";
import { useHealthCheck } from "@/ui/common/hooks/useHealthCheck";

import { useClientQuery } from "../../useClient";
import { useRpcErrorHandler } from "../useRpcErrorHandler";

const BBN_BTCLIGHTCLIENT_TIP_KEY = "BBN_BTCLIGHTCLIENT_TIP";
const BBN_BALANCE_KEY = "BBN_BALANCE";
const BBN_REWARDS_KEY = "BBN_REWARDS";
const BBN_HEIGHT_KEY = "BBN_HEIGHT";

/**
 * Query service for Babylon which contains all the queries for
 * interacting with Babylon RPC nodes
 */
export const useBbnQuery = () => {
  const { isGeoBlocked, isLoading: isHealthcheckLoading } = useHealthCheck();
  const { bech32Address, connected } = useCosmosWallet();
  const { rpcClient, isLoading: isRpcLoading } = useBbnRpc();
  const { hasRpcError, reconnect } = useRpcErrorHandler();

  /**
   * Gets the total available BTC staking rewards from the user's account.
   * This includes both base BTC staking rewards (BTC_STAKER gauge) and
   * co-staking bonus rewards (COSTAKER gauge).
   * @returns {Promise<number>} - Total available rewards in ubbn (base BTC + co-staking bonus).
   */
  const rewardsQuery = useClientQuery({
    queryKey: [BBN_REWARDS_KEY, bech32Address, connected],
    queryFn: async () => {
      if (!connected || !rpcClient || !bech32Address) {
        return 0;
      }
      try {
        const rewards = await rpcClient.btc.getRewards(bech32Address);
        return Number(rewards);
      } catch (error) {
        throw new ClientError(
          ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
          "Error getting rewards",
          { cause: error as Error },
        );
      }
    },
    enabled: Boolean(
      rpcClient &&
        connected &&
        bech32Address &&
        !isGeoBlocked &&
        !isHealthcheckLoading,
    ),
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
  });

  /**
   * Gets the balance of the user's account.
   * @returns {Promise<number>} - The balance of the user's account in ubbn.
   */
  const balanceQuery = useClientQuery({
    queryKey: [BBN_BALANCE_KEY, bech32Address, connected],
    queryFn: async () => {
      if (!connected || !rpcClient || !bech32Address) {
        return 0;
      }
      const balance = await rpcClient.baby.getBalance(bech32Address, "ubbn");
      return Number(balance);
    },
    enabled: Boolean(
      rpcClient &&
        connected &&
        bech32Address &&
        !isGeoBlocked &&
        !isHealthcheckLoading,
    ),
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
  });

  /**
   * Gets the tip of the Bitcoin blockchain.
   * @returns {Promise<number>} - The height of the Bitcoin blockchain tip.
   */
  const btcTipQuery = useClientQuery({
    queryKey: [BBN_BTCLIGHTCLIENT_TIP_KEY],
    queryFn: async () => {
      if (!rpcClient) {
        throw new ClientError(
          ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
          "Error getting Bitcoin tip height: rpcClient not available",
        );
      }
      return await rpcClient.btc.getBTCTipHeight();
    },
    enabled: Boolean(
      rpcClient && !isRpcLoading && !isGeoBlocked && !isHealthcheckLoading,
    ),
    staleTime: ONE_MINUTE,
    refetchInterval: false, // Disable automatic periodic refetching
  });

  /**
   * Gets the current height of the Babylon Genesis chain.
   * @returns {Promise<number>} - The current height of the Babylon Genesis chain.
   */
  const babyTipQuery = useClientQuery({
    queryKey: [BBN_HEIGHT_KEY],
    queryFn: async () => {
      if (!rpcClient) {
        throw new ClientError(
          ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
          "Error getting Babylon chain height: rpcClient not available",
        );
      }
      try {
        return await rpcClient.baby.getBlockHeight();
      } catch (error) {
        throw new ClientError(
          ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
          "Error getting Babylon chain height",
          { cause: error as Error },
        );
      }
    },
    enabled: Boolean(rpcClient && !isRpcLoading && connected),
    staleTime: ONE_SECOND * 10,
    refetchInterval: false, // Disable automatic periodic refetching
  });

  return {
    rewardsQuery,
    balanceQuery,
    btcTipQuery,
    babyTipQuery,
    hasRpcError,
    reconnectRpc: reconnect,
  };
};
