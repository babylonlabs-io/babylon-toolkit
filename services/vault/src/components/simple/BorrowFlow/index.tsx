import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { IoChevronBack } from "react-icons/io5";
import { useAccount } from "wagmi";

import { LoanProvider } from "@/applications/aave/components/context/LoanContext";
import { useAaveReserveDetail } from "@/applications/aave/hooks/useAaveReserveDetail";
import { FadeTransition } from "@/components/simple/FadeTransition";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";

import { BorrowAssetSelection } from "./BorrowAssetSelection";
import { BorrowForm } from "./BorrowForm";
import { BorrowSuccess } from "./BorrowSuccess";
import { BorrowFlowStep, useBorrowFlow } from "./useBorrowFlow";

interface BorrowFlowProps {
  open: boolean;
  onClose: () => void;
}

export function BorrowFlow({ open, onClose }: BorrowFlowProps) {
  const { address } = useAccount();

  const {
    step,
    selectedAssetSymbol,
    successData,
    selectAsset,
    goBack,
    completeBorrow,
    reset,
  } = useBorrowFlow();

  const renderedStep = useDialogStep(open, step, reset);

  const {
    isLoading,
    selectedReserve,
    assetConfig,
    liquidationThresholdBps,
    positionId,
    proxyContract,
    collateralValueUsd,
    currentDebtAmount,
    totalDebtValueUsd,
    healthFactor,
  } = useAaveReserveDetail({
    reserveId: selectedAssetSymbol ?? undefined,
    address,
  });

  const showBackButton = renderedStep === BorrowFlowStep.BORROW_FORM;
  // Only show X close on asset selection and success steps (not borrow form)
  const showCloseButton = !showBackButton;

  return (
    <FullScreenDialog
      open={open}
      onClose={showCloseButton ? onClose : undefined}
      className="items-center justify-center p-6"
    >
      {/* Back button for borrow form step (replaces X close) */}
      {showBackButton && (
        <button
          onClick={goBack}
          className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center text-accent-primary transition-colors hover:text-accent-secondary"
        >
          <IoChevronBack size={20} />
        </button>
      )}

      <FadeTransition stepKey={renderedStep}>
        {renderedStep === BorrowFlowStep.ASSET_SELECTION && (
          <BorrowAssetSelection onSelectAsset={selectAsset} />
        )}

        {renderedStep === BorrowFlowStep.BORROW_FORM && (
          <BorrowFormStep
            isLoading={isLoading}
            selectedReserve={selectedReserve}
            assetConfig={assetConfig}
            liquidationThresholdBps={liquidationThresholdBps}
            positionId={positionId}
            proxyContract={proxyContract}
            collateralValueUsd={collateralValueUsd}
            currentDebtAmount={currentDebtAmount}
            totalDebtValueUsd={totalDebtValueUsd}
            healthFactor={healthFactor}
            onChangeAsset={goBack}
            onBorrowSuccess={completeBorrow}
          />
        )}

        {renderedStep === BorrowFlowStep.SUCCESS && successData && (
          <BorrowSuccess data={successData} onClose={onClose} />
        )}
      </FadeTransition>
    </FullScreenDialog>
  );
}

/**
 * Wrapper that provides LoanContext when data is ready
 */
function BorrowFormStep({
  isLoading,
  selectedReserve,
  assetConfig,
  liquidationThresholdBps,
  positionId,
  proxyContract,
  collateralValueUsd,
  currentDebtAmount,
  totalDebtValueUsd,
  healthFactor,
  onChangeAsset,
  onBorrowSuccess,
}: {
  isLoading: boolean;
  selectedReserve: ReturnType<typeof useAaveReserveDetail>["selectedReserve"];
  assetConfig: ReturnType<typeof useAaveReserveDetail>["assetConfig"];
  liquidationThresholdBps: number;
  positionId: string | undefined;
  proxyContract: string | undefined;
  collateralValueUsd: number;
  currentDebtAmount: number;
  totalDebtValueUsd: number;
  healthFactor: number | null;
  onChangeAsset: () => void;
  onBorrowSuccess: (amount: number, symbol: string, icon: string) => void;
}) {
  if (isLoading || !selectedReserve || !assetConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-accent-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <LoanProvider
      value={{
        collateralValueUsd,
        currentDebtAmount,
        totalDebtValueUsd,
        healthFactor,
        liquidationThresholdBps,
        selectedReserve,
        assetConfig,
        positionId,
        proxyContract,
        // These callbacks are handled by the BorrowFlow orchestrator
        onBorrowSuccess: () => {},
        onRepaySuccess: () => {},
      }}
    >
      <BorrowForm
        onChangeAsset={onChangeAsset}
        onBorrowSuccess={onBorrowSuccess}
      />
    </LoanProvider>
  );
}
