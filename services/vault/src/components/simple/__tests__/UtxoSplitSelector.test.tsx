import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  UtxoSplitSelector,
  type TwoVaultSplitProps,
} from "../UtxoSplitSelector";

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: false,
}));

vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
}));

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

beforeEach(() => {
  featureFlagsMock.isV3UiEnabled = true;
});

describe("UtxoSplitSelector (v3)", () => {
  it("renders both split options when expanded", () => {
    render(
      <UtxoSplitSelector
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
      <UtxoSplitSelector
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
      <UtxoSplitSelector
        twoVaultSplit={baseSplit({ isEnabled: true, onChange })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(noSplitRow());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("keeps the split option unavailable (aria-disabled) and unselectable when it cannot split", () => {
    const onChange = vi.fn();
    render(
      <UtxoSplitSelector
        twoVaultSplit={baseSplit({ canSplit: false, onChange })}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    const row = splitRow();
    expect(row).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalledWith(true);
  });
});
