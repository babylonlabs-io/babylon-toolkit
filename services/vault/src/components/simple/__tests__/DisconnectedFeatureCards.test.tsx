import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeatureCard } from "../DisconnectedFeatureCards/FeatureCard";

describe("FeatureCard", () => {
  it("renders a static card with no chevron and the extra content always visible", () => {
    render(
      <FeatureCard
        icon={<svg />}
        title="Competitive borrowing rates"
        body="Access to Aave V4 liquidity."
        extra={<span>APR row</span>}
      />,
    );

    // Static cards are not buttons and have no expand affordance.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Access to Aave V4 liquidity.")).not.toHaveClass(
      "line-clamp-1",
    );
    expect(screen.getByText("APR row")).toBeInTheDocument();
  });

  it("truncates the body when an expandable card is collapsed", () => {
    render(
      <FeatureCard
        icon={<svg />}
        title="Self-custodial and native"
        body="No bridging. No wrapping. No pooled custody."
        expandable
        expanded={false}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.getByText("No bridging. No wrapping. No pooled custody."),
    ).toHaveClass("line-clamp-1");
  });

  it("shows the body in full when an expandable card is expanded", () => {
    render(
      <FeatureCard
        icon={<svg />}
        title="Self-custodial and native"
        body="No bridging. No wrapping. No pooled custody."
        expandable
        expanded={true}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("No bridging. No wrapping. No pooled custody."),
    ).not.toHaveClass("line-clamp-1");
  });

  it("calls onToggle when an expandable card header is clicked", () => {
    const onToggle = vi.fn();
    render(
      <FeatureCard
        icon={<svg />}
        title="Self-custodial and native"
        body="No bridging. No wrapping. No pooled custody."
        expandable
        expanded={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
