import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  UtxoSplitSelectorV3,
  type TwoVaultSplitProps,
} from "../UtxoSplitSelectorV3";

function baseSplit(
  overrides: Partial<TwoVaultSplitProps> = {},
): TwoVaultSplitProps {
  return {
    isEnabled: false,
    onChange: vi.fn(),
    canSplit: true,
    isLoading: false,
    splitRatioLabel: "25/75",
    minDepositForSplit: 0n,
    isSplitAmountTooLow: false,
    ...overrides,
  };
}

function splitRow() {
  return screen
    .getByText(COPY.deposit.form.splitOptionDescription, { exact: false })
    .closest('[role="button"]') as HTMLElement;
}

function noSplitRow() {
  return screen
    .getByText(COPY.deposit.form.noSplitOptionDescription)
    .closest('[role="button"]') as HTMLElement;
}

describe("UtxoSplitSelectorV3", () => {
  it("renders both split options when expanded", () => {
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit()}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    expect(splitRow()).toBeTruthy();
    expect(noSplitRow()).toBeTruthy();
  });

  it("selects the two-vault split when its row is chosen", () => {
    const onChange = vi.fn();
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({ onChange })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(splitRow());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("selects no-split when its row is chosen", () => {
    const onChange = vi.fn();
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({ isEnabled: true, onChange })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(noSplitRow());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("collapses the panel after an option is selected", () => {
    const onExpandedChange = vi.fn();
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit()}
        expanded
        onExpandedChange={onExpandedChange}
      />,
    );

    fireEvent.click(splitRow());
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    onExpandedChange.mockClear();
    fireEvent.click(noSplitRow());
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it("keeps the split option unavailable (aria-disabled) and unselectable when it cannot split", () => {
    const onChange = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({ canSplit: false, onChange })}
        expanded
        onExpandedChange={onExpandedChange}
      />,
    );

    const row = splitRow();
    expect(row).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalledWith(true);
    // A rejected selection must not collapse the panel either.
    expect(onExpandedChange).not.toHaveBeenCalled();
  });
});
