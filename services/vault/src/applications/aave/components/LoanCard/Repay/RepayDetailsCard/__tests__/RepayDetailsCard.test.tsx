import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { HEALTH_FACTOR_COLORS } from "@/applications/aave/utils";
import { COPY } from "@/copy";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: () => null,
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared", () => ({
  HeartIcon: ({ color }: { color: string }) => (
    <span data-testid="heart-icon" data-color={color} />
  ),
}));

import { RepayDetailsCard } from "../RepayDetailsCard";

describe("RepayDetailsCard", () => {
  it("names the hub the debt is owed to before the debt itself", () => {
    const { container } = render(
      <RepayDetailsCard
        hub={{
          source: "registry",
          address: "0xb3283508a0E96F80CF79DC2a1135F10dA170138D",
          label: "Babylon Hub",
        }}
        debt="69,409 USDC"
        healthFactor="1.10"
        healthFactorValue={1.1}
      />,
    );

    const text = container.textContent ?? "";
    const hubAt = text.indexOf(`${COPY.loans.hub.label}Babylon Hub`);
    const debtAt = text.indexOf(`${COPY.loans.debtLabel}69,409 USDC`);

    expect(hubAt).toBeGreaterThanOrEqual(0);
    expect(debtAt).toBeGreaterThan(hubAt);
  });
});

describe("RepayDetailsCard health factor row", () => {
  const baseProps = {
    hub: {
      source: "registry" as const,
      address: "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as const,
      label: "Babylon Hub",
    },
    debt: "69,409 USDC",
    healthFactor: "1.50",
    healthFactorValue: 1.5,
  };

  it("renders each value before its heart, greying the previous heart and colouring the current one by status", () => {
    render(<RepayDetailsCard {...baseProps} healthFactorOriginal="1.10" />);

    const previous = screen.getByText("1.10");
    expect(previous.firstChild?.textContent).toBe("1.10");
    expect(previous.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.GRAY,
    );
    expect(previous).toHaveClass("text-accent-secondary");

    const current = screen.getByText("1.50");
    expect(current.firstChild?.textContent).toBe("1.50");
    expect(current.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.AMBER,
    );
  });

  it("renders the value before its heart when there is no previous health factor", () => {
    render(<RepayDetailsCard {...baseProps} />);

    const current = screen.getByText("1.50");
    expect(current.firstChild?.textContent).toBe("1.50");
    expect(current.lastElementChild).toHaveAttribute(
      "data-color",
      HEALTH_FACTOR_COLORS.AMBER,
    );
  });
});
