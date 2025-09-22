import { Text } from "@babylonlabs-io/core-ui";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";
import { useEffect, useState } from "react";
import { twJoin } from "tailwind-merge";

interface AppKitConnectButtonProps {
  onError?: (e: Error) => void;
}

export const AppKitConnectButton = ({ onError }: AppKitConnectButtonProps) => {
  const { open } = useAppKit();
  const { isConnected, address } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const [isConnecting, setIsConnecting] = useState(false);

  // Handle wallet connection
  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      await open();
    } catch (error) {
      console.error("Failed to open AppKit modal:", error);
      onError?.(error as Error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle wallet disconnection
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      onError?.(error as Error);
    }
  };

  // Monitor connection state changes
  useEffect(() => {
    if (isConnected && address) {
      setIsConnecting(false);
    }
  }, [isConnected, address]);

  return (
    <div className="pt-10 text-accent-primary">
      <Text className="mb-4">Connect Ethereum Wallet</Text>

      <div className="rounded border border-secondary-strokeLight p-6">
        {!isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className={twJoin(
                "border-primary-strokeLight flex flex-col items-center gap-2.5 rounded-lg border p-4 transition-all hover:border-primary-main hover:bg-primary-light/10",
                isConnecting ? "cursor-not-allowed opacity-50" : "opacity-100",
              )}
              data-testid="appkit-connect-button"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary-main">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="24" height="24" rx="6" fill="white" />
                  <path
                    d="M6 12C6 8.686 8.686 6 12 6C15.314 6 18 8.686 18 12C18 15.314 15.314 18 12 18C8.686 18 6 15.314 6 12Z"
                    stroke="#3489FF"
                    strokeWidth="1.5"
                  />
                  <circle cx="12" cy="12" r="3" fill="#3489FF" />
                </svg>
              </div>

              <Text className="whitespace-nowrap leading-none" variant="body2">
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Text>
            </button>

            <Text className="max-w-md text-center text-sm text-gray-600">
              Access 600+ wallets including MetaMask, Rainbow, WalletConnect,
              Coinbase Wallet, and hardware wallets
            </Text>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-green-500">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13.5 4.5L6 12L2.5 8.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <Text className="whitespace-nowrap leading-none" variant="body2">
                Wallet Connected
              </Text>
            </div>

            <Text className="text-center font-mono text-sm text-gray-600">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </Text>

            <button
              onClick={handleDisconnect}
              className="text-sm text-red-600 underline hover:text-red-800"
              data-testid="appkit-disconnect-button"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
