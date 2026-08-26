import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { SuggestedDepositContainer } from "../SuggestedDepositContainer";

describe("SuggestedDepositContainer", () => {
  it("renders the label and the suggested amount", () => {
    render(
      <SuggestedDepositContainer
        suggestedAmountLabel="0.333 BTC"
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toHaveTextContent(
      `${COPY.deposit.form.suggestedDepositLabel} 0.333 BTC`,
    );
  });

  it("applies the suggestion when clicked", () => {
    const onSelect = vi.fn();
    render(
      <SuggestedDepositContainer
        suggestedAmountLabel="0.333 BTC"
        isSelected={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("exposes the selected state via aria-pressed", () => {
    const { rerender } = render(
      <SuggestedDepositContainer
        suggestedAmountLabel="0.333 BTC"
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(
      <SuggestedDepositContainer
        suggestedAmountLabel="0.333 BTC"
        isSelected={true}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
