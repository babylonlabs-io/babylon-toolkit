import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExploreApp } from "@/config/exploreApps";

import { ExploreAppCard } from "../ExploreAppCard";

const app: ExploreApp = {
  id: "aave",
  name: "AAVE Protocol",
  description:
    "Decentralized lending protocol enabling users to borrow and lend digital assets.",
  logoUrl: "/images/explore/aave.svg",
  appUrl: "https://example.com/aave",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExploreAppCard", () => {
  it("renders the app name, description and logo", () => {
    render(<ExploreAppCard app={app} />);

    expect(screen.getByText("AAVE Protocol")).toBeInTheDocument();
    expect(screen.getByText(app.description)).toBeInTheDocument();

    const logo = screen.getByAltText("AAVE Protocol logo");
    expect(logo).toHaveAttribute("src", "/images/explore/aave.svg");
  });

  it("opens the destination in a new tab with noopener when Go to App is clicked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<ExploreAppCard app={app} />);
    screen.getByTestId("explore-go-to-app").click();

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/aave",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
