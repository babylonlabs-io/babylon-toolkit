import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AddressScreeningBanner } from "../AddressScreeningBanner";

describe("AddressScreeningBanner", () => {
  it("links Terms of Use and contact support in the ineligible message", () => {
    render(<AddressScreeningBanner visible isUnavailable={false} />);

    expect(screen.getByText("Wallet not eligible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute(
      "href",
      "https://babylonlabs.io/terms-of-use",
    );
    expect(
      screen.getByRole("link", { name: "contact support" }),
    ).toHaveAttribute("href", "https://t.me/babylonofficialcommunity");
  });

  it("shows the backend-error message when screening is unavailable", () => {
    render(<AddressScreeningBanner visible isUnavailable />);

    expect(
      screen.getByText("Wallet screening unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Wallet not eligible")).not.toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(
      <AddressScreeningBanner visible={false} isUnavailable={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
