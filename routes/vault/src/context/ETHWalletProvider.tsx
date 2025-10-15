/**
 * ETH Wallet Provider for Vault
 *
 * Provides ETH wallet functionality via wagmi hooks and AppKit integration.
 * This provider requires a WagmiProvider parent (provided by VaultLayout).
 */

import {
  createContext,
  useContext,
  useState,
  PropsWithChildren,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import type { ETHTypedData } from "@babylonlabs-io/wallet-connector";
import { formatUnits } from "viem";
import {
  useBalance,
  useSignMessage,
  useSignTypedData,
  useSendTransaction,
  useAccount,
  useDisconnect,
  useConnect,
  useConnectors,
} from "wagmi";

interface ETHWalletContextType {
  // Connection state
  loading: boolean;
  connected: boolean;
  open: (connectorId?: string) => void;
  disconnect: () => void;
  availableConnectors: { id: string; name: string }[];

  // Account info
  address: string;
  publicKeyHex: string;

  // Balance
  balance: number; // In ETH, not wei
  formattedBalance: string;

  // Network info
  chainId?: number;
  networkName?: string;

  // Operations
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  signTypedData: (typedData: ETHTypedData) => Promise<string>;
  sendTransaction: (to: string, value: string) => Promise<string>;
  getBalance: () => Promise<bigint>;
  getNonce: () => Promise<number>;
  switchChain: (chainId: number) => Promise<void>;

  // Transaction tracking
  pendingTx?: string;
  isPending: boolean;
}

const ETHWalletContext = createContext<ETHWalletContextType>({
  loading: true,
  connected: false,
  open: () => {},
  disconnect: () => {},
  availableConnectors: [],
  address: "",
  publicKeyHex: "",
  balance: 0,
  formattedBalance: "0 ETH",
  chainId: undefined,
  networkName: undefined,
  getAddress: async () => "",
  getPublicKeyHex: async () => "",
  signMessage: async () => "",
  signTypedData: async () => "",
  sendTransaction: async () => "",
  getBalance: async () => 0n,
  getNonce: async () => 0,
  switchChain: async () => {},
  pendingTx: undefined,
  isPending: false,
});

export const useETHWallet = () => useContext(ETHWalletContext);

export const ETHWalletProvider = ({ children }: PropsWithChildren) => {
  // Local state
  const [loading] = useState(false);
  const [publicKeyHex] = useState(""); // ETH doesn't expose public key directly
  const [pendingTx, setPendingTx] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [networkName, setNetworkName] = useState<string>();

  // Use wagmi hooks directly
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect } = useConnect();
  const connectors = useConnectors();

  const { data: balance } = useBalance({
    address: address as `0x${string}` | undefined,
  });
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();

  // Connection state
  const connected = isConnected && !!address;

  // Available connectors mapped to simple format
  const availableConnectors = useMemo(
    () =>
      connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
      })),
    [connectors]
  );

  // Open wallet connection with specific connector or default to first available
  const open = useCallback(
    (connectorId?: string) => {
      const connector = connectorId
        ? connectors.find((c) => c.id === connectorId)
        : connectors[0];

      if (connector) {
        connect({ connector });
      } else {
        console.error("No connector found");
      }
    },
    [connect, connectors]
  );

  // Update network name based on chain ID
  useEffect(() => {
    if (chainId) {
      switch (chainId) {
        case 1:
          setNetworkName("Ethereum Mainnet");
          break;
        case 11155111:
          setNetworkName("Sepolia Testnet");
          break;
        case 31337:
          setNetworkName("Localhost");
          break;
        default:
          setNetworkName(`Chain ID ${chainId}`);
      }
    } else {
      setNetworkName(undefined);
    }
  }, [chainId]);

  const ethDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setPendingTx(undefined);
    } catch (err) {
      console.error("Failed to disconnect ETH wallet:", err);
      alert(`Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [disconnect]);

  const ethWalletMethods = useMemo(
    () => ({
      getAddress: async () => address ?? "",
      getPublicKeyHex: async () => publicKeyHex,
      signMessage: async (message: string) => {
        try {
          setIsPending(true);
          const signature = await signMessageAsync({ message });
          return signature;
        } catch (err) {
          console.error("Failed to sign message:", err);
          alert(`Failed to sign message: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          setIsPending(false);
        }
      },
      signTypedData: async (typedData: ETHTypedData) => {
        try {
          setIsPending(true);
          const signature = await signTypedDataAsync({
            domain: {
              ...typedData.domain,
              chainId: typedData.domain.chainId
                ? BigInt(typedData.domain.chainId)
                : undefined,
              verifyingContract: typedData.domain.verifyingContract as
                | `0x${string}`
                | undefined,
              salt: typedData.domain.salt as `0x${string}` | undefined,
            },
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          return signature;
        } catch (err) {
          console.error("Failed to sign typed data:", err);
          alert(`Failed to sign typed data: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          setIsPending(false);
        }
      },
      sendTransaction: async (to: string, value: string) => {
        try {
          setIsPending(true);
          const hash = await sendTransactionAsync({
            to: to as `0x${string}`,
            value: BigInt(value),
          });
          if (hash) setPendingTx(hash);
          return hash;
        } catch (err) {
          console.error("Failed to send transaction:", err);
          alert(`Failed to send transaction: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          setIsPending(false);
        }
      },
      getBalance: async () => balance?.value ?? 0n,
      getNonce: async () => 0, // Would need additional hook for nonce
      switchChain: async () => {
        // AppKit handles chain switching through the modal
        console.log("Chain switching handled by AppKit modal");
      },
    }),
    [
      address,
      publicKeyHex,
      signMessageAsync,
      signTypedDataAsync,
      sendTransactionAsync,
      balance?.value,
    ],
  );

  const ethContextValue = useMemo(
    () => ({
      loading,
      connected,
      open,
      disconnect: ethDisconnect,
      availableConnectors,
      address: address ?? "",
      publicKeyHex,
      balance: balance
        ? parseFloat(formatUnits(balance.value, balance.decimals))
        : 0,
      formattedBalance: balance
        ? `${formatUnits(balance.value, balance.decimals)} ETH`
        : "0 ETH",
      chainId,
      networkName,
      pendingTx,
      isPending,
      ...ethWalletMethods,
    }),
    [
      loading,
      connected,
      open,
      ethDisconnect,
      availableConnectors,
      address,
      publicKeyHex,
      balance,
      chainId,
      networkName,
      pendingTx,
      isPending,
      ethWalletMethods,
    ],
  );

  return (
    <ETHWalletContext.Provider value={ethContextValue}>
      {children}
    </ETHWalletContext.Provider>
  );
};
