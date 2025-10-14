import {
  createContext,
  useContext,
  useState,
  PropsWithChildren,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  type ETHTypedData,
  useAppKitBridge,
  useAppKitOpenListener,
  openAppKitModal,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { formatUnits } from "viem";
import {
  useBalance,
  useSignMessage,
  useSignTypedData,
  useSendTransaction,
  useAccount,
} from "wagmi";

import { useError } from "@/ui/common/context/Error/ErrorProvider";
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
  const [publicKeyHex] = useState(""); // ETH doesn't expose public key directly
  const [pendingTx, setPendingTx] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [networkName, setNetworkName] = useState<string>();

  // Get ETH connector from wallet-connector
  const ethConnector = useChainConnector("ETH");

  // Track connection state from ethConnector
  const [ethAddress, setEthAddress] = useState<string>("");
  const [ethConnected, setEthConnected] = useState(false);

  useEffect(() => {
    const updateEthState = async () => {
      if (ethConnector?.connectedWallet?.provider) {
        const provider = ethConnector.connectedWallet.provider as any;
        if (provider.getAddress) {
          try {
            const addr = await provider.getAddress();
            setEthAddress(addr);
            setEthConnected(true);
          } catch {
            setEthAddress("");
            setEthConnected(false);
          }
        }
      } else {
        setEthAddress("");
        setEthConnected(false);
      }
    };

    updateEthState();

    // Listen for connection events from ETH connector
    if (ethConnector) {
      const unsubConnect = ethConnector.on("connect", () => {
        updateEthState();
      });

      const unsubDisconnect = ethConnector.on("disconnect", () => {
        setEthAddress("");
        setEthConnected(false);
      });

      return () => {
        unsubConnect();
        unsubDisconnect();
      };
    }
  }, [ethConnector, ethConnector?.connectedWallet]);

  // For AppKit operations, still use these but don't rely on them for connection state
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  useAppKitBridge();
  useAppKitOpenListener();

  const open = useCallback(() => {
    openAppKitModal();
  }, []);
  useEthConnectorBridge();

  const { chainId, status } = useAccount();

  // Track if wagmi is still loading/reconnecting
  // We consider it loading if:
  // 1. Status is 'connecting' or 'reconnecting' 
  // 2. Status is 'connected' but we don't have an address yet (still loading from AppKit)
  const isStillLoadingAddress = status === 'connected' && !appKitAddress && !ethAddress;
  const isWagmiLoading = status === 'reconnecting' || status === 'connecting' || isStillLoadingAddress;
  const isInitialized = !isWagmiLoading;

  // Use AppKit's persistent connection state as primary source
  // AppKit/wagmi handles its own persistence through cookies/localStorage
  const address = isInitialized ? (appKitAddress || ethAddress || "") : "";
  const connected = isInitialized ? ((appKitConnected && !!appKitAddress) || ethConnected) : false;

  const { data: balance } = useBalance({
    address: address as `0x${string}` | undefined,
  });
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();

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
      // Disconnect from ETH connector
      if (ethConnector) {
        await ethConnector.disconnect();
      }
      // Also disconnect from AppKit if connected
      if (appKitConnected) {
        await disconnect();
      }
      setPendingTx(undefined);
      setEthAddress("");
      setEthConnected(false);
    } catch (err) {
      console.error("Failed to disconnect ETH wallet:", err);
      handleError({
        error: err as Error,
        displayOptions: {
          retryAction: () => ethDisconnect(),
        },
      });
    }
  }, [disconnect, ethConnector, appKitConnected, handleError]);


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
      loading: isWagmiLoading,
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
    }
    ),
    [
      isWagmiLoading,
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
