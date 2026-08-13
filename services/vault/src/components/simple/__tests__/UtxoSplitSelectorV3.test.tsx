import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { formatBtcFromSats } from "@/utils/formatting";

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

  it("shows the minimum-deposit hint between the two-vault option and no-split", () => {
    const minDepositForSplit = 40_000_000n;
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({
          canSplit: false,
          isSplitAmountTooLow: true,
          minDepositForSplit,
        })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    const hint = screen.getByText(
      COPY.deposit.form.splitTooLowHint(formatBtcFromSats(minDepositForSplit))
        .minimum,
    );
    // The hint belongs to the two-vault option it qualifies, but sits outside
    // that option's box so it is not a click target.
    expect(hint.closest('[role="button"]')).toBeNull();
    expect(splitRow().compareDocumentPosition(hint)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(noSplitRow().compareDocumentPosition(hint)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it("hides the minimum-deposit hint when the amount is not too low", () => {
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit()}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(COPY.deposit.form.splitTooLowHint("0.4 BTC").minimum),
    ).toBeNull();
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
