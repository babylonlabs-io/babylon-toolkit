import { Card, Text } from "@babylonlabs-io/core-ui";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useETHWallet } from "@/ui/common/context/wallet/ETHWalletProvider";

/**
 * VaultDashboard - Displays connected wallet information
 *
 * Shows the status, addresses, and balances for both BTC and ETH wallets
 */
export const VaultDashboard = () => {
  const { address: btcAddress, connected: btcConnected } = useBTCWallet();

  const {
    address: ethAddress,
    isConnected: ethConnected,
    chainId,
    networkName,
  } = useETHWallet();

  // BTC balance fetching would need to be implemented separately
  // as it's not exposed in the current BTCWalletContextProps

  const formatAddress = (address?: string) => {
    if (!address) return "Not connected";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* BTC Wallet Card */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500">
            <span className="text-sm font-bold text-white">₿</span>
          </div>
          <div>
            <h3 className="text-xl font-bold">Bitcoin Wallet</h3>
            <p className="text-sm text-gray-600">BTC Network</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Text variant="body2" className="mb-1 text-gray-600">
              Status
            </Text>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  btcConnected ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <Text variant="body2">
                {btcConnected ? "Connected" : "Not connected"}
              </Text>
            </div>
          </div>

          <div>
            <Text variant="body2" className="mb-1 text-gray-600">
              Address
            </Text>
            <Text variant="body2" className="break-all font-mono text-sm">
              {formatAddress(btcAddress)}
            </Text>
          </div>
        </div>
      </Card>

      {/* ETH Wallet Card */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500">
            <span className="text-sm font-bold text-white">⧫</span>
          </div>
          <div>
            <h3 className="text-xl font-bold">Ethereum Wallet</h3>
            <p className="text-sm text-gray-600">
              {networkName || "ETH Network"}
              {chainId && ` (${chainId})`}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Text variant="body2" className="mb-1 text-gray-600">
              Status
            </Text>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  ethConnected ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <Text variant="body2">
                {ethConnected ? "Connected" : "Not connected"}
              </Text>
            </div>
          </div>

          <div>
            <Text variant="body2" className="mb-1 text-gray-600">
              Address
            </Text>
            <Text variant="body2" className="break-all font-mono text-sm">
              {formatAddress(ethAddress)}
            </Text>
          </div>
        </div>
      </Card>
    </div>
  );
};
