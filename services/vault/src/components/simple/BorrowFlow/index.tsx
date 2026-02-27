import { FullScreenDialog, Tabs } from "@babylonlabs-io/core-ui";
import { IoChevronBack } from "react-icons/io5";
import { useAccount } from "wagmi";

import { LoanProvider } from "@/applications/aave/components/context/LoanContext";
import { useAaveReserveDetail } from "@/applications/aave/components/Detail/hooks/useAaveReserveDetail";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import type { Asset } from "@/applications/aave/types";
import { FadeTransition } from "@/components/simple/FadeTransition";
import { useDialogStep } from "@/hooks/deposit/useDialogStep";

import { BorrowAssetSelection } from "./BorrowAssetSelection";
import { BorrowForm } from "./BorrowForm";
import { FlowSuccess } from "./FlowSuccess";
import { RepayForm } from "./RepayForm";
import { BorrowFlowStep, useBorrowFlow } from "./useBorrowFlow";

interface BorrowFlowProps {
  open: boolean;
  onClose: () => void;
  initialTab?: LoanTab;
  /** When provided, skips asset selection and goes straight to the form */
  initialAsset?: string;
}

export function BorrowFlow({
  open,
  onClose,
  initialTab,
  initialAsset,
}: BorrowFlowProps) {
  const { address } = useAccount();

  const {
    step,
    activeTab,
    setActiveTab,
    selectedAssetSymbol,
    successData,
    selectAsset,
    goBack,
    completeBorrow,
    completeRepay,
    reset,
  } = useBorrowFlow({ initialTab, initialAsset });

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

  const showBackButton = renderedStep === BorrowFlowStep.FORM;
  const showCloseButton = !showBackButton;

  return (
    <FullScreenDialog
      open={open}
      onClose={showCloseButton ? onClose : undefined}
      className="items-center justify-center p-6"
    >
      {/* Back button for form step (replaces X close) */}
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

        {renderedStep === BorrowFlowStep.FORM && (
          <FormStep
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
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onChangeAsset={goBack}
            onBorrowSuccess={completeBorrow}
            onRepaySuccess={completeRepay}
          />
        )}

        {renderedStep === BorrowFlowStep.SUCCESS && successData && (
          <FlowSuccess data={successData} onClose={onClose} />
        )}
      </FadeTransition>
    </FullScreenDialog>
  );
}

interface FormStepProps {
  isLoading: boolean;
  selectedReserve: AaveReserveConfig | null;
  assetConfig: Asset | null;
  liquidationThresholdBps: number;
  positionId: string | undefined;
  proxyContract: string | undefined;
  collateralValueUsd: number;
  currentDebtAmount: number;
  totalDebtValueUsd: number;
  healthFactor: number | null;
  activeTab: LoanTab;
  onTabChange: (tab: LoanTab) => void;
  onChangeAsset: () => void;
  onBorrowSuccess: (amount: number, symbol: string, icon: string) => void;
  onRepaySuccess: (amount: number, symbol: string, icon: string) => void;
}

/**
 * Wrapper that provides LoanContext and renders Borrow/Repay tabs
 */
function FormStep({
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
  activeTab,
  onTabChange,
  onChangeAsset,
  onBorrowSuccess,
  onRepaySuccess,
}: FormStepProps) {
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
        onBorrowSuccess: () => {},
        onRepaySuccess: () => {},
      }}
    >
      <div className="mx-auto w-full max-w-[520px]">
        <Tabs
          items={[
            {
              id: LOAN_TAB.BORROW,
              label: "Borrow",
              content: (
                <BorrowForm
                  onChangeAsset={onChangeAsset}
                  onBorrowSuccess={onBorrowSuccess}
                />
              ),
            },
            {
              id: LOAN_TAB.REPAY,
              label: "Repay",
              content: (
                <RepayForm
                  onChangeAsset={onChangeAsset}
                  onRepaySuccess={onRepaySuccess}
                />
              ),
            },
          ]}
          activeTab={activeTab}
          onTabChange={(tabId) => onTabChange(tabId as LoanTab)}
        />
      </div>
    </LoanProvider>
  );
}
