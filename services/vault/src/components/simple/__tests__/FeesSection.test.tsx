import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeesSection, type FeeRow } from "../FeesSection";

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: false,
}));

vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
}));

const rows: FeeRow[] = [
  { label: "Min deposit", value: "0.0005 BTC" },
  { label: "Collateral Factor", value: "72%" },
];

beforeEach(() => {
  featureFlagsMock.isV3UiEnabled = false;
});

describe("FeesSection", () => {
  it("renders nothing when there are no rows", () => {
    const { container } = render(<FeesSection rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the v2 Protocol parameters title when the flag is off", () => {
    render(<FeesSection rows={rows} />);
    expect(screen.getByText("Protocol parameters")).toBeInTheDocument();
  });

  describe("v3 UI: accessible disclosure panel", () => {
    beforeEach(() => {
      featureFlagsMock.isV3UiEnabled = true;
    });

    it("uses the title-case Protocol Parameters title", () => {
      render(<FeesSection rows={rows} />);
      expect(screen.getByText("Protocol Parameters")).toBeInTheDocument();
    });

    it("collapses the panel by default with a valid, hidden controlled region", () => {
      render(<FeesSection rows={rows} />);

      const toggle = screen.getByRole("button", {
        name: /Protocol Parameters/,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      const controlledId = toggle.getAttribute("aria-controls");
      expect(controlledId).toBeTruthy();
      expect(
        document.getElementById(controlledId as string),
      ).toBeInTheDocument();

      expect(screen.getByText("Min deposit")).not.toBeVisible();
    });

    it("expands to reveal the rows and updates aria-expanded", () => {
      render(<FeesSection rows={rows} />);

      const toggle = screen.getByRole("button", {
        name: /Protocol Parameters/,
      });
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Min deposit")).toBeVisible();
      expect(screen.getByText("Collateral Factor")).toBeVisible();
    });

    it("keeps the collapsed panel out of the layout at zero height", () => {
      render(<FeesSection rows={rows} />);

      const toggle = screen.getByRole("button", {
        name: /Protocol Parameters/,
      });
      const panel = document.getElementById(
        toggle.getAttribute("aria-controls") as string,
      ) as HTMLElement;
      const details = panel.firstElementChild as HTMLElement;

      expect(details).toHaveStyle({ height: "0px", visibility: "hidden" });

      fireEvent.click(toggle);
      expect(details).toHaveStyle({ visibility: "visible" });
    });
  });
});
