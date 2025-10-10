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
import {
  useAppKit,
  useAppKitAccount,
  useDisconnect,
} from "@reown/appkit/react";
import { useAppKitBridge } from "@babylonlabs-io/wallet-connector";
import { formatUnits } from "viem";
import {
  useBalance,
  useSignMessage,
  useSignTypedData,
  useSendTransaction,
  useAccount,
} from "wagmi";

import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useAppKitOpenListener } from "../../hooks/useAppKitOpenListener";
import { useEthConnectorBridge } from "../../hooks/useEthConnectorBridge";

interface ETHWalletContextType {
  // Connection state
  loading: boolean;
  connected: boolean;
  open: () => void;
  disconnect: () => void;

  // Account info
  address: string;
  publicKeyHex: string;

  // Balance
  balance: number; // Keep consistent with BTC (will store in ETH, not wei)
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
  clearError: () => void;
}

const ETHWalletContext = createContext<ETHWalletContextType>({
  loading: true,
  connected: false,
  open: () => { },
  disconnect: () => { },
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
  switchChain: async () => { },
  pendingTx: undefined,
  isPending: false,
  clearError: () => { },
});

export const useETHWallet = () => useContext(ETHWalletContext);

export const ETHWalletProvider = ({ children }: PropsWithChildren) => {
  // Debug build identifier to verify app build
  const { handleError } = useError();

  // Local state
  const [loading] = useState(false);
  const [publicKeyHex] = useState(""); // ETH doesn't expose public key directly
  const [pendingTx, setPendingTx] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [networkName, setNetworkName] = useState<string>();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  useAppKitBridge();
  useAppKitOpenListener();
  useEthConnectorBridge();

  const { chainId } = useAccount();
  const { data: balance } = useBalance({
    address: address as `0x${string}` | undefined,
  });
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();

  // Connection state
  const connected = isConnected && !!address;

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
      handleError({
        error: err as Error,
        displayOptions: {
          retryAction: () => ethDisconnect(),
        },
      });
    }
  }, [disconnect, handleError]);


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
          handleError({ error: err as Error });
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
          handleError({ error: err as Error });
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
          handleError({ error: err as Error });
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
      handleError,
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
      address: address ?? "",
      publicKeyHex,
      balance: balance
        ? parseFloat(formatUnits(balance.value, balance.decimals))
        : 0,
      formattedBalance: balance
        ? formatUnits(balance.value, balance.decimals)
        : "0",
      chainId,
      networkName,
      pendingTx,
      isPending,
      clearError: () => { },
      ...ethWalletMethods,
    }),
    [
      loading,
      connected,
      open,
      ethDisconnect,
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

// Safe wrapper for ETHWalletProvider that handles AppKit initialization errors
export const SafeETHWalletProvider = ({ children }: PropsWithChildren) => {
  const [hasError, setHasError] = useState(false);

  const fallbackContextValue = useMemo(
    () => ({
      loading: false,
      connected: false,
      open: () => console.warn("ETH wallet not available"),
      disconnect: () => Promise.resolve(),
      address: "",
      publicKeyHex: "",
      balance: 0,
      formattedBalance: "0",
      chainId: undefined,
      networkName: undefined,
      pendingTx: undefined,
      isPending: false,
      getAddress: async () => "",
      getPublicKeyHex: async () => "",
      signMessage: async () => {
        throw new Error("ETH wallet not available");
      },
      signTypedData: async () => {
        throw new Error("ETH wallet not available");
      },
      sendTransaction: async () => {
        throw new Error("ETH wallet not available");
      },
      getBalance: async () => 0n,
      getNonce: async () => 0,
      switchChain: async () => { },
      clearError: () => { },
    }),
    [],
  );

  if (hasError) {
    return (
      <ETHWalletContext.Provider value={fallbackContextValue}>
        {children}
      </ETHWalletContext.Provider>
    );
  }

  try {
    return <ETHWalletProvider>{children}</ETHWalletProvider>;
  } catch (error) {
    console.warn("ETH wallet provider failed to initialize:", error);
    setHasError(true);
    return (
      <ETHWalletContext.Provider value={fallbackContextValue}>
        {children}
      </ETHWalletContext.Provider>
    );
  }
};
