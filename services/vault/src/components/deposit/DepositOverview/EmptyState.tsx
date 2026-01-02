/**
 * EmptyState Component
 *
 * Shown when user has no deposits or is not connected.
 */

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface EmptyStateProps {
  isConnected: boolean;
}

export function EmptyState({ isConnected }: EmptyStateProps) {
  return (
    <div className="max-h-[500px] overflow-x-auto overflow-y-auto rounded-2xl bg-[#F9F9F9] dark:bg-primary-main">
      <div className="flex min-h-[200px] items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <img
            src={btcConfig.icon}
            alt={btcConfig.name}
            className="mb-4"
            style={{ height: 100, width: 100, marginTop: 24 }}
          />
          <div className="flex flex-col gap-2 text-center">
            <h4
              className="text-lg text-accent-primary"
              style={{ letterSpacing: "0.15px" }}
            >
              Deposit {btcConfig.coinSymbol} Trustlessly
            </h4>
            <p className="text-sm text-accent-secondary">
              {isConnected
                ? "Your deposit will appear here once confirmed."
                : `Connect your wallet to start depositing ${btcConfig.coinSymbol}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
