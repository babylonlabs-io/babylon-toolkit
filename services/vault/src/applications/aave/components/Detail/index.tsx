/**
 * LoanFlowOverlay
 *
 * The borrow / repay flow as ONE full-screen dialog with three steps: the asset
 * picker, the borrow/repay form, and the success screen. Which step shows is
 * driven by the query string (`?picker=`, `?reserve=&tab=`) plus local success
 * state, so a deep link lands on the right step.
 *
 * One dialog on purpose. `.bbn-dialog-fullscreen` is an opaque `bg-surface`
 * panel, so handing off between two dialogs cross-fades two opaque full-viewport
 * layers — their combined coverage bottoms out at 75%, showing the page through
 * the gap. Keeping every step inside one shell means there is nothing to
 * cross-fade.
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

/** Card width of the borrow/repay form step. */
const FORM_WIDTH_CLASS = "max-w-[520px]";

interface LoanFlowOverlayProps {
  /** Picker step to show; ignored once a reserve is selected. */
  picker: LoanTab | null;
  /** Reserve whose borrow/repay form to show; null keeps the picker step. */
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

  // True while a borrow/repay tx is signing or submitting. Lifted from the
  // Borrow/Repay forms (via LoanContext.onProcessingChange) so the dialog can
  // refuse to close mid-transaction — otherwise an ESC/backdrop/X dismiss
  // unmounts the flow and the success screen never shows even though the tx
  // completes on-chain.
  const [isTxInFlight, setIsTxInFlight] = useState(false);
  const [success, setSuccess] = useState<LoanSuccessState | null>(null);

  // Repay picker rows. Same source the dashboard reads, so React Query serves
  // both from one cache entry rather than refetching for the overlay.
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

  // Use `replace` so dismissing the overlay doesn't leave a history entry that
  // browser Back would use to reopen the just-closed flow.
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
      // Withholding `onClose` hides the close button and no-ops the backdrop
      // click; `disableEscapeClose` covers the ESC key — together they lock
      // all three dismiss paths while a tx is in flight.
      onClose={isTxInFlight ? undefined : close}
      disableEscapeClose={isTxInFlight}
      contentClassName={contentClassName}
    >
      {renderStep()}
    </V3ModalShell>
  );
}
