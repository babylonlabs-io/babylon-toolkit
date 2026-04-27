import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import {
  computeProjectedHealthFactor,
  getEffectiveVaultSelection,
} from "@/applications/aave/utils";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import { logger } from "@/infrastructure";
import type { CollateralVaultEntry } from "@/types/collateral";
import { scriptPubKeyHexToBtcAddress } from "@/utils/btc";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
import { WithdrawProgressView } from "./WithdrawProgressView";
import { WithdrawReviewContent } from "./WithdrawReviewContent";

/**
 * Decode each vault's registered payout scriptPubKey to a BTC address and
 * dedupe. A vault that can't be decoded is logged and skipped — the on-chain
 * transaction is unaffected, but the user will see fewer addresses than vaults.
 */
function getUniquePayoutAddresses(vaults: CollateralVaultEntry[]): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const vault of vaults) {
    if (!vault.depositorPayoutBtcAddress) continue;
    try {
      const address = scriptPubKeyHexToBtcAddress(
        vault.depositorPayoutBtcAddress,
      );
      if (!seen.has(address)) {
        seen.add(address);
        addresses.push(address);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        data: {
          context: "Decode payout scriptPubKey for withdraw display",
          vaultId: vault.vaultId,
        },
      });
    }
  }
  return addresses;
}

export interface WithdrawFlowProps {
  open: boolean;
  onClose: () => void;
  collateralVaults: CollateralVaultEntry[];
  collateralBtc: number;
  /** Total collateral USD for display-only rendering of the selected amount. */
  collateralValueUsd: number;
  /** User's current on-chain health factor (null when no debt). */
  currentHealthFactor: number | null;
  /** Vault IDs selected inline on the collateral list before opening the dialog. */
  preSelectedVaultIds: string[];
}

function WithdrawFlowContent({
  open,
  onClose,
  collateralVaults,
  collateralBtc,
  collateralValueUsd,
  currentHealthFactor,
  preSelectedVaultIds,
}: WithdrawFlowProps) {
  const { step, goToProgress, reset } = useWithdrawFlow();
  const { executeWithdraw, isProcessing } = useWithdrawCollateralTransaction();

  const renderedStep = useDialogStep(open, step, reset);

  // Snapshot of payout addresses captured at confirm time. Needed by the
  // Progress view because the underlying vaults are removed from the user's
  // collateral list after withdraw — without snapshotting, the addresses
  // would disappear by the time we navigate to PROGRESS.
  const [submittedPayoutAddresses, setSubmittedPayoutAddresses] = useState<
    string[]
  >([]);

  const {
    selectedVaultIds: effectiveSelectedVaultIds,
    selectedVaults: effectiveSelectedVaults,
  } = useMemo(
    () => getEffectiveVaultSelection(collateralVaults, preSelectedVaultIds),
    [collateralVaults, preSelectedVaultIds],
  );

  const selectedPayoutAddresses = useMemo(
    () => getUniquePayoutAddresses(effectiveSelectedVaults),
    [effectiveSelectedVaults],
  );

  // Aggregate amounts and projected HF for the current selection.
  const { selectedBtc, selectedUsd, projectedHealthFactor } = useMemo(() => {
    const btc = effectiveSelectedVaults.reduce(
      (sum, v) => sum + v.amountBtc,
      0,
    );
    const usd =
      collateralBtc > 0 ? collateralValueUsd * (btc / collateralBtc) : 0;
    const projectedHF = computeProjectedHealthFactor(
      currentHealthFactor,
      collateralBtc,
      btc,
    );
    return {
      selectedBtc: btc,
      selectedUsd: usd,
      projectedHealthFactor: projectedHF,
    };
  }, [
    effectiveSelectedVaults,
    collateralBtc,
    collateralValueUsd,
    currentHealthFactor,
  ]);

  const handleConfirm = useCallback(async () => {
    const success = await executeWithdraw(effectiveSelectedVaultIds);
    if (success) {
      setSubmittedPayoutAddresses(selectedPayoutAddresses);
      goToProgress();
    }
  }, [
    executeWithdraw,
    effectiveSelectedVaultIds,
    selectedPayoutAddresses,
    goToProgress,
  ]);

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <FadeTransition stepKey={renderedStep}>
        {renderedStep === WithdrawStep.REVIEW && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
              currentHealthFactor={currentHealthFactor}
              projectedHealthFactor={projectedHealthFactor}
              payoutAddresses={selectedPayoutAddresses}
              isProcessing={isProcessing}
              onConfirm={handleConfirm}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.PROGRESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawProgressView
              payoutAddresses={submittedPayoutAddresses}
              onClose={onClose}
            />
          </div>
        )}
      </FadeTransition>
    </FullScreenDialog>
  );
}

export default function WithdrawFlow(props: WithdrawFlowProps) {
  if (!props.open) return null;

  return (
    <ProtocolParamsProvider>
      <WithdrawFlowContent {...props} />
    </ProtocolParamsProvider>
  );
}
