import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExploreApp } from "@/config/exploreApps";

import Explore from "../Explore";

const appsMock = vi.hoisted(() => ({ current: [] as ExploreApp[] }));

vi.mock("@/hooks/useExploreApps", () => ({
  useExploreApps: () => ({ apps: appsMock.current, isLoading: false }),
}));

// EmptyState (rendered when the list is empty) pulls in <Connect/> and the
// heavy wallet-connector graph vitest can't evaluate — stub it.
vi.mock("@/components/Wallet", () => ({
  Connect: () => <button type="button">Connect</button>,
}));

const apps: ExploreApp[] = [
  {
    id: "aave",
    name: "AAVE Protocol",
    description: "Decentralized lending protocol.",
    logoUrl: "/images/explore/aave.svg",
    appUrl: "https://example.com/aave",
  },
  {
    id: "cradle",
    name: "Cradle",
    description: "Financial products around Bitcoin-backed liquidity.",
    logoUrl: "/images/explore/cradle.svg",
    appUrl: "https://example.com/cradle",
  },
];

describe("Explore page", () => {
  it("renders a card for every app returned by the hook", () => {
    appsMock.current = apps;

    render(<Explore />);

    expect(screen.getByText("AAVE Protocol")).toBeInTheDocument();
    expect(screen.getByText("Cradle")).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-app-card")).toHaveLength(2);
  });

  it("shows the empty state when there are no apps", () => {
    appsMock.current = [];

    render(<Explore />);

    expect(screen.getByText("No apps to explore yet")).toBeInTheDocument();
    expect(screen.queryByTestId("explore-app-card")).not.toBeInTheDocument();
  });
});
