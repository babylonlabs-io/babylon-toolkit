/**
 * Contract tests for the core-ui Callout, exercised from the vault suite
 * (core-ui has no test runner of its own). These pin the behaviours
 * DepositProgressView relies on: the error variant is an assertive `alert`,
 * other variants are polite `status`, each variant paints its own icon-box
 * background, and every variant ships a default icon.
 */

import { Callout } from "@babylonlabs-io/core-ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Callout", () => {
  it("renders the error variant as an alert (assertive announcement)", () => {
    render(
      <Callout variant="error" title="Transaction failed">
        Add more ETH
      </Callout>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders non-error variants as a polite status", () => {
    const { rerender } = render(<Callout variant="success">Done</Callout>);
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<Callout variant="warning">Careful</Callout>);
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<Callout variant="info">Heads up</Callout>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("lets callers override the role via native div attributes", () => {
    render(
      <Callout variant="error" role="status">
        Quiet error
      </Callout>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the title and body", () => {
    render(
      <Callout variant="error" title="Transaction failed">
        Your wallet doesn&rsquo;t have enough ETH
      </Callout>,
    );
    expect(screen.getByText("Transaction failed")).toBeInTheDocument();
    expect(screen.getByText(/doesn.t have enough ETH/)).toBeInTheDocument();
  });

  it("paints the per-variant icon-box background", () => {
    const cases: Array<[Parameters<typeof Callout>[0]["variant"], string]> = [
      ["error", "bg-error-main"],
      ["warning", "bg-warning-main"],
      ["success", "bg-success-main"],
      ["info", "bg-info-main"],
    ];
    for (const [variant, bgClass] of cases) {
      const { container, unmount } = render(
        <Callout variant={variant}>body</Callout>,
      );
      expect(container.querySelector(`.${bgClass}`)).not.toBeNull();
      unmount();
    }
  });

  it("ships a default icon inside the icon box for each variant", () => {
    for (const variant of ["error", "warning", "success", "info"] as const) {
      const { container, unmount } = render(
        <Callout variant={variant}>body</Callout>,
      );
      // The icon box is the only square with a variant background; it should
      // contain the default SVG icon.
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("renders a caller-supplied icon instead of the default", () => {
    render(
      <Callout variant="error" icon={<span data-testid="custom-icon" />}>
        body
      </Callout>,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
