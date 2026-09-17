import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: () => null,
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared", () => ({
  HeartIcon: () => <span data-testid="heart-icon" />,
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
