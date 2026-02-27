import { useCallback, useEffect, useState } from "react";

import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";

export enum BorrowFlowStep {
  ASSET_SELECTION = "asset_selection",
  FORM = "form",
  SUCCESS = "success",
}

export interface FlowSuccessData {
  type: "borrow" | "repay";
  amount: number;
  symbol: string;
  icon: string;
}

interface UseBorrowFlowOptions {
  initialTab?: LoanTab;
  /** When provided, skips asset selection and goes straight to the form */
  initialAsset?: string;
}

export interface UseBorrowFlowResult {
  step: BorrowFlowStep;
  activeTab: LoanTab;
  setActiveTab: (tab: LoanTab) => void;
  selectedAssetSymbol: string | null;
  successData: FlowSuccessData | null;
  selectAsset: (symbol: string) => void;
  goBack: () => void;
  completeBorrow: (amount: number, symbol: string, icon: string) => void;
  completeRepay: (amount: number, symbol: string, icon: string) => void;
  reset: () => void;
}

export function useBorrowFlow(
  options?: UseBorrowFlowOptions,
): UseBorrowFlowResult {
  const { initialTab, initialAsset } = options ?? {};

  const [step, setStep] = useState(
    initialAsset ? BorrowFlowStep.FORM : BorrowFlowStep.ASSET_SELECTION,
  );
  const [activeTab, setActiveTab] = useState<LoanTab>(
    initialTab ?? LOAN_TAB.BORROW,
  );
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string | null>(
    initialAsset ?? null,
  );
  const [successData, setSuccessData] = useState<FlowSuccessData | null>(null);

  // Sync when props change (e.g., opening from a different button)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialAsset) {
      setSelectedAssetSymbol(initialAsset);
      setStep(BorrowFlowStep.FORM);
    }
  }, [initialAsset]);

  const selectAsset = useCallback((symbol: string) => {
    setSelectedAssetSymbol(symbol);
    setStep(BorrowFlowStep.FORM);
  }, []);

  const goBack = useCallback(() => {
    setStep(BorrowFlowStep.ASSET_SELECTION);
  }, []);

  const completeBorrow = useCallback(
    (amount: number, symbol: string, icon: string) => {
      setSuccessData({ type: "borrow", amount, symbol, icon });
      setStep(BorrowFlowStep.SUCCESS);
    },
    [],
  );

  const completeRepay = useCallback(
    (amount: number, symbol: string, icon: string) => {
      setSuccessData({ type: "repay", amount, symbol, icon });
      setStep(BorrowFlowStep.SUCCESS);
    },
    [],
  );

  const reset = useCallback(() => {
    if (initialAsset) {
      setSelectedAssetSymbol(initialAsset);
      setStep(BorrowFlowStep.FORM);
    } else {
      setSelectedAssetSymbol(null);
      setStep(BorrowFlowStep.ASSET_SELECTION);
    }
    setSuccessData(null);
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, initialAsset]);

  return {
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
  };
}
