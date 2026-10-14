import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDeploymentKind } from "@/config";

import { NetworkBadge } from "../NetworkBadge";

vi.mock("@/config", () => ({
  getDeploymentKind: vi.fn(),
}));

describe("NetworkBadge", () => {
  it("shows Testnet for a test deployment", () => {
    vi.mocked(getDeploymentKind).mockReturnValue("test");
    render(<NetworkBadge />);
    expect(screen.getByText("Testnet")).toBeInTheDocument();
  });

  it("shows the internal label for an internal deployment", () => {
    vi.mocked(getDeploymentKind).mockReturnValue("internal");
    render(<NetworkBadge />);
    expect(screen.getByText("Internal test")).toBeInTheDocument();
  });

  it("renders nothing for production", () => {
    vi.mocked(getDeploymentKind).mockReturnValue("production");
    const { container } = render(<NetworkBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
