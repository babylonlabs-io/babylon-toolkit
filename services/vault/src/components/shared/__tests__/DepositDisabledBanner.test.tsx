import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { DepositDisabledBanner } from "../DepositDisabledBanner";

describe("DepositDisabledBanner", () => {
  it("shows the maintenance message when visible", () => {
    render(<DepositDisabledBanner visible />);

    expect(
      screen.getByText(COPY.deposit.disabled.bannerMessage),
    ).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<DepositDisabledBanner visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
