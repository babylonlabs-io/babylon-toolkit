import { useCallback, useMemo, useState, type PropsWithChildren } from "react";
import { createStateUtils } from "../utils/createStateUtils";
import { usePeginStorage, type PendingPegin, PeginStatus } from "./usePeginStorage";

export enum VaultDepositStep {
  IDLE = "idle",
  FORM = "form",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

interface VaultDepositState {
  step: VaultDepositStep | undefined;
  processing: boolean;
  depositAmount: number;
  selectedProviders: string[];
  btcTxid: string;
  ethTxHash: string;
  pendingPegins: PendingPegin[];
  addPendingPegin: (pegin: PendingPegin) => void;
  updatePendingPeginStatus: (txHash: string, status: PeginStatus) => void;
  goToStep: (step: VaultDepositStep) => void;
  setDepositData: (amount: number, providers: string[]) => void;
  setTransactionHashes: (btcTxid: string, ethTxHash: string) => void;
  reset: () => void;
}

const { StateProvider, useState: useVaultDepositState } =
  createStateUtils<VaultDepositState>({
    step: undefined,
    processing: false,
    depositAmount: 0,
    selectedProviders: [],
    btcTxid: "",
    ethTxHash: "",
    pendingPegins: [],
    addPendingPegin: () => {},
    updatePendingPeginStatus: () => {},
    goToStep: () => {},
    setDepositData: () => {},
    setTransactionHashes: () => {},
    reset: () => {},
  });

export function VaultDepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<VaultDepositStep>();
  const [depositAmount, setDepositAmount] = useState(0);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [btcTxid, setBtcTxid] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [processing, setProcessing] = useState(false);

  // Use pegin storage hook for persistent pending deposits
  // Using a fixed key for now; in production this should be per-user (e.g., based on ETH address)
  const {
    pendingPegins,
    addPendingPegin,
    updatePendingPeginStatus,
  } = usePeginStorage('vault_deposits');

  const goToStep = useCallback((newStep: VaultDepositStep) => {
    console.log("[VaultDepositState] Navigating to step:", newStep);
    setStep(newStep);
  }, []);

  const setDepositData = useCallback((amount: number, providers: string[]) => {
    console.log("[VaultDepositState] Setting deposit data:", {
      amount,
      providers,
    });
    setDepositAmount(amount);
    setSelectedProviders(providers);
  }, []);

  const setTransactionHashes = useCallback((btc: string, eth: string) => {
    console.log("[VaultDepositState] Setting transaction hashes:", { btc, eth });
    setBtcTxid(btc);
    setEthTxHash(eth);
  }, []);

  const reset = useCallback(() => {
    console.log("[VaultDepositState] Resetting state");
    setStep(undefined);
    setDepositAmount(0);
    setSelectedProviders([]);
    setBtcTxid("");
    setEthTxHash("");
    setProcessing(false);
  }, []);

  const context = useMemo(
    () => ({
      step,
      processing,
      depositAmount,
      selectedProviders,
      btcTxid,
      ethTxHash,
      pendingPegins: pendingPegins as PendingPegin[],
      addPendingPegin,
      updatePendingPeginStatus,
      goToStep,
      setDepositData,
      setTransactionHashes,
      reset,
    }),
    [
      step,
      processing,
      depositAmount,
      selectedProviders,
      btcTxid,
      ethTxHash,
      pendingPegins,
      addPendingPegin,
      updatePendingPeginStatus,
      goToStep,
      setDepositData,
      setTransactionHashes,
      reset,
    ]
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useVaultDepositState };

