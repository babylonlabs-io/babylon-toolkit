/**
 * Multi-Vault Debug Panel (POC Component)
 *
 * Shows real-time status of multi-vault deposit flow:
 * - Split transaction status
 * - Progress for each vault
 * - Current step and errors
 *
 * This is a POC component for debugging.
 */

import { Card, Loader, SubSection, Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import type {
  MultiVaultDepositResult,
  PeginCreationResult,
} from "@/types/multiVault";

import { DepositStep } from "../../hooks/deposit/depositFlowSteps";

interface MultiVaultDebugPanelProps {
  /** Current deposit step */
  currentStep: DepositStep;
  /** Current vault being processed */
  currentVaultIndex: number | null;
  /** Total number of vaults */
  totalVaults: number;
  /** Whether flow is processing */
  processing: boolean;
  /** Whether flow is waiting */
  isWaiting: boolean;
  /** Error message if any */
  error: string | null;
  /** Split transaction info */
  splitTransaction?: NonNullable<MultiVaultDepositResult["splitTransaction"]>;
  /** Vault creation results */
  vaultResults?: PeginCreationResult[];
  /** Whether panel is collapsed */
  defaultCollapsed?: boolean;
}

export function MultiVaultDebugPanel({
  currentStep,
  currentVaultIndex,
  totalVaults,
  processing,
  isWaiting,
  error,
  splitTransaction,
  vaultResults = [],
  defaultCollapsed = false,
}: MultiVaultDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (collapsed) {
    return (
      <Card className="border-2 border-dashed border-info-main bg-info-light/10">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full text-left"
          type="button"
        >
          <Text variant="body2" className="font-mono text-info-main">
            🔧 [DEBUG] Show Multi-Vault Progress
          </Text>
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-dashed border-info-main bg-info-light/10">
      <div className="mb-4 flex items-center justify-between">
        <Text
          variant="subtitle1"
          className="font-mono font-bold text-info-main"
        >
          🔧 [DEBUG] Multi-Vault Progress
        </Text>
        <button
          onClick={() => setCollapsed(true)}
          className="text-info-main hover:text-info-dark"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Overall Status */}
        <SubSection>
          <Text
            variant="subtitle2"
            className="mb-2 font-mono text-accent-primary"
          >
            Overall Status
          </Text>
          <div className="space-y-1 rounded bg-secondary-contrast/5 p-3 font-mono text-sm">
            <div className="flex items-center justify-between">
              <span className="text-accent-secondary">Processing:</span>
              <span className="text-accent-primary">
                {processing ? (
                  <span className="flex items-center gap-2">
                    <Loader size={16} />
                    <span>Yes</span>
                  </span>
                ) : (
                  "No"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-accent-secondary">Waiting:</span>
              <span className="text-accent-primary">
                {isWaiting ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-accent-secondary">Current Step:</span>
              <span className="font-bold text-primary-main">
                {getStepName(currentStep)}
              </span>
            </div>
            {currentVaultIndex !== null && (
              <div className="flex items-center justify-between">
                <span className="text-accent-secondary">Current Vault:</span>
                <span className="font-bold text-primary-main">
                  {currentVaultIndex + 1} / {totalVaults}
                </span>
              </div>
            )}
            {error && (
              <div className="mt-2 rounded border border-error-main bg-error-light/20 p-2">
                <Text variant="caption" className="font-mono text-error-main">
                  Error: {error}
                </Text>
              </div>
            )}
          </div>
        </SubSection>

        {/* Split Transaction */}
        {splitTransaction && (
          <SubSection>
            <Text
              variant="subtitle2"
              className="mb-2 font-mono text-accent-primary"
            >
              Split Transaction
            </Text>
            <div className="space-y-1 rounded bg-secondary-contrast/5 p-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-accent-secondary">Status:</span>
                <span
                  className={
                    splitTransaction.broadcasted
                      ? "text-success-main"
                      : "text-warning-main"
                  }
                >
                  {splitTransaction.broadcasted
                    ? "✓ Broadcasted"
                    : "⏳ Pending"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-accent-secondary">TxID:</span>
                <span className="break-all text-accent-primary">
                  {splitTransaction.txid}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-accent-secondary">Inputs:</span>
                <span className="text-accent-primary">
                  {splitTransaction.inputs.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-accent-secondary">Outputs:</span>
                <span className="text-accent-primary">
                  {splitTransaction.outputs.length}
                </span>
              </div>
            </div>
          </SubSection>
        )}

        {/* Vault Progress */}
        {vaultResults.length > 0 && (
          <SubSection>
            <Text
              variant="subtitle2"
              className="mb-2 font-mono text-accent-primary"
            >
              Vaults ({vaultResults.length})
            </Text>
            <div className="space-y-2">
              {vaultResults.map((result) => (
                <div
                  key={result.vaultIndex}
                  className={`rounded border p-3 font-mono text-xs ${
                    result.error
                      ? "border-error-main bg-error-light/10"
                      : "border-secondary-main/30 bg-secondary-contrast/5"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-primary-main">
                      Vault #{result.vaultIndex + 1}
                    </span>
                    {result.error ? (
                      <span className="text-error-main">✗ Failed</span>
                    ) : (
                      <span className="text-success-main">✓ Created</span>
                    )}
                  </div>

                  {result.error ? (
                    <div className="text-error-main">{result.error}</div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex flex-col gap-1">
                        <span className="text-accent-secondary">
                          BTC TxHash:
                        </span>
                        <span className="break-all text-accent-primary">
                          {result.btcTxHash}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-accent-secondary">
                          ETH TxHash:
                        </span>
                        <span className="break-all text-accent-primary">
                          {result.ethTxHash}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-accent-secondary">Fee:</span>
                        <span className="text-accent-primary">
                          {result.fee.toString()} sats
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SubSection>
        )}
      </div>
    </Card>
  );
}

/**
 * Get human-readable step name
 */
function getStepName(step: DepositStep): string {
  switch (step) {
    case DepositStep.SIGN_POP:
      return "Sign Proof of Possession";
    case DepositStep.SUBMIT_PEGIN:
      return "Submit Peg-in Request";
    case DepositStep.SIGN_PAYOUTS:
      return "Sign Payout Transactions";
    case DepositStep.BROADCAST_BTC:
      return "Broadcast BTC Transaction";
    case DepositStep.COMPLETED:
      return "Completed";
    default:
      return "Unknown";
  }
}
