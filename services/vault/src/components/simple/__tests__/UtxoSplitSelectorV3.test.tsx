import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { formatBtcFromSats } from "@/utils/formatting";

import {
  UtxoSplitSelectorV3,
  type TwoVaultSplitProps,
} from "../UtxoSplitSelectorV3";

/** Enough to make the hint's amount recognisable in an assertion: 0.4 BTC. */
const MIN_DEPOSIT_FOR_SPLIT_SATS = 40_000_000n;

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
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({
          canSplit: false,
          isSplitAmountTooLow: true,
          minDepositForSplit: MIN_DEPOSIT_FOR_SPLIT_SATS,
        })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    const hint = screen.getByText(
      COPY.deposit.form.splitTooLowHint(
        formatBtcFromSats(MIN_DEPOSIT_FOR_SPLIT_SATS),
      ).minimum,
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

    // Query the hint by the copy it is built from rather than a literal, so a
    // copy change cannot make this pass by matching nothing.
    expect(
      screen.queryByText(
        COPY.deposit.form.splitTooLowHint(
          formatBtcFromSats(MIN_DEPOSIT_FOR_SPLIT_SATS),
        ).minimum,
      ),
    ).toBeNull();
    // The live region stays mounted and goes empty rather than unmounting -
    // a region has to be in the DOM before its content changes for the change
    // to be announced at all.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("keeps the minimum-deposit hint out of the accessibility tree while the panel is collapsed", () => {
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({
          canSplit: false,
          isSplitAmountTooLow: true,
          minDepositForSplit: MIN_DEPOSIT_FOR_SPLIT_SATS,
        })}
        expanded={false}
        onExpandedChange={vi.fn()}
      />,
    );

    // core-ui's AccordionDetails keeps its children MOUNTED when collapsed and
    // hides them with `visibility: hidden`, so the hint node is in the DOM
    // either way. What removes it is the accessibility tree. Asserting mere
    // absence passed for a reason no reader of the test could see, and would
    // go on passing if the accordion ever switched to `display: none` or to
    // unmounting - a different behaviour, same green.
    expect(
      screen.getByText(
        COPY.deposit.form.splitTooLowHint(
          formatBtcFromSats(MIN_DEPOSIT_FOR_SPLIT_SATS),
        ).minimum,
      ),
    ).not.toBeVisible();
  });

  it("announces the minimum off-screen even while the panel is collapsed", () => {
    // The panel starts collapsed, so the amount crosses below the minimum with
    // the visible notice already outside the accessibility tree. Without this
    // region a screen-reader user is never told why the recommended option is
    // disabled - which is the whole point of the notice.
    render(
      <UtxoSplitSelectorV3
        twoVaultSplit={baseSplit({
          canSplit: false,
          isSplitAmountTooLow: true,
          minDepositForSplit: MIN_DEPOSIT_FOR_SPLIT_SATS,
        })}
        expanded={false}
        onExpandedChange={vi.fn()}
      />,
    );

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent(
      COPY.deposit.form.splitTooLowHint(
        formatBtcFromSats(MIN_DEPOSIT_FOR_SPLIT_SATS),
      ).announcement,
    );
    expect(region).toBeVisible();
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
