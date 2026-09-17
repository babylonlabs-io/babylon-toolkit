/**
 * The borrow / repay flow as ONE full-screen dialog. The step comes from the
 * query string plus local success state:
 * - `?picker=borrow`: Select asset, one card per token
 * - `?picker=borrow&asset=<underlying>`: Select hub, that token's reserves
 * - `?picker=repay`: the repay picker, one row per debt
 * - `?reserve=<id>&tab=`: the borrow / repay form
 * - success, once the transaction settles
 *
 * One dialog on purpose: `.bbn-dialog-fullscreen` is an opaque `bg-surface`
 * panel, so handing off between two dialogs cross-fades two full-viewport
 * layers and the page shows through the gap.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getAddress, type Address } from "viem";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { useConnection, useETHWallet } from "@/context/wallet";
import {
  getAssetPickerSearch,
  getHubPickerSearch,
  getReserveDetailSearch,
  parseReserveId,
} from "@/routes";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveBorrowedAssets, useAaveUserPosition } from "../../hooks";
import { groupReservesByUnderlying } from "../../utils/reserveGroups";
import { AssetSelectionPanel } from "../AssetSelectionPanel";
import { HubSelectionPanel } from "../HubSelectionPanel";
import {
  LOAN_SUCCESS_WIDTH_CLASS,
  LoanSuccessPanel,
} from "../LoanCard/LoanSuccessPanel";
import { LOAN_PICKER_WIDTH_CLASS } from "../LoanPickerFrame";
import { RepaySelectionPanel } from "../RepaySelectionPanel";

import { PositionGate } from "./PositionGate";
import {
  ReserveDetailPanel,
  type LoanSuccessState,
} from "./ReserveDetailPanel";

const FORM_WIDTH_CLASS = "max-w-[520px]";

interface LoanFlowOverlayProps {
  picker: LoanTab | null;
  reserveId: string | null;
  tab: LoanTab;
  /** Underlying chosen in Select asset (`?asset=`); navigation only. */
  asset: Address | null;
}

export function LoanFlowOverlay({
  picker,
  reserveId,
  tab,
  asset,
}: LoanFlowOverlayProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isConnected } = useConnection();
  const { address } = useETHWallet();
  const { borrowableReserves, allBorrowReserves } = useAaveConfig();

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
    error: positionError,
    refetch: refetchPosition,
  } = useAaveUserPosition(isConnected ? address : undefined);
  const { borrowedAssets } = useAaveBorrowedAssets({ position, debtValueUsd });

  // Each token's borrowable reserves, one per hub. Decides whether picking a
  // token needs Select hub, and where the borrow form's back arrow returns.
  const borrowableByUnderlying = useMemo(
    () =>
      new Map(
        groupReservesByUnderlying(borrowableReserves).map((group) => [
          group.underlying,
          group.reserves,
        ]),
      ),
    [borrowableReserves],
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

  // Every step change `replace`s, so no step leaves an entry behind: browser
  // Back from any step returns to the page, and Back after closing can't drop
  // the user into the flow again.
  const openStep = (search: string) =>
    navigate({ pathname, search }, { replace: true });

  const selectAsset = (underlying: Address) => {
    const reserves = borrowableByUnderlying.get(underlying) ?? [];
    // A token listed on one hub has no hub to choose: open its form directly.
    if (reserves.length === 1) {
      openStep(
        getReserveDetailSearch(
          reserves[0].reserveId,
          LOAN_TAB.BORROW,
          underlying,
        ),
      );
      return;
    }
    openStep(getHubPickerSearch(underlying));
  };

  const showForm = Boolean(reserveId) && !showSuccess;
  // Select hub: a borrow run that has picked a token but not yet a reserve.
  const showHubPicker =
    !showSuccess &&
    !reserveId &&
    (picker ?? tab) === LOAN_TAB.BORROW &&
    asset !== null;

  // Back follows the pickers' own path. Select hub goes back to Select asset.
  // The borrow form goes back only when its URL says it was reached through
  // the pickers, and only for the token it names; a form opened from a Loans
  // row, a market page or the token dropdown carries no `asset` and keeps the
  // close button.
  // Parsed the way the form parses it, so `?reserve=05` names reserve 5 here too.
  const openReserveId = parseReserveId(reserveId);
  const openReserve =
    openReserveId === null
      ? undefined
      : allBorrowReserves.find((r) => r.reserveId === openReserveId);
  const backSearch = showHubPicker
    ? getAssetPickerSearch(LOAN_TAB.BORROW)
    : showForm &&
        tab === LOAN_TAB.BORROW &&
        asset !== null &&
        openReserve !== undefined &&
        getAddress(openReserve.reserve.underlying) === asset
      ? (borrowableByUnderlying.get(asset)?.length ?? 0) > 1
        ? getHubPickerSearch(asset)
        : getAssetPickerSearch(LOAN_TAB.BORROW)
      : null;

  const renderStep = () => {
    if (showSuccess) {
      return (
        <LoanSuccessPanel
          variant={success.variant}
          amount={success.amount}
          symbol={success.symbol}
          hubLabel={success.hubLabel}
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
      <PositionGate
        positionError={
          mode === LOAN_TAB.REPAY && isConnected && !position
            ? positionError
            : null
        }
        ancillaryError={
          isConnected ? (position?.indexerError ?? positionError) : null
        }
        refetchPosition={refetchPosition}
      >
        {mode === LOAN_TAB.REPAY ? (
          <RepaySelectionPanel
            assets={borrowedAssets}
            assetsLoading={isPositionLoading}
            onSelectReserve={(selectedReserveId) =>
              openStep(
                getReserveDetailSearch(selectedReserveId, LOAN_TAB.REPAY),
              )
            }
          />
        ) : showHubPicker ? (
          <HubSelectionPanel
            underlying={asset}
            onSelectReserve={(selectedReserveId) =>
              openStep(
                getReserveDetailSearch(
                  selectedReserveId,
                  LOAN_TAB.BORROW,
                  asset,
                ),
              )
            }
          />
        ) : (
          <AssetSelectionPanel onSelectAsset={selectAsset} />
        )}
      </PositionGate>
    );
  };

  const contentClassName = showSuccess
    ? LOAN_SUCCESS_WIDTH_CLASS
    : showForm
      ? FORM_WIDTH_CLASS
      : LOAN_PICKER_WIDTH_CLASS;

  return (
    <V3ModalShell
      open
      // Withholding `onClose` hides the X and no-ops the backdrop click;
      // `disableEscapeClose` covers ESC. Together they lock every dismiss path.
      onClose={isTxInFlight ? undefined : close}
      onBack={
        backSearch === null || isTxInFlight
          ? undefined
          : () => openStep(backSearch)
      }
      disableEscapeClose={isTxInFlight}
      contentClassName={contentClassName}
    >
      {renderStep()}
    </V3ModalShell>
  );
}
