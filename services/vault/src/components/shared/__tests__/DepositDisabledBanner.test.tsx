import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { DepositDisabledBanner } from "../DepositDisabledBanner";

describe("DepositDisabledBanner", () => {
  it("renders the maintenance message in the notice banner", () => {
    render(<DepositDisabledBanner visible />);

    expect(screen.getByRole("status")).toHaveClass("bbn-banner-notice");
    expect(
      screen.getByText(COPY.deposit.disabled.bannerMessage),
    ).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<DepositDisabledBanner visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
