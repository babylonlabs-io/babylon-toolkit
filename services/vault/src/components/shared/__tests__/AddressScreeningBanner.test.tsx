import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AddressScreeningBanner } from "../AddressScreeningBanner";

describe("AddressScreeningBanner", () => {
  it("links Terms of Use in the ineligible message", () => {
    render(<AddressScreeningBanner visible isUnavailable={false} />);

    expect(screen.getByText("Wallet not eligible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute(
      "href",
      "https://babylonlabs.io/terms-of-use",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the screening-unavailable message when screening is unavailable", () => {
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
