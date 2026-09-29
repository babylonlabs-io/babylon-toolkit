import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { HubLabel } from "../HubLabel";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: ({ tooltip }: { tooltip: string }) => (
    <span data-testid="hub-hint">{tooltip}</span>
  ),
}));

describe("HubLabel", () => {
  it("shows a registered hub's label without a warning", () => {
    render(
      <HubLabel
        hub={{
          source: "registry",
          address: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
          label: "Core Hub",
        }}
      />,
    );

    expect(screen.getByText("Core Hub")).toBeInTheDocument();
    expect(screen.queryByTestId("hub-hint")).not.toBeInTheDocument();
  });

  it("shows an unregistered hub's short address with the unknown-hub warning", () => {
    render(
      <HubLabel
        hub={{
          source: "address",
          address: "0x1111111111111111111111111111111111111111",
          label: "0x1111...1111",
        }}
      />,
    );

    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(screen.getByTestId("hub-hint")).toHaveTextContent(
      COPY.loans.hub.unknownHubWarning,
    );
  });

  it("renders the given text in place of the bare label", () => {
    render(
      <HubLabel
        hub={{
          source: "registry",
          address: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
          label: "Core Hub",
        }}
      >
        USDC on Core Hub
      </HubLabel>,
    );

    expect(screen.getByText("USDC on Core Hub")).toBeInTheDocument();
  });
});
