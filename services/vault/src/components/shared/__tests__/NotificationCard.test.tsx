import { InfoIcon, PauseIcon } from "@babylonlabs-io/core-ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { NotificationCard } from "../NotificationCard";

describe("NotificationCard", () => {
  it("renders title, body, tone, and the tone default icon chip", () => {
    const { container } = render(
      <NotificationCard tone="urgent" title="Liquidation is 2.3% away">
        A drop to $86,360 triggers your first liquidation event.
      </NotificationCard>,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.tone).toBe("urgent");
    expect(screen.getByText("Liquidation is 2.3% away")).toBeInTheDocument();
    expect(
      screen.getByText(/triggers your first liquidation event/),
    ).toBeInTheDocument();
    // The icon chip is the aria-hidden accent square.
    expect(root.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("maps assertive tones to role=alert and the rest to role=status", () => {
    const { rerender } = render(<NotificationCard tone="urgent" title="x" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<NotificationCard tone="fully-paused" title="x" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<NotificationCard tone="dust" title="x" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hides the icon chip when icon is null", () => {
    const { container } = render(
      <NotificationCard tone="cliff" title="x" icon={null} />,
    );
    expect(
      (container.firstElementChild as HTMLElement).querySelector(
        '[aria-hidden="true"]',
      ),
    ).not.toBeInTheDocument();
  });

  it("fills primary actions with the tone accent and outlines secondary ones", () => {
    const onPrimary = vi.fn();
    render(
      <NotificationCard
        tone="urgent"
        title="x"
        actions={[
          { label: "Add Collateral", onClick: onPrimary, emphasis: "primary" },
          {
            label: "Repay Debt",
            onClick: vi.fn(),
            emphasis: "secondary",
            disabled: true,
          },
        ]}
      />,
    );

    const primary = screen.getByRole("button", { name: "Add Collateral" });
    const secondary = screen.getByRole("button", { name: "Repay Debt" });

    // Figma's critical card fills with error/dark (#C62828), not error/main.
    expect(primary.className).toContain("bg-error-dark");
    expect(primary.className).not.toContain("bg-error-main");
    // Outlined actions take stroke/primary (#5A5A5A), not the fainter stroke.
    expect(secondary.className).toContain("border-secondary-strokeDark");
    expect(secondary.className).not.toContain("border-secondary-strokeLight");
    expect(secondary.className).toContain("text-accent-primary");
    expect(secondary).toBeDisabled();

    fireEvent.click(primary);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("sizes the action button per tone", () => {
    const actions = [{ label: "Go", onClick: vi.fn() }];

    // Cliff's "Add sacrificial vault" is 40px tall with 16px text.
    const cliff = render(
      <NotificationCard
        tone="cliff"
        title="x"
        actions={actions}
        actionsPlacement="below"
      />,
    );
    const cliffButton = screen.getByRole("button", { name: "Go" });
    expect(cliffButton.className).toContain("h-10");
    expect(cliffButton.className).toContain("text-base");
    cliff.unmount();

    // Reorder's "Apply Optimal Order" is 36px tall with 24px side padding.
    render(
      <NotificationCard
        tone="reorder"
        title="x"
        actions={actions}
        actionsPlacement="below"
      />,
    );
    const reorderButton = screen.getByRole("button", { name: "Go" });
    expect(reorderButton.className).toContain("h-9");
    expect(reorderButton.className).toContain("px-6");
  });

  it("chips the info glyph for too-many and the pause glyph for soft-paused", () => {
    const chipOf = (tone: "too-many" | "soft-paused") => {
      const view = render(<NotificationCard tone={tone} title="x" />);
      const markup = (
        view.container.querySelector('[aria-hidden="true"]') as HTMLElement
      ).innerHTML;
      view.unmount();
      return markup;
    };
    const glyphOf = (node: React.ReactElement) => {
      const view = render(node);
      const markup = view.container.innerHTML;
      view.unmount();
      return markup;
    };

    expect(chipOf("too-many")).toBe(
      glyphOf(<InfoIcon size={24} color="text-accent-contrast" />),
    );
    expect(chipOf("soft-paused")).toBe(
      glyphOf(<PauseIcon size={24} color="text-accent-contrast" />),
    );
  });

  it("draws the dust tone in the deep navy accent, not near-black primary", () => {
    const { container } = render(<NotificationCard tone="dust" title="x" />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-accent-navy");
    expect(root.className).not.toContain("border-primary-main");
    expect(root.querySelector('[aria-hidden="true"]')?.className).toContain(
      "bg-accent-navy",
    );
  });

  it("puts every card on background/secondary except the urgent one", () => {
    const { container, rerender } = render(
      <NotificationCard tone="too-many" title="x" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-background-secondary");

    // The critical card alone sits on background/contrast + a 6% error wash.
    rerender(<NotificationCard tone="urgent" title="x" />);
    expect(root.className).toContain("bg-background-contrast");
    expect(root.className).toContain("from-error-dark/[0.06]");
  });

  it("tints the suggestion box with background/contrast and insets it per the caller", () => {
    const { rerender } = render(
      <NotificationCard
        tone="reorder"
        title="x"
        suggestion={<span>chips</span>}
      />,
    );
    const box = () => screen.getByText("chips").parentElement as HTMLElement;
    expect(box().className).toContain("bg-background-contrast");
    // Default is the 16px reorder inset.
    expect(box().className).toContain("p-4");

    rerender(
      <NotificationCard
        tone="cliff"
        title="x"
        suggestion={<span>chips</span>}
        suggestionPadding="compact"
      />,
    );
    expect(box().className).toContain("px-4");
    expect(box().className).toContain("py-2");
  });

  it("center-aligns a simple inline card and top-aligns when content stacks", () => {
    const actions = [{ label: "Go", onClick: vi.fn() }];

    const inline = render(
      <NotificationCard tone="urgent" title="x" actions={actions} />,
    );
    expect(
      (inline.container.firstElementChild as HTMLElement).className,
    ).toContain("items-center");
    inline.unmount();

    // A suggestion box forces top-alignment even with inline actions.
    const stacked = render(
      <NotificationCard
        tone="urgent"
        title="x"
        actions={actions}
        suggestion={<span>more</span>}
      />,
    );
    expect(
      (stacked.container.firstElementChild as HTMLElement).className,
    ).toContain("items-start");
  });

  it("renders a dismiss control wired to onClose with the shared copy label", () => {
    const onClose = vi.fn();
    render(<NotificationCard tone="dust" title="x" onClose={onClose} />);

    const dismiss = screen.getByRole("button", {
      name: COPY.common.dismissNotification,
    });
    fireEvent.click(dismiss);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
