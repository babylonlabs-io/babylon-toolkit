/**
 * The borrow / repay flow as ONE full-screen dialog with three steps: asset
 * picker, borrow/repay form, success. Step comes from the query string
 * (`?picker=`, `?reserve=&tab=`) plus local success state.
 *
 * One dialog on purpose: `.bbn-dialog-fullscreen` is an opaque `bg-surface`
 * panel, so handing off between two dialogs cross-fades two full-viewport
 * layers and the page shows through the gap.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { useConnection, useETHWallet } from "@/context/wallet";
import { getReserveDetailSearch } from "@/routes";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveBorrowedAssets, useAaveUserPosition } from "../../hooks";
import {
  AssetSelectionPanel,
  getAssetPickerWidthClass,
  type SelectableAsset,
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
  const { pathname } = useLocation();
  const { isConnected } = useConnection();
  const { address } = useETHWallet();

  // Lifted from the Borrow/Repay forms so the dialog can refuse to close
  // mid-transaction — a dismiss would unmount the flow and the success screen
  // would never show even though the tx completes on-chain.
  const [isTxInFlight, setIsTxInFlight] = useState(false);
  const [success, setSuccess] = useState<LoanSuccessState | null>(null);

  // Same source the dashboard reads, so React Query serves both from one entry.
  const {
    position,
    debtValueUsd,
    isLoading: isPositionLoading,
  } = useAaveUserPosition(isConnected ? address : undefined);
  const { borrowedAssets } = useAaveBorrowedAssets({ position, debtValueUsd });
  // The reserve id rides along so selecting a repay row routes by id rather
  // than by the indexer's symbol (audit F7).
  const repayAssets = useMemo(
    (): SelectableAsset[] =>
      borrowedAssets.map(({ reserveId: id, symbol, name, icon }) => ({
        reserveId: BigInt(id),
        symbol,
        name,
        icon,
      })),
    [borrowedAssets],
  );

  // Success is local state while the step is URL-driven, so browser Back off
  // the completed form would otherwise keep showing it. It belongs to the
  // reserve that produced it: drop it as soon as the route leaves that reserve,
  // and don't render it for any other one.
  const successReserveId = success?.reserveId ?? null;
  const showSuccess = success !== null && successReserveId === reserveId;
  useEffect(() => {
    if (successReserveId !== null && successReserveId !== reserveId) {
      setSuccess(null);
    }
  }, [successReserveId, reserveId]);

  // Dropping the search alone returns the depositor to the page they opened
  // the flow from — the overlay renders over any page under the Aave layout,
  // so a fixed route here would teleport someone who started on Overview.
  // `replace` so dismissing doesn't leave a history entry browser Back would
  // use to reopen the just-closed flow.
  const close = () => {
    setSuccess(null);
    navigate({ pathname, search: "" }, { replace: true });
  };

  const showForm = Boolean(reserveId) && !showSuccess;

  const renderStep = () => {
    if (showSuccess) {
      return (
        <LoanSuccessPanel
          variant={success.variant}
          amount={success.amount}
          symbol={success.symbol}
          decimals={success.decimals}
          assetIcon={success.assetIcon}
          onDone={close}
        />
      );
    }
    if (reserveId) {
      return (
        <ReserveDetailPanel
          reserveId={reserveId}
          tab={tab}
          onProcessingChange={setIsTxInFlight}
          // The panel unmounts in the same commit that flips to success, so
          // its `onProcessingChange(false)` effect never runs — clear the lock
          // here or the success step keeps every dismiss path disabled.
          onSuccess={(settled) => {
            setIsTxInFlight(false);
            setSuccess(settled);
          }}
        />
      );
    }
    const mode = picker ?? tab;
    return (
      <AssetSelectionPanel
        mode={mode}
        assets={mode === LOAN_TAB.REPAY ? repayAssets : undefined}
        assetsLoading={isPositionLoading}
        // `replace` so the picker leaves no entry behind the form: browser Back
        // from the form returns to the page, and Back after closing can't drop
        // the user into the flow again.
        onSelectAsset={(selectedReserveId) =>
          navigate(
            {
              pathname,
              search: getReserveDetailSearch(selectedReserveId, mode),
            },
            { replace: true },
          )
        }
      />
    );
  };

  const contentClassName = showSuccess
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
