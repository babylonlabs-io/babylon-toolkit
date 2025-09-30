import { Text } from "@babylonlabs-io/core-ui";
import { useAppKitAccount, AppKitButton } from "@reown/appkit/react";
import { useAppKitBridge } from "@babylonlabs-io/wallet-connector";

interface AppKitConnectButtonProps {
  onError?: (e: Error) => void;
}

export const AppKitConnectButton = ({ onError }: AppKitConnectButtonProps) => {
  const { isConnected, address } = useAppKitAccount();

  // Use the AppKit bridge hook to handle connection state synchronization and initialization
  useAppKitBridge({ onError });

  return (
    <div className="pt-10 text-accent-primary">
      <div className="rounded border border-secondary-strokeLight p-6">
        {!isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <AppKitButton
              balance="show"
              size="md"
              label="Connect Wallet"
              loadingLabel="Connecting..."
            />

            <Text className="max-w-md text-center text-sm text-gray-600">
              AppKit <code>headless</code> UI can go there
            </Text>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <AppKitButton
              balance="show"
              size="md"
            />

            <Text className="text-center font-mono text-sm text-gray-600">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};
