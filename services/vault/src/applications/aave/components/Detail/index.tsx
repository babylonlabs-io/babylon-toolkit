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
import { COPY } from "@/copy";
import {
  demoBorrowCount,
  demoBorrowedReserveIds,
  isDemoAffectingLoans,
  useLoanOverride,
} from "@/overrides/loans";
import {
  getAssetPickerSearch,
  getHubPickerSearch,
  getReserveDetailSearch,
  parseReserveId,
} from "@/routes";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import { useAaveBorrowedAssets, useAaveUserPosition } from "../../hooks";
import {
  toBorrowedReserveIds,
  type BorrowReserveGate,
} from "../../utils/borrowReserveLimit";
import { groupReservesByUnderlying } from "../../utils/reserveGroups";
import { AssetSelectionPanel } from "../AssetSelectionPanel";
import { HubSelectionPanel } from "../HubSelectionPanel";
import {
  LOAN_SUCCESS_WIDTH_CLASS,
  LoanSuccessPanel,
} from "../LoanCard/LoanSuccessPanel";
import { LOAN_PICKER_WIDTH_CLASS } from "../LoanPickerFrame";
import { RepaySelectionPanel } from "../RepaySelectionPanel";

import { BorrowPickerLoading } from "./BorrowPickerLoading";
import { LoadErrorRetry } from "./LoadErrorRetry";
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
  const {
    borrowableReserves,
    allBorrowReserves,
    maxBorrowReserves,
    refetchConfig,
  } = useAaveConfig();

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

  // God-mode demo loans (dev only; compile-time null in production builds).
  const demoLoans = useLoanOverride();

  // The position's standing against the spoke's borrow-reserve cap, shared by
  // both borrow pickers. `borrowCount` is the Spoke's own counter — the number
  // its borrow check compares — not one derived from the resolved debts.
  //
  // `borrowedReserveIds` uses the Spoke's own criterion too: it clears the
  // borrowing flag at `drawnShares == 0`, while a debt position survives on a
  // premium-only residue. Keying off the map would leave such a reserve
  // selectable at the cap, and the borrow would revert.
  //
  // Null when the cap could not be read: `renderBorrowPicker` then blocks the
  // borrow side, so no picker renders and none needs a gate.
  const borrowGate: BorrowReserveGate | null = useMemo(() => {
    if (maxBorrowReserves.status === "unavailable") return null;
    const limit = maxBorrowReserves.limit;
    // Zero is the true count for an account whose position loaded as null,
    // and for a disconnected visitor, who cannot sign anything. The gates
    // below keep it from standing in for a count that has not arrived yet.
    const realBorrowCount = position?.accountData.borrowCount ?? 0n;
    const realBorrowedReserveIds = toBorrowedReserveIds(
      position?.debtPositions,
    );
    // God mode (dev only, null in production): a demo loan has no on-chain
    // position behind it, so the real count alone would leave the at-the-cap
    // state unreachable without a funded wallet and a real borrow. Count the
    // demo's reserves the way the Loans card does (`demoBorrowCount`), and
    // exempt what the demo stands for as owed (`demoBorrowedReserveIds`).
    //
    // Whatever the picker offers, the pre-sign gate re-reads the real position
    // against the Spoke's own cap, never the god-mode override, so nothing
    // here lets through a borrow the chain would revert.
    if (isDemoAffectingLoans(demoLoans)) {
      return {
        limit,
        borrowCount: demoBorrowCount(demoLoans, realBorrowCount),
        borrowedReserveIds: demoBorrowedReserveIds(demoLoans, {
          limit,
          realBorrowCount,
          realBorrowedReserveIds,
          reserves: allBorrowReserves,
        }),
      };
    }
    return {
      limit,
      borrowCount: realBorrowCount,
      borrowedReserveIds: realBorrowedReserveIds,
    };
  }, [maxBorrowReserves, position, demoLoans, allBorrowReserves]);

  // The finite cap a borrow picker enforces; null when the spoke caps nothing
  // (or the cap is unavailable, which blocks the borrow side on its own).
  const finiteCap = borrowGate?.limit ?? null;

  // A finite cap makes the borrow picker a protocol gate, not a convenience:
  // an unknown position would render every asset selectable for an account
  // that may be at the cap. Block the borrow side the way the repay side is
  // already blocked, rather than defaulting the count to zero.
  const borrowNeedsPosition =
    finiteCap !== null && isConnected && !position && !demoLoans?.hideReal;

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

  const ancillaryError = isConnected
    ? (position?.indexerError ?? positionError)
    : null;

  const renderRepayPicker = () => (
    <PositionGate
      positionError={isConnected && !position ? positionError : null}
      ancillaryError={ancillaryError}
      refetchPosition={refetchPosition}
    >
      <RepaySelectionPanel
        assets={borrowedAssets}
        assetsLoading={isPositionLoading}
        onSelectReserve={(selectedReserveId) =>
          openStep(getReserveDetailSearch(selectedReserveId, LOAN_TAB.REPAY))
        }
      />
    </PositionGate>
  );

  const renderBorrowPicker = () => {
    // An unreadable cap leaves no way to tell which reserves the Spoke would
    // accept, so the borrow side is blocked until the config read succeeds.
    // This is a config failure, not a position one, so it names the cap and
    // retries the config. The repay side does not depend on the cap.
    if (borrowGate === null) {
      return (
        <LoadErrorRetry
          message={COPY.loans.borrowLimit.capLoadError}
          onRetry={refetchConfig}
          retryFailureLog="Could not reload the Aave config"
        />
      );
    }
    return (
      <PositionGate
        positionError={borrowNeedsPosition ? positionError : null}
        ancillaryError={ancillaryError}
        refetchPosition={refetchPosition}
      >
        {borrowNeedsPosition && isPositionLoading ? (
          // Ahead of the hub branch, which a pasted or refreshed
          // `?picker=borrow&asset=…` URL reaches directly.
          <BorrowPickerLoading
            mode={showHubPicker ? "hub" : "asset"}
            limit={finiteCap}
          />
        ) : showHubPicker ? (
          <HubSelectionPanel
            underlying={asset}
            borrowGate={borrowGate}
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
          <AssetSelectionPanel
            onSelectAsset={selectAsset}
            borrowGate={borrowGate}
          />
        )}
      </PositionGate>
    );
  };

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
    return (picker ?? tab) === LOAN_TAB.REPAY
      ? renderRepayPicker()
      : renderBorrowPicker();
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
