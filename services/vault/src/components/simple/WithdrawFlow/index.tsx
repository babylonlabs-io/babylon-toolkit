import { useCallback, useMemo, useState } from "react";

import { useWithdrawCollateralTransaction } from "@/applications/aave/hooks/useWithdrawCollateralTransaction";
import {
  computeProjectedHealthFactor,
  getEffectiveVaultSelection,
  getUniquePayoutAddresses,
} from "@/applications/aave/utils";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import {
  ProtocolParamsProvider,
  useProtocolParamsContext,
} from "@/context/ProtocolParamsContext";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";
import type { CollateralVaultEntry } from "@/types/collateral";
import { maxAssertTimelockBlocks } from "@/utils/pegoutTiming";

import { FadeTransition } from "../FadeTransition";

import { useWithdrawFlow, WithdrawStep } from "./useWithdrawFlow";
import { WithdrawProgressView } from "./WithdrawProgressView";
import { WithdrawReviewContent } from "./WithdrawReviewContent";

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
  const { executeWithdraw, isProcessing, error } =
    useWithdrawCollateralTransaction();
  const { getOffchainParamsByVersion, config } = useProtocolParamsContext();

  const renderedStep = useDialogStep(open, step, reset);

  // Signing-surface guard: god-mode demo rows are display-only (`displayOnly`,
  // fake vaultId) and must never be selectable for a real withdraw, even if a
  // caller mistakenly passes the demo-merged list. Mirrors CollateralSection's
  // actionableVaults filter. Always a no-op in production (the flag is never
  // set there). Only `active` vaults back the position.
  const withdrawableVaults = useMemo(
    () =>
      collateralVaults.filter(
        (v) => !v.displayOnly && v.lifecycle === "active",
      ),
    [collateralVaults],
  );

  const {
    selectedVaultIds: effectiveSelectedVaultIds,
    selectedVaults: liveSelectedVaults,
  } = useMemo(
    () => getEffectiveVaultSelection(withdrawableVaults, preSelectedVaultIds),
    [withdrawableVaults, preSelectedVaultIds],
  );

  // The withdraw marks its vaults pending AND awaits a position refetch before
  // `goToProgress()` runs, so both the selection and the position props move
  // while Review is still on screen. Pin every Review input at confirm time —
  // otherwise the amounts flash to zero under the spinner, the projected health
  // factor is computed against an already-reduced position (a false blocking
  // warning), and the Progress view loses its payout addresses. A failed submit
  // releases the pin and Review tracks the live values again.
  const [confirmed, setConfirmed] = useState<{
    vaults: CollateralVaultEntry[];
    collateralBtc: number;
    collateralValueUsd: number;
    currentHealthFactor: number | null;
  } | null>(null);
  const effectiveSelectedVaults = confirmed?.vaults ?? liveSelectedVaults;
  // Ternaries, not `??`: a pinned `currentHealthFactor` of null (no debt) must
  // not fall through to the live prop.
  const reviewCollateralBtc = confirmed
    ? confirmed.collateralBtc
    : collateralBtc;
  const reviewCollateralValueUsd = confirmed
    ? confirmed.collateralValueUsd
    : collateralValueUsd;
  const reviewCurrentHealthFactor = confirmed
    ? confirmed.currentHealthFactor
    : currentHealthFactor;

  const selectedPayoutAddresses = useMemo(
    () => getUniquePayoutAddresses(effectiveSelectedVaults),
    [effectiveSelectedVaults],
  );

  // Conservative payout ETA for the batch: the largest `timelockAssert` across
  // the selected vaults' offchain-params versions. Falls back to the latest
  // version's value when a vault's version can't be resolved.
  const selectedAssertTimelockBlocks = useMemo(
    () =>
      maxAssertTimelockBlocks(
        effectiveSelectedVaults.map((v) => v.offchainParamsVersion),
        (version) => getOffchainParamsByVersion(version)?.timelockAssert,
        Number(config.offchainParams.timelockAssert),
      ),
    [effectiveSelectedVaults, getOffchainParamsByVersion, config],
  );

  // Aggregate amounts and projected HF for the current selection.
  const { selectedBtc, selectedUsd, projectedHealthFactor } = useMemo(() => {
    const btc = effectiveSelectedVaults.reduce(
      (sum, v) => sum + v.amountBtc,
      0,
    );
    const usd =
      reviewCollateralBtc > 0
        ? reviewCollateralValueUsd * (btc / reviewCollateralBtc)
        : 0;
    const projectedHF = computeProjectedHealthFactor(
      reviewCurrentHealthFactor,
      reviewCollateralBtc,
      btc,
    );
    return {
      selectedBtc: btc,
      selectedUsd: usd,
      projectedHealthFactor: projectedHF,
    };
  }, [
    effectiveSelectedVaults,
    reviewCollateralBtc,
    reviewCollateralValueUsd,
    reviewCurrentHealthFactor,
  ]);

  const handleConfirm = useCallback(async () => {
    setConfirmed({
      vaults: liveSelectedVaults,
      collateralBtc,
      collateralValueUsd,
      currentHealthFactor,
    });
    const success = await executeWithdraw(effectiveSelectedVaultIds);
    if (!success) {
      setConfirmed(null);
      return;
    }
    goToProgress();
  }, [
    executeWithdraw,
    effectiveSelectedVaultIds,
    liveSelectedVaults,
    collateralBtc,
    collateralValueUsd,
    currentHealthFactor,
    goToProgress,
  ]);

  return (
    <V3ModalShell open={open} onClose={onClose}>
      <FadeTransition stepKey={renderedStep}>
        {renderedStep === WithdrawStep.REVIEW && (
          <div className="mx-auto w-full max-w-[612px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={selectedUsd}
              currentHealthFactor={reviewCurrentHealthFactor}
              projectedHealthFactor={projectedHealthFactor}
              payoutAddresses={selectedPayoutAddresses}
              assertTimelockBlocks={selectedAssertTimelockBlocks}
              isProcessing={isProcessing}
              error={error}
              onConfirm={handleConfirm}
            />
          </div>
        )}
        {renderedStep === WithdrawStep.PROGRESS && (
          <div className="mx-auto w-full max-w-[520px]">
            <WithdrawProgressView
              payoutAddresses={selectedPayoutAddresses}
              assertTimelockBlocks={selectedAssertTimelockBlocks}
              onClose={onClose}
            />
          </div>
        )}
      </FadeTransition>
    </V3ModalShell>
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
