import { useCallback, useState } from "react";

export enum BorrowFlowStep {
  ASSET_SELECTION = "asset_selection",
  BORROW_FORM = "borrow_form",
  SUCCESS = "success",
}

export interface BorrowSuccessData {
  amount: number;
  symbol: string;
  icon: string;
}

export interface UseBorrowFlowResult {
  step: BorrowFlowStep;
  selectedReserveId: string | null;
  successData: BorrowSuccessData | null;
  selectAsset: (reserveId: string) => void;
  goBack: () => void;
  completeBorrow: (amount: number, symbol: string, icon: string) => void;
  reset: () => void;
}

export function useBorrowFlow(): UseBorrowFlowResult {
  const [step, setStep] = useState(BorrowFlowStep.ASSET_SELECTION);
  const [selectedReserveId, setSelectedReserveId] = useState<string | null>(
    null,
  );
  const [successData, setSuccessData] = useState<BorrowSuccessData | null>(
    null,
  );

  const selectAsset = useCallback((reserveId: string) => {
    setSelectedReserveId(reserveId);
    setStep(BorrowFlowStep.BORROW_FORM);
  }, []);

  const goBack = useCallback(() => {
    setStep(BorrowFlowStep.ASSET_SELECTION);
  }, []);

  const completeBorrow = useCallback(
    (amount: number, symbol: string, icon: string) => {
      setSuccessData({ amount, symbol, icon });
      setStep(BorrowFlowStep.SUCCESS);
    },
    [],
  );

  const reset = useCallback(() => {
    setStep(BorrowFlowStep.ASSET_SELECTION);
    setSelectedReserveId(null);
    setSuccessData(null);
  }, []);

  return {
    step,
    selectedReserveId,
    successData,
    selectAsset,
    goBack,
    completeBorrow,
    reset,
  };
}
