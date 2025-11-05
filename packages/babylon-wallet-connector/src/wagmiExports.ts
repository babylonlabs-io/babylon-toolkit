/**
 * Re-export wagmi hooks to ensure all consumers use the same wagmi instance.
 * This prevents "WagmiProviderNotFoundError" caused by multiple wagmi instances.
 *
 * Always import these hooks from @babylonlabs-io/wallet-connector instead of
 * directly from 'wagmi' to ensure you're using the same instance as the WagmiProvider.
 */

export {
  useAccount,
  useBalance,
  useBlockNumber,
  useChainId,
  useConnect,
  useConnections,
  useConnectorClient,
  useConfig,
  useDisconnect,
  useEstimateGas,
  useGasPrice,
  usePrepareTransactionRequest,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
  useTransaction,
  useTransactionReceipt,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
  type UseAccountReturnType,
  type UseBalanceReturnType,
  type UseConnectReturnType,
  type UseWalletClientReturnType,
} from 'wagmi';
