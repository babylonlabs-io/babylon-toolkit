import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { createStateUtils } from "../../utils/createStateUtils";

export enum DepositStep {
  FORM = "form",
  SIGN = "sign",
}

interface DepositStateContext {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  /**
   * VP commission (bps) the depositor was shown for the primary provider,
   * frozen at commit time. Bounds `maxAcceptableCommissionBps` in the signing
   * flow, so it must be snapshotted with the rest of the deposit data rather
   * than re-read live — otherwise a background commission refetch between
   * review and signing could bind a value the depositor never saw.
   * `undefined` if the commission had not loaded at commit time.
   */
  quotedCommissionBps: number | undefined;
  feeRate: number;
  isSplitDeposit: boolean;
  splitVaultAmounts: bigint[] | null;
  goToStep: (step: DepositStep) => void;
  setDepositData: (
    amount: bigint,
    application: string,
    providers: string[],
    quotedCommissionBps: number | undefined,
  ) => void;
  setFeeRate: (feeRate: number) => void;
  setIsSplitDeposit: (v: boolean) => void;
  setSplitVaultAmounts: (amounts: bigint[] | null) => void;
  reset: () => void;
}

const { StateProvider, useState: useDepositState } =
  createStateUtils<DepositStateContext>({
    step: undefined,
    amount: 0n,
    selectedApplication: "",
    selectedProviders: [],
    quotedCommissionBps: undefined,
    feeRate: 0,
    isSplitDeposit: false,
    splitVaultAmounts: null,
    goToStep: () => {},
    setDepositData: () => {},
    setFeeRate: () => {},
    setIsSplitDeposit: () => {},
    setSplitVaultAmounts: () => {},
    reset: () => {},
  });

export function DepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<DepositStep>();
  const [amount, setAmount] = useState<bigint>(0n);
  const [selectedApplication, setSelectedApplication] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [quotedCommissionBps, setQuotedCommissionBps] = useState<
    number | undefined
  >(undefined);
  const [feeRate, setFeeRate] = useState(0);
  const [isSplitDeposit, setIsSplitDeposit] = useState(false);
  const [splitVaultAmounts, setSplitVaultAmounts] = useState<bigint[] | null>(
    null,
  );

  const goToStep = useCallback((newStep: DepositStep) => {
    setStep(newStep);
  }, []);

  const setDepositData = useCallback(
    (
      newAmount: bigint,
      application: string,
      providers: string[],
      commissionBps: number | undefined,
    ) => {
      setAmount(newAmount);
      setSelectedApplication(application);
      setSelectedProviders(providers);
      setQuotedCommissionBps(commissionBps);
    },
    [],
  );

  const updateFeeRate = useCallback((newFeeRate: number) => {
    setFeeRate(newFeeRate);
  }, []);

  const reset = useCallback(() => {
    setStep(undefined);
    setAmount(0n);
    setSelectedApplication("");
    setSelectedProviders([]);
    setQuotedCommissionBps(undefined);
    setFeeRate(0);
    setIsSplitDeposit(false);
    setSplitVaultAmounts(null);
  }, []);

  const context = useMemo(
    () => ({
      step,
      amount,
      selectedApplication,
      selectedProviders,
      quotedCommissionBps,
      feeRate,
      isSplitDeposit,
      splitVaultAmounts,
      goToStep,
      setDepositData,
      setFeeRate: updateFeeRate,
      setIsSplitDeposit,
      setSplitVaultAmounts,
      reset,
    }),
    [
      step,
      amount,
      selectedApplication,
      selectedProviders,
      quotedCommissionBps,
      feeRate,
      isSplitDeposit,
      splitVaultAmounts,
      goToStep,
      setDepositData,
      updateFeeRate,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useDepositState };
