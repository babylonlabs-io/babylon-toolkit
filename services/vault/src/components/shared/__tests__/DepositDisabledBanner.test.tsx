import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  noticeBannerMessage: undefined as string | undefined,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

import { COPY } from "@/copy";

import { DepositDisabledBanner } from "../DepositDisabledBanner";

beforeEach(() => {
  featureFlagsMock.noticeBannerMessage = undefined;
});

describe("DepositDisabledBanner", () => {
  it("renders the default maintenance message in the notice banner", () => {
    render(<DepositDisabledBanner visible />);

    expect(screen.getByRole("status")).toHaveClass("bbn-banner-notice");
    expect(
      screen.getByText(COPY.deposit.disabled.bannerMessage),
    ).toBeInTheDocument();
  });

  it("shows NEXT_PUBLIC_NOTICE_BANNER_MESSAGE instead of the default when set", () => {
    featureFlagsMock.noticeBannerMessage = "Deposits resume at 15:00 UTC.";

    render(<DepositDisabledBanner visible />);

    expect(
      screen.getByText("Deposits resume at 15:00 UTC."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.disabled.bannerMessage),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<DepositDisabledBanner visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
