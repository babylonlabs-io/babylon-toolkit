/**
 * WithdrawVaultsModal Component
 * Collateral-selection step of the withdrawal flow. Opened from the Collateral
 * "⋯" menu as a full-screen modal; on confirm it hands the selection off to the
 * withdrawal flow.
 */

import { Button, FullScreenDialog, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { formatBtcAmount } from "@/utils/formatting";

import { WithdrawVaultItem } from "./WithdrawVaultItem";

interface WithdrawVaultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaults: CollateralVaultEntry[];
  /** Per-vault eligibility: can this vault be withdrawn without breaching HF. */
  vaultEligibility: Map<string, boolean>;
  selectedVaultIds: string[];
  selectedBtc: number;
  canWithdraw: boolean;
  onToggleVaultSelect: (vaultId: string) => void;
  /** Advances to the withdrawal flow with the current selection. */
  onConfirm: () => void;
  /** Rendered as an inline helper below the Withdraw button when disabled. */
  disabledReason?: string;
}

export function WithdrawVaultsModal({
  isOpen,
  onClose,
  vaults,
  vaultEligibility,
  selectedVaultIds,
  selectedBtc,
  canWithdraw,
  onToggleVaultSelect,
  onConfirm,
  disabledReason,
}: WithdrawVaultsModalProps) {
  const hasSelection = selectedVaultIds.length > 0;
  const withdrawLabel = hasSelection
    ? COPY.withdraw.modal.confirmButtonWithAmount(formatBtcAmount(selectedBtc))
    : COPY.withdraw.modal.confirmButton;

  return (
    <FullScreenDialog
      open={isOpen}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-secondary-strokeLight">
        <div className="border-b border-secondary-strokeLight p-6">
          <h3 className="text-2xl text-accent-primary">
            {COPY.withdraw.modal.title}
          </h3>
          <p className="mt-2 text-sm text-accent-secondary">
            {COPY.withdraw.modal.subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {vaults.map((vault) => (
              <WithdrawVaultItem
                key={vault.id}
                vaultId={vault.vaultId}
                amountBtc={vault.amountBtc}
                position={vault.liquidationIndex + 1}
                selected={selectedVaultIds.includes(vault.vaultId)}
                selectable={
                  vault.inUse && vaultEligibility.get(vault.vaultId) === true
                }
                onToggleSelect={onToggleVaultSelect}
              />
            ))}
          </div>

          <Button
            variant="contained"
            color="secondary"
            size="large"
            fluid
            onClick={onConfirm}
            disabled={!canWithdraw || !hasSelection}
          >
            {withdrawLabel}
          </Button>
          {!canWithdraw && disabledReason && (
            <Text
              variant="body2"
              className="text-center text-accent-secondary"
              data-testid="withdraw-disabled-reason"
            >
              {disabledReason}
            </Text>
          )}
        </div>
      </div>
    </FullScreenDialog>
  );
}
