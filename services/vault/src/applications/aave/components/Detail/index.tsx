/**
 * The borrow / repay flow as ONE full-screen dialog with three steps: asset
 * picker, borrow/repay form, success. Step comes from the query string
 * (`?picker=`, `?reserve=&tab=`) plus local success state.
 *
 * One dialog on purpose: `.bbn-dialog-fullscreen` is an opaque `bg-surface`
 * panel, so handing off between two dialogs cross-fades two full-viewport
 * layers and the page shows through the gap.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { FeatureFlags } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";
import { getReserveDetailBaseRoute, getReserveDetailRoute } from "@/routes";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveBorrowedAssets, useAaveUserPosition } from "../../hooks";
import type { Asset } from "../../types";
import {
  AssetSelectionPanel,
  getAssetPickerWidthClass,
} from "../AssetSelectionPanel";
import {
  LOAN_SUCCESS_WIDTH_CLASS,
  LoanSuccessPanel,
} from "../LoanCard/LoanSuccessPanel";

import {
  type LoanSuccessState,
  ReserveDetailPanel,
} from "./ReserveDetailPanel";

const FORM_WIDTH_CLASS = "max-w-[520px]";

interface LoanFlowOverlayProps {
  picker: LoanTab | null;
  reserveId: string | null;
  tab: LoanTab;
}

export function LoanFlowOverlay({
  picker,
  reserveId,
  tab,
}: LoanFlowOverlayProps) {
  const navigate = useNavigate();
  const { isConnected } = useConnection();
  const { address } = useETHWallet();

  // Lifted from the Borrow/Repay forms so the dialog can refuse to close
  // mid-transaction — a dismiss would unmount the flow and the success screen
  // would never show even though the tx completes on-chain.
  const [isTxInFlight, setIsTxInFlight] = useState(false);
  const [success, setSuccess] = useState<LoanSuccessState | null>(null);

  // Same source the dashboard reads, so React Query serves both from one entry.
  const { position, debtValueUsd } = useAaveUserPosition(
    isConnected ? address : undefined,
  );
  const { borrowedAssets } = useAaveBorrowedAssets({ position, debtValueUsd });
  const repayAssets = useMemo(
    (): Asset[] =>
      borrowedAssets.map(({ symbol, name, icon }) => ({ symbol, name, icon })),
    [borrowedAssets],
  );

  const isV3 = FeatureFlags.isV3UiEnabled;
  const baseRoute = getReserveDetailBaseRoute(isV3);

  // `replace` so dismissing doesn't leave a history entry browser Back would
  // use to reopen the just-closed flow.
  const close = () => {
    setSuccess(null);
    navigate(baseRoute, { replace: true });
  };

  const showForm = Boolean(reserveId) && !success;

  const renderStep = () => {
    if (success) {
      return <LoanSuccessPanel {...success} onDone={close} />;
    }
    if (reserveId) {
      return (
        <ReserveDetailPanel
          reserveId={reserveId}
          tab={tab}
          onProcessingChange={setIsTxInFlight}
          onSuccess={setSuccess}
        />
      );
    }
    const mode = picker ?? tab;
    return (
      <AssetSelectionPanel
        mode={mode}
        assets={mode === LOAN_TAB.REPAY ? repayAssets : undefined}
        onSelectAsset={(symbol) =>
          navigate(getReserveDetailRoute(symbol, mode, isV3))
        }
      />
    );
  };

  const contentClassName = success
    ? LOAN_SUCCESS_WIDTH_CLASS
    : showForm
      ? FORM_WIDTH_CLASS
      : getAssetPickerWidthClass(picker ?? tab);

  return (
    <V3ModalShell
      open
      // Withholding `onClose` hides the X and no-ops the backdrop click;
      // `disableEscapeClose` covers ESC. Together they lock every dismiss path.
      onClose={isTxInFlight ? undefined : close}
      disableEscapeClose={isTxInFlight}
      contentClassName={contentClassName}
    >
      {renderStep()}
    </V3ModalShell>
  );
}
