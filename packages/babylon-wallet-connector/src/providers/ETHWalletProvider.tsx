import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useChainConnector } from "@/hooks/useChainConnector";
import { useWalletConnect } from "@/hooks/useWalletConnect";

export interface ETHWalletLifecycleCallbacks {
  onConnect?: (address: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (error: Error, context?: { address?: string }) => void;
}

interface ETHWalletContextType {
  loading: boolean;
  connected: boolean;
  address: string | undefined;
  disconnect: () => void;
  open: () => void;
}

const ETHWalletContext = createContext<ETHWalletContextType>({
  loading: true,
  connected: false,
  address: undefined,
  disconnect: () => {},
  open: () => {},
});

export interface ETHWalletProviderProps extends PropsWithChildren {
  callbacks?: ETHWalletLifecycleCallbacks;
}

export const ETHWalletProvider = ({ children, callbacks }: ETHWalletProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string>();
  
  const { open } = useWalletConnect();
  const ethConnector = useChainConnector("ETH");

  const disconnect = useCallback(async () => {
    setAddress(undefined);
    ethConnector?.disconnect();

    try {
      await callbacks?.onDisconnect?.();
    } catch (error) {
      console.error("Error in onDisconnect callback:", error);
    }
  }, [ethConnector, callbacks]);

  const connectETH = useCallback(
    async (walletAddress: string) => {
      try {
        setAddress(walletAddress);
        setLoading(false);

        await callbacks?.onConnect?.(walletAddress);
      } catch (error: any) {
        setLoading(false);
        callbacks?.onError?.(error, { address: walletAddress });
      }
    },
    [callbacks],
  );

  useEffect(() => {
    setLoading(false);
    if (!ethConnector) return;

    const unsubscribe = ethConnector.on("connect", async (wallet) => {
      if (wallet.provider) {
        try {
          const addr = await wallet.provider.getAddress();
          if (addr) {
            connectETH(addr);
          }
        } catch (error) {
          console.error("Error getting ETH address:", error);
        }
      }
    });

    return unsubscribe;
  }, [ethConnector, connectETH]);

  useEffect(() => {
    if (!ethConnector) return;

    const unsubscribe = ethConnector.on("disconnect", () => {
      disconnect();
    });

    return unsubscribe;
  }, [ethConnector, disconnect]);

  const connected = useMemo(
    () => Boolean(address),
    [address],
  );

  return (
    <ETHWalletContext.Provider
      value={{
        loading,
        connected,
        address,
        disconnect,
        open,
      }}
    >
      {children}
    </ETHWalletContext.Provider>
  );
};

export const useETHWallet = () => useContext(ETHWalletContext);

