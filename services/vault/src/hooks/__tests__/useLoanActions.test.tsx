/**
 * The borrow/repay entry points must not change the pathname.
 *
 * Regression guard: they used to navigate to the flow's base route (`/loans`),
 * so opening the picker from Overview mounted and painted the Loans page and
 * the depositor watched it flash behind the full-screen dialog before it
 * covered them. The step now lives in the search alone.
 */

import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { LOAN_TAB } from "@/applications/aave/constants";
import { useLoanActions } from "@/hooks/useLoanActions";

interface Harness {
  actions: ReturnType<typeof useLoanActions>;
  location: { pathname: string; search: string };
}

function renderAt(
  initialPath: string,
  borrowedAssets: { reserveId: string }[] = [],
): Harness {
  const harness = {} as Harness;

  function Probe() {
    harness.actions = useLoanActions({ borrowedAssets });
    const { pathname, search } = useLocation();
    harness.location = { pathname, search };
    return null;
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );

  render(wrapper({ children: <Probe /> }));
  return harness;
}

describe("useLoanActions", () => {
  it("opens the borrow picker without leaving Overview", () => {
    const harness = renderAt("/");

    act(() => harness.actions.openBorrowPicker());

    expect(harness.location.pathname).toBe("/");
    expect(harness.location.search).toBe("?picker=borrow");
  });

  it("opens the borrow picker without leaving the Vaults page", () => {
    const harness = renderAt("/vaults");

    act(() => harness.actions.openBorrowPicker());

    expect(harness.location.pathname).toBe("/vaults");
    expect(harness.location.search).toBe("?picker=borrow");
  });

  it("opens the repay picker in place when several assets are borrowed", () => {
    const harness = renderAt("/", [{ reserveId: "1" }, { reserveId: "2" }]);

    act(() => harness.actions.openRepay());

    expect(harness.location.pathname).toBe("/");
    expect(harness.location.search).toBe("?picker=repay");
  });

  it("skips the picker for a single borrowed asset and opens its repay form in place", () => {
    const harness = renderAt("/vaults", [{ reserveId: "1" }]);

    act(() => harness.actions.openRepay());

    expect(harness.location.pathname).toBe("/vaults");
    expect(harness.location.search).toBe("?reserve=1&tab=repay");
  });

  it("opens a reserve's form in place rather than routing to the loans page", () => {
    const harness = renderAt("/");

    act(() => harness.actions.goToReserve(7n, LOAN_TAB.BORROW));

    expect(harness.location.pathname).toBe("/");
    expect(harness.location.search).toBe("?reserve=7&tab=borrow");
  });
});
