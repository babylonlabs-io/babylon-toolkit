import {
  createContext,
  useContext,
  useState,
  PropsWithChildren,
  useCallback,
  useMemo,
} from "react";

import { useError } from "@/ui/common/context/Error/ErrorProvider";

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
  balance: number;
  formattedBalance: string;

  // Network info
  chainId?: number;
  networkName?: string;

  // Operations
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
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
  open: () => {},
  disconnect: () => {},
  address: "",
  publicKeyHex: "",
  balance: 0,
  formattedBalance: "0 ETH",
  chainId: undefined,
  networkName: undefined,
  getAddress: async () => "",
  getPublicKeyHex: async () => "",
  signMessage: async () => "",
  sendTransaction: async () => "",
  getBalance: async () => 0n,
  getNonce: async () => 0,
  switchChain: async () => {},
  pendingTx: undefined,
  isPending: false,
  clearError: () => {},
});

export const useETHWallet = () => useContext(ETHWalletContext);

export const ETHWalletProvider = ({ children }: PropsWithChildren) => {
  const { handleError } = useError();
  const [publicKeyHex] = useState("");
  const [pendingTx, setPendingTx] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [networkName] = useState<string>();
  const [address, setAddress] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading] = useState(false);

  const open = useCallback(() => {
    // Placeholder for wallet connection
    console.log("ETH wallet connection not implemented yet");
  }, []);

  const disconnect = useCallback(async () => {
    setAddress("");
    setConnected(false);
    setPendingTx(undefined);
  }, []);

  const ethWalletMethods = useMemo(
    () => ({
      getAddress: async () => address,
      getPublicKeyHex: async () => publicKeyHex,
      signMessage: async () => {
        try {
          setIsPending(true);
          // Placeholder implementation
          throw new Error("ETH wallet not implemented yet");
        } catch (err) {
          handleError({ error: err as Error });
          throw err;
        } finally {
          setIsPending(false);
        }
      },
      sendTransaction: async () => {
        try {
          setIsPending(true);
          // Placeholder implementation
          throw new Error("ETH wallet not implemented yet");
        } catch (err) {
          handleError({ error: err as Error });
          throw err;
        } finally {
          setIsPending(false);
        }
      },
      getBalance: async () => 0n,
      getNonce: async () => 0,
      switchChain: async () => {
        // Placeholder implementation
      },
    }),
    [address, publicKeyHex, handleError],
  );

  const ethContextValue = useMemo(
    () => ({
      loading,
      connected,
      open,
      disconnect,
      address,
      publicKeyHex,
      balance: 0,
      formattedBalance: "0 ETH",
      chainId: undefined,
      networkName,
      pendingTx,
      isPending,
      clearError: () => {},
      ...ethWalletMethods,
    }),
    [
      loading,
      connected,
      open,
      disconnect,
      address,
      publicKeyHex,
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

// Safe wrapper for ETHWalletProvider
export const SafeETHWalletProvider = ({ children }: PropsWithChildren) => {
  return <ETHWalletProvider>{children}</ETHWalletProvider>;
};
