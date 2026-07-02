/**
 * Contract tests for the core-ui Callout, exercised from the vault suite
 * (core-ui has no test runner of its own). These pin the behaviours
 * DepositProgressView relies on: the error variant is an assertive `alert`,
 * other variants are polite `status`, each variant paints its own icon-box
 * background, and every variant ships a default icon.
 */

import { Callout } from "@babylonlabs-io/core-ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      ["infoStrong", "bg-info-dark"],
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
    for (const variant of [
      "error",
      "warning",
      "success",
      "info",
      "infoStrong",
    ] as const) {
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

  it("renders no action buttons when no actions are supplied", () => {
    const { container } = render(<Callout variant="info">body</Callout>);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders an action button per supplied action and fires its onClick", () => {
    const onEnable = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Callout
        variant="info"
        actions={[
          { label: "Enable", emphasis: "primary", onClick: onEnable },
          { label: "No thanks", emphasis: "secondary", onClick: onDismiss },
        ]}
      >
        body
      </Callout>,
    );

    fireEvent.click(screen.getByText("Enable"));
    fireEvent.click(screen.getByText("No thanks"));

    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
