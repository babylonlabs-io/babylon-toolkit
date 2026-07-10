import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { DepositCardShell } from "../DepositCardShell";

const protocolParamsMock = vi.hoisted(() => ({
  minPrepeginDepth: 6,
  depthByVersion: {} as Record<number, number>,
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({
    config: {
      offchainParams: { minPrepeginDepth: protocolParamsMock.minPrepeginDepth },
    },
    getOffchainParamsByVersion: (version: number) =>
      version in protocolParamsMock.depthByVersion
        ? { minPrepeginDepth: protocolParamsMock.depthByVersion[version] }
        : undefined,
  }),
}));

describe("DepositCardShell", () => {
  beforeEach(() => {
    protocolParamsMock.minPrepeginDepth = 6;
    protocolParamsMock.depthByVersion = {};
  });

  it("renders the shared heading, estimate, and explanation across states", () => {
    render(
      <DepositCardShell footer={<button type="button">cta</button>}>
        <div>body</div>
      </DepositCardShell>,
    );

    expect(screen.getByText(COPY.deposit.progress.heading)).toBeTruthy();
    // depth 6 × 10 min + 10 min pipeline overhead = 70 min
    expect(screen.getByText("(~70 min)")).toBeTruthy();
    expect(
      screen.getByText(COPY.deposit.progress.summary.description),
    ).toBeTruthy();
  });

  it("derives an hours estimate on high-depth networks (testnet, depth 12)", () => {
    protocolParamsMock.minPrepeginDepth = 12;
    render(
      <DepositCardShell footer={<button type="button">cta</button>}>
        <div>body</div>
      </DepositCardShell>,
    );

    // depth 12 × 10 min + 10 min overhead = 130 min → rounded to hours
    expect(screen.getByText("(~2 h)")).toBeTruthy();
  });

  it("shows a minutes estimate on low-depth networks (devnet, depth 2)", () => {
    protocolParamsMock.minPrepeginDepth = 2;
    render(
      <DepositCardShell footer={<button type="button">cta</button>}>
        <div>body</div>
      </DepositCardShell>,
    );

    // depth 2 × 10 min + 10 min overhead = 30 min
    expect(screen.getByText("(~30 min)")).toBeTruthy();
  });

  it("uses the deposit's pinned params version over the latest depth", () => {
    protocolParamsMock.minPrepeginDepth = 12; // latest — would read "~2 h"
    protocolParamsMock.depthByVersion = { 3: 6 }; // version the deposit registered
    render(
      <DepositCardShell
        footer={<button type="button">cta</button>}
        offchainParamsVersion={3}
      >
        <div>body</div>
      </DepositCardShell>,
    );

    // pinned depth 6 × 10 min + 10 min overhead = 70 min
    expect(screen.getByText("(~70 min)")).toBeTruthy();
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
