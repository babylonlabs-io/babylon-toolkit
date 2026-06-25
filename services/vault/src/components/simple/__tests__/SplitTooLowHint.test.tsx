import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";
import { formatBtcFromSats } from "@/utils/formatting";

import { SplitTooLowHint } from "../SplitTooLowHint";

describe("SplitTooLowHint", () => {
  // The visible message is reassembled from {prefix, splitName, middle, minimum}
  // fragments with explicit `{" "}` separators. This asserts the component joins
  // them in the right order with the right spacing, so a dropped separator or a
  // reordered span fails the test.
  it("renders the hint fragments in order with single-space separators", () => {
    const minDepositForSplit = 40_000_000n;
    const { container } = render(
      <SplitTooLowHint minDepositForSplit={minDepositForSplit} />,
    );

    const hint = COPY.deposit.form.splitTooLowHint(
      formatBtcFromSats(minDepositForSplit),
    );

    expect(container.textContent).toBe(
      `${hint.prefix} ${hint.splitName}${hint.middle} ${hint.minimum}`,
    );
  });
});
