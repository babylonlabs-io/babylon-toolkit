import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { LOAN_TAB } from "../../constants";
import {
  ReserveDetailModalProvider,
  useReserveDetailModal,
} from "../ReserveDetailModalContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ReserveDetailModalProvider>{children}</ReserveDetailModalProvider>
);

describe("ReserveDetailModalContext", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useReserveDetailModal(), { wrapper });
    expect(result.current.activeReserve).toBeNull();
  });

  it("openReserveDetail sets the active reserve and lowercases the symbol", () => {
    const { result } = renderHook(() => useReserveDetailModal(), { wrapper });
    act(() => result.current.openReserveDetail("USDC", LOAN_TAB.REPAY));
    expect(result.current.activeReserve).toEqual({
      reserveSymbol: "usdc",
      tab: LOAN_TAB.REPAY,
    });
  });

  it("closeReserveDetail clears the active reserve", () => {
    const { result } = renderHook(() => useReserveDetailModal(), { wrapper });
    act(() => result.current.openReserveDetail("usdc", LOAN_TAB.BORROW));
    act(() => result.current.closeReserveDetail());
    expect(result.current.activeReserve).toBeNull();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useReserveDetailModal())).toThrow(
      "useReserveDetailModal must be used within a ReserveDetailModalProvider",
    );
  });
});
