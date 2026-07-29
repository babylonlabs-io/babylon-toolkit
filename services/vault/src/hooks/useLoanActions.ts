/**
 * useLoanActions hook
 * Owns the borrow/repay entry-point orchestration shared by the v2 dashboard
 * and the v3 Loans page: opening the borrow/repay asset picker (with the
 * single-borrowed-asset direct-navigation shortcut) and direct navigation to a
 * reserve's borrow/repay form.
 *
 * Every step is route state so the whole flow renders into one dialog — see
 * `applications/aave/components/Detail` (`LoanFlowOverlay`).
 */

import { useCallback } from "react";
import { useNavigate } from "react-router";

import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import featureFlags from "@/config/featureFlags";
import {
  getAssetPickerRoute,
  getReserveDetailRoute,
  parseReserveId,
} from "@/routes";

interface UseLoanActionsProps {
  /**
   * Borrowed assets (used to resolve the single-asset repay shortcut). Keyed by
   * reserve id, so the shortcut can't be pointed at a different reserve by a
   * spoofed symbol.
   */
  borrowedAssets: { reserveId: string }[];
}

export function useLoanActions({ borrowedAssets }: UseLoanActionsProps) {
  const navigate = useNavigate();
  const isV3 = featureFlags.isV3UiEnabled;

  const goToReserve = useCallback(
    (reserveId: bigint, tab: LoanTab) => {
      navigate(getReserveDetailRoute(reserveId, tab, isV3));
    },
    [navigate, isV3],
  );

  const openBorrowPicker = useCallback(() => {
    navigate(getAssetPickerRoute(LOAN_TAB.BORROW, isV3));
  }, [navigate, isV3]);

  const openRepay = useCallback(() => {
    // A single borrowed asset has no choice to make — skip the picker and open
    // its repay form directly. Fall through to the picker if that one row's id
    // doesn't parse (a god-mode demo row), rather than routing nowhere.
    const soleReserveId =
      borrowedAssets.length === 1
        ? parseReserveId(borrowedAssets[0].reserveId)
        : null;
    if (soleReserveId != null) {
      goToReserve(soleReserveId, LOAN_TAB.REPAY);
      return;
    }
    navigate(getAssetPickerRoute(LOAN_TAB.REPAY, isV3));
  }, [borrowedAssets, goToReserve, navigate, isV3]);

  return { openBorrowPicker, openRepay, goToReserve };
}
