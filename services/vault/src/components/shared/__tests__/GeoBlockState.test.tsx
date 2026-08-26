import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    icon: "/images/btc.svg",
    coinSymbol: "BTC",
  }),
}));

import { GeoBlockState } from "../GeoBlockState";

describe("GeoBlockState", () => {
  it("renders the region-unavailable title and body", () => {
    render(<GeoBlockState />);

    expect(screen.getByText(COPY.geoBlock.title)).toBeInTheDocument();
    expect(screen.getByText(COPY.geoBlock.body)).toBeInTheDocument();
  });

  it("shows the BTC coin icon", () => {
    render(<GeoBlockState />);

    const icon = screen.getByAltText("BTC");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("src", "/images/btc.svg");
  });
});
