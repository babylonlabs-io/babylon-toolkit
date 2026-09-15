import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: () => null,
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Text: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { LoanSuccessPanel } from "../LoanSuccessPanel";

describe("LoanSuccessPanel", () => {
  it("names the hub the borrow was credited from", () => {
    const { container } = render(
      <LoanSuccessPanel
        variant="borrow"
        amount={20000}
        symbol="USDC"
        hubLabel="Babylon Hub"
        decimals={6}
        assetIcon="usdc.svg"
        onDone={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent(
      "20,000 USDC on Babylon Hub has been credited to your wallet.",
    );
  });

  it("names the hub the repaid debt was owed to", () => {
    render(
      <LoanSuccessPanel
        variant="repay"
        amount={500}
        symbol="USDC"
        hubLabel="Core Hub"
        decimals={6}
        assetIcon="usdc.svg"
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByText("500 USDC")).toBeInTheDocument();
    expect(
      screen.getByText("on Core Hub", { exact: false }),
    ).toBeInTheDocument();
  });
});
