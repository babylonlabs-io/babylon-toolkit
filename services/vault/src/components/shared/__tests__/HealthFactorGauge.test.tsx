import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthFactorGauge } from "../HealthFactorGauge";

describe("HealthFactorGauge", () => {
  it("renders nothing when status is no_debt", () => {
    const { container } = render(
      <HealthFactorGauge value={null} status="no_debt" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when value is null", () => {
    const { container } = render(
      <HealthFactorGauge value={null} status="safe" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the gauge with labels for a safe status", () => {
    render(<HealthFactorGauge value={2.5} status="safe" />);

    expect(screen.getByText("Liquidation Risk")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "2.5");
  });

  it("renders warning label for warning status", () => {
    render(<HealthFactorGauge value={1.2} status="warning" />);
    expect(screen.getByText("At Risk")).toBeInTheDocument();
  });

  it("renders danger label for danger status", () => {
    render(<HealthFactorGauge value={0.8} status="danger" />);
    expect(screen.getByText("Liquidatable")).toBeInTheDocument();
  });

  it("clamps indicator at 0% for value 0", () => {
    render(<HealthFactorGauge value={0} status="danger" />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
  });

  it("clamps indicator at 100% for value exceeding max", () => {
    render(<HealthFactorGauge value={5} status="safe" />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "5");
  });

  it("sets aria-valuemin and aria-valuemax correctly", () => {
    render(<HealthFactorGauge value={1.5} status="warning" />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "3");
  });
});
