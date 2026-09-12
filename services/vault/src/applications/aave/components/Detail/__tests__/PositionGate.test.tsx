/**
 * Tests for PositionGate — the audit-#311 fail-closed gate that the
 * AaveReserveDetail page wraps around its LoanCard. Tested in isolation
 * so we cover the gating behaviour without standing up the full page.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PositionGate } from "../PositionGate";

const Child = () => <div data-testid="child">child</div>;

describe("PositionGate", () => {
  it("hard-blocks children and shows Retry button when positionError is set", () => {
    render(
      <PositionGate
        positionError={new Error("debt fetch failed")}
        ancillaryError={null}
        refetchPosition={vi.fn()}
      >
        <Child />
      </PositionGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByText(/Couldn't load your position/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("Retry disables the button until the read finishes", async () => {
    let finish: (value: unknown) => void = () => {};
    const refetch = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <PositionGate
        positionError={new Error("debt fetch failed")}
        ancillaryError={null}
        refetchPosition={refetch}
      >
        <Child />
      </PositionGate>,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDisabled();
    finish(null);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled(),
    );
  });

  it("renders children with a soft-warn banner when only ancillaryError is set", () => {
    render(
      <PositionGate
        positionError={null}
        ancillaryError={new Error("price fetch failed")}
        refetchPosition={vi.fn()}
      >
        <Child />
      </PositionGate>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.getByText(/Some data couldn't be loaded/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("renders children with no banner when both errors are null", () => {
    render(
      <PositionGate
        positionError={null}
        ancillaryError={null}
        refetchPosition={vi.fn()}
      >
        <Child />
      </PositionGate>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load your position/i)).toBeNull();
    expect(screen.queryByText(/Some data couldn't be loaded/i)).toBeNull();
  });

  it("positionError takes precedence even if ancillaryError is also set", () => {
    render(
      <PositionGate
        positionError={new Error("debt fetch failed")}
        ancillaryError={new Error("price fetch failed")}
        refetchPosition={vi.fn()}
      >
        <Child />
      </PositionGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByText(/Some data couldn't be loaded/i)).toBeNull();
    expect(screen.getByText(/Couldn't load your position/i)).toBeTruthy();
  });
});
