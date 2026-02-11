/**
 * Vault Allocation Debugger (POC Component)
 *
 * Visual debugger showing:
 * - Available UTXOs
 * - Vault allocation strategy
 * - UTXO → Vault mapping
 *
 * This is a POC component with debug information.
 * Should be easily removable for production.
 */

import { Card, SubSection, Text } from "@babylonlabs-io/core-ui";
import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useState } from "react";

import { depositService } from "@/services/deposit";
import type { AllocationPlan, VaultConfig } from "@/types/multiVault";

interface VaultAllocationDebuggerProps {
  /** Available UTXOs from wallet */
  availableUtxos: UTXO[];
  /** Vault configurations */
  vaultConfigs: VaultConfig[];
  /** Allocation plan (if calculated) */
  allocationPlan: AllocationPlan | null;
  /** Whether debugger is collapsed */
  defaultCollapsed?: boolean;
}

export function VaultAllocationDebugger({
  availableUtxos,
  vaultConfigs,
  allocationPlan,
  defaultCollapsed = false,
}: VaultAllocationDebuggerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (collapsed) {
    return (
      <Card className="border-2 border-dashed border-warning-main bg-warning-light/10">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full text-left"
          type="button"
        >
          <Text variant="body2" className="font-mono text-warning-main">
            🔍 [DEBUG] Show UTXO Allocation Details
          </Text>
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-dashed border-warning-main bg-warning-light/10">
      <div className="mb-4 flex items-center justify-between">
        <Text
          variant="subtitle1"
          className="font-mono font-bold text-warning-main"
        >
          🔍 [DEBUG] UTXO Allocation Debugger
        </Text>
        <button
          onClick={() => setCollapsed(true)}
          className="text-warning-main hover:text-warning-dark"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Available UTXOs Section */}
        <SubSection>
          <Text
            variant="subtitle2"
            className="mb-2 font-mono text-accent-primary"
          >
            Available UTXOs ({availableUtxos.length})
          </Text>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {availableUtxos.length === 0 ? (
              <Text variant="body2" className="font-mono text-accent-secondary">
                No UTXOs available
              </Text>
            ) : (
              availableUtxos.map((utxo, idx) => (
                <div
                  key={`${utxo.txid}-${utxo.vout}`}
                  className="rounded bg-secondary-contrast/5 p-2 font-mono text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-primary-main">UTXO #{idx + 1}</span>
                    <span className="font-bold text-accent-primary">
                      {depositService.formatSatoshisToBtc(BigInt(utxo.value))}{" "}
                      BTC
                    </span>
                  </div>
                  <div className="truncate text-accent-secondary">
                    txid: {utxo.txid}:{utxo.vout}
                  </div>
                </div>
              ))
            )}
          </div>
        </SubSection>

        {/* Vault Configuration Section */}
        <SubSection>
          <Text
            variant="subtitle2"
            className="mb-2 font-mono text-accent-primary"
          >
            Vault Configuration ({vaultConfigs.length} vaults)
          </Text>
          <div className="space-y-1">
            {vaultConfigs.map((config) => (
              <div
                key={config.index}
                className="flex items-center justify-between rounded bg-secondary-contrast/5 p-2 font-mono text-xs"
              >
                <span className="text-accent-primary">
                  Vault #{config.index + 1}
                </span>
                <span className="font-bold text-primary-main">
                  {config.amountBtc} BTC
                </span>
              </div>
            ))}
          </div>
        </SubSection>

        {/* Allocation Strategy Section */}
        {allocationPlan && (
          <SubSection>
            <Text
              variant="subtitle2"
              className="mb-2 font-mono text-accent-primary"
            >
              Allocation Strategy
            </Text>

            {/* Strategy Type */}
            <div className="mb-3">
              {allocationPlan.needsSplit ? (
                <div className="rounded border border-warning-main bg-warning-light/20 p-3">
                  <Text
                    variant="body2"
                    className="font-mono font-bold text-warning-main"
                  >
                    ⚠️ UTXO SPLIT REQUIRED
                  </Text>
                  <Text
                    variant="caption"
                    className="mt-1 font-mono text-accent-secondary"
                  >
                    Will create a split transaction to generate{" "}
                    {vaultConfigs.length} UTXOs
                  </Text>
                  {allocationPlan.splitTransaction && (
                    <div className="mt-2 font-mono text-xs text-accent-secondary">
                      <div>
                        Split TxID:{" "}
                        {allocationPlan.splitTransaction.txid.slice(0, 16)}...
                      </div>
                      <div>
                        Inputs: {allocationPlan.splitTransaction.inputs.length}
                      </div>
                      <div>
                        Outputs:{" "}
                        {allocationPlan.splitTransaction.outputs.length}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded border border-success-main bg-success-light/20 p-3">
                  <Text
                    variant="body2"
                    className="font-mono font-bold text-success-main"
                  >
                    ✓ USING EXISTING UTXOs
                  </Text>
                  <Text
                    variant="caption"
                    className="mt-1 font-mono text-accent-secondary"
                  >
                    Sufficient UTXOs available, no split needed
                  </Text>
                </div>
              )}
            </div>

            {/* Vault → UTXO Mapping */}
            <div className="space-y-2">
              <Text
                variant="caption"
                className="font-mono text-accent-secondary"
              >
                Vault → UTXO Mapping:
              </Text>
              {allocationPlan.vaultAllocations.map((allocation) => (
                <div
                  key={allocation.vaultIndex}
                  className="rounded bg-secondary-contrast/5 p-2 font-mono text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-primary-main">
                      Vault #{allocation.vaultIndex + 1}
                    </span>
                    <span className="font-bold text-accent-primary">
                      {depositService.formatSatoshisToBtc(allocation.amount)}{" "}
                      BTC
                    </span>
                  </div>
                  {allocation.fromSplit ? (
                    <div className="text-warning-main">
                      ← Split TX output #{allocation.splitTxOutputIndex}
                    </div>
                  ) : allocation.utxo ? (
                    <div className="text-success-main">
                      ← Existing UTXO: {allocation.utxo.txid.slice(0, 16)}...:
                      {allocation.utxo.vout}
                    </div>
                  ) : (
                    <div className="text-error-main">
                      ← ERROR: No UTXO assigned
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
