/**
 * Progress indicator for multi-vault deposit flow
 */

import { Text } from "@babylonlabs-io/core-ui";

import { DepositStep } from "@/hooks/deposit/depositFlowSteps";

interface MultiVaultProgressProps {
  currentStep: DepositStep;
  currentVaultIndex: number | null;
  totalVaults: number;
  isWaiting: boolean;
}

export function MultiVaultProgress({
  currentStep,
  currentVaultIndex,
  totalVaults,
  isWaiting,
}: MultiVaultProgressProps) {
  // Determine which vaults have been processed
  const getVaultStatus = (vaultIndex: number) => {
    if (currentVaultIndex === null) {
      return "pending";
    }

    if (vaultIndex < currentVaultIndex) {
      return "completed";
    }

    if (vaultIndex === currentVaultIndex) {
      if (currentStep === DepositStep.SIGN_POP) {
        return "signing-pop";
      }
      if (currentStep === DepositStep.SUBMIT_PEGIN) {
        return isWaiting ? "waiting-eth" : "signing-eth";
      }
      return "processing";
    }

    return "pending";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "signing-pop":
      case "signing-eth":
      case "processing":
        return "⋯";
      case "waiting-eth":
        return "⏳";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-success-main";
      case "signing-pop":
      case "signing-eth":
      case "processing":
        return "text-primary-main";
      case "waiting-eth":
        return "text-warning-main";
      default:
        return "text-accent-secondary";
    }
  };

  return (
    <div className="space-y-3">
      {/* Overall progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-accent-secondary">
          <span>Vault Creation Progress</span>
          <span>
            {currentVaultIndex === null
              ? "0"
              : Math.min(currentVaultIndex + 1, totalVaults)}
            /{totalVaults}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-secondary-contrast/20">
          <div
            className="h-full rounded-full bg-primary-main transition-all duration-300"
            style={{
              width: `${currentVaultIndex === null ? 0 : ((currentVaultIndex + 1) / totalVaults) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Per-vault status */}
      {totalVaults <= 5 && (
        <div className="space-y-2">
          {Array.from({ length: totalVaults }, (_, i) => {
            const status = getVaultStatus(i);
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`text-lg ${getStatusColor(status)}`}>
                  {getStatusIcon(status)}
                </span>
                <Text variant="body2" className="text-accent-primary">
                  Vault {i + 1}
                </Text>
                {status === "signing-pop" && (
                  <Text variant="caption" className="text-primary-main">
                    Signing PoP...
                  </Text>
                )}
                {status === "signing-eth" && (
                  <Text variant="caption" className="text-primary-main">
                    Signing ETH tx...
                  </Text>
                )}
                {status === "waiting-eth" && (
                  <Text variant="caption" className="text-warning-main">
                    Waiting for confirmation...
                  </Text>
                )}
                {status === "completed" && (
                  <Text variant="caption" className="text-success-main">
                    Created
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payout signing step (applies to all vaults) */}
      {currentStep === DepositStep.SIGN_PAYOUTS && (
        <div className="rounded-lg bg-secondary-contrast/10 p-3">
          <Text variant="body2" className="text-accent-primary">
            {isWaiting
              ? "Waiting for payout transactions..."
              : `Signing payout transactions for ${totalVaults} vaults`}
          </Text>
        </div>
      )}

      {/* Broadcasting step */}
      {currentStep === DepositStep.BROADCAST_BTC && (
        <div className="rounded-lg bg-secondary-contrast/10 p-3">
          <Text variant="body2" className="text-accent-primary">
            Broadcasting {totalVaults} Bitcoin transactions...
          </Text>
        </div>
      )}
    </div>
  );
}
