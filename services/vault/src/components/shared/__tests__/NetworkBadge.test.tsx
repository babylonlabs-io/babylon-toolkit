import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: {
    MAINNET: "mainnet",
    SIGNET: "signet",
  },
}));

const mockGetBTCNetwork = vi.fn(() => "signet");
vi.mock("@/config", () => ({
  getBTCNetwork: () => mockGetBTCNetwork(),
}));

// Import after mocks
import { NetworkBadge } from "../NetworkBadge";

describe("NetworkBadge", () => {
  it("renders nothing on mainnet", () => {
    mockGetBTCNetwork.mockReturnValue("mainnet");

    const { container } = render(<NetworkBadge />);

    expect(
      screen.queryByText(COPY.header.networkBadge),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("renders the badge on signet", () => {
    mockGetBTCNetwork.mockReturnValue("signet");

    render(<NetworkBadge />);

    expect(screen.getByText(COPY.header.networkBadge)).toBeInTheDocument();
  });
});
