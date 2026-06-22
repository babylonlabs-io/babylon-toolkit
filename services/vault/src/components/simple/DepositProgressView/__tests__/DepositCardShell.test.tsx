import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { DepositCardShell } from "../DepositCardShell";

describe("DepositCardShell", () => {
  it("renders the shared heading, estimate, and explanation across states", () => {
    render(
      <DepositCardShell footer={<button type="button">cta</button>}>
        <div>body</div>
      </DepositCardShell>,
    );

    expect(screen.getByText(COPY.deposit.progress.heading)).toBeTruthy();
    expect(
      screen.getByText(`(${COPY.deposit.progress.summary.estimate})`),
    ).toBeTruthy();
    expect(
      screen.getByText(COPY.deposit.progress.summary.description),
    ).toBeTruthy();
  });

  it("renders the body and footer slots", () => {
    render(
      <DepositCardShell footer={<div data-testid="footer">footer</div>}>
        <div data-testid="body">body</div>
      </DepositCardShell>,
    );

    expect(screen.getByTestId("body")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("omits the progress bar and footnote when not provided (summary state)", () => {
    render(
      <DepositCardShell footer={<button type="button">cta</button>}>
        <div>body</div>
      </DepositCardShell>,
    );

    expect(screen.queryByTestId("progress-bar")).toBeNull();
    expect(screen.queryByTestId("footnote")).toBeNull();
  });

  it("renders the progress bar and footnote when provided (in-flight state)", () => {
    render(
      <DepositCardShell
        footer={<button type="button">cta</button>}
        progressBar={<div data-testid="progress-bar" />}
        footnote={<div data-testid="footnote" />}
      >
        <div>body</div>
      </DepositCardShell>,
    );

    expect(screen.getByTestId("progress-bar")).toBeTruthy();
    expect(screen.getByTestId("footnote")).toBeTruthy();
  });
});
