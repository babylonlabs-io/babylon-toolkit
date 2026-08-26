import { render, screen } from "@testing-library/react";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { DepositWarning } from "@/hooks/deposit/depositWarnings";
import { ContractStatus, getPeginState } from "@/models/peginStateMachine";

import { ContinuationWarnings } from "../ContinuationWarnings";

const { mockGetPollingResult } = vi.hoisted(() => ({
  mockGetPollingResult: vi.fn(),
}));
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ getPollingResult: mockGetPollingResult }),
}));

const VAULT_ID = "0xvault1" as Hex;

const WOTS_WARNING: DepositWarning = {
  vaultId: VAULT_ID,
  stage: "wots",
  terminal: false,
  message: "Vault 1: WOTS key submission skipped",
};

describe("ContinuationWarnings", () => {
  it("shows a non-terminal warning while its vault still owes the step", () => {
    mockGetPollingResult.mockReturnValue({
      peginState: getPeginState(ContractStatus.PENDING, { needsWotsKey: true }),
    });
    render(<ContinuationWarnings warnings={[WOTS_WARNING]} />);
    expect(screen.getByText(WOTS_WARNING.message)).toBeInTheDocument();
  });

  it("keeps the warning while the VP poll is still loading (empty actions)", () => {
    // Regression: the loading window returns a defined state with no actions —
    // that must NOT be read as "advanced past WOTS".
    mockGetPollingResult.mockReturnValue({
      peginState: getPeginState(ContractStatus.PENDING, {}),
    });
    render(<ContinuationWarnings warnings={[WOTS_WARNING]} />);
    expect(screen.getByText(WOTS_WARNING.message)).toBeInTheDocument();
  });

  it("hides the warning once its vault advanced past the warned stage", () => {
    mockGetPollingResult.mockReturnValue({
      peginState: getPeginState(ContractStatus.PENDING, {
        transactionsReady: true,
      }),
    });
    render(<ContinuationWarnings warnings={[WOTS_WARNING]} />);
    expect(screen.queryByText(WOTS_WARNING.message)).not.toBeInTheDocument();
  });

  it("always shows a terminal warning regardless of live state", () => {
    mockGetPollingResult.mockReturnValue({
      peginState: getPeginState(ContractStatus.VERIFIED, {}),
    });
    const terminal: DepositWarning = {
      ...WOTS_WARNING,
      terminal: true,
      message: "Vault 1: cannot continue",
    };
    render(<ContinuationWarnings warnings={[terminal]} />);
    expect(screen.getByText(terminal.message)).toBeInTheDocument();
  });

  it("resolves each warning against its OWN vault's live state", () => {
    const resolvedWots: DepositWarning = {
      vaultId: "0xvaultA" as Hex,
      stage: "wots",
      terminal: false,
      message: "Vault A: WOTS skipped",
    };
    const owedPayout: DepositWarning = {
      vaultId: "0xvaultB" as Hex,
      stage: "payout",
      terminal: false,
      message: "Vault B: payout signing failed",
    };
    const terminalWarning: DepositWarning = {
      vaultId: "0xvaultC" as Hex,
      stage: "wots",
      terminal: true,
      message: "Vault C: cannot continue",
    };
    // Per-vault routing: A is fully advanced (resolves), B still owes payout
    // signing (kept), C is terminal (always shown). The states differ per vault,
    // so a wrong-vault lookup would flip B's assertion.
    mockGetPollingResult.mockImplementation((id: string) => {
      if (id === resolvedWots.vaultId) {
        return { peginState: getPeginState(ContractStatus.VERIFIED, {}) };
      }
      if (id === owedPayout.vaultId) {
        return {
          peginState: getPeginState(ContractStatus.PENDING, {
            transactionsReady: true,
          }),
        };
      }
      return undefined;
    });

    render(
      <ContinuationWarnings
        warnings={[resolvedWots, owedPayout, terminalWarning]}
      />,
    );

    expect(screen.queryByText(resolvedWots.message)).not.toBeInTheDocument();
    expect(screen.getByText(owedPayout.message)).toBeInTheDocument();
    expect(screen.getByText(terminalWarning.message)).toBeInTheDocument();
  });

  it("always shows a global persistence warning with no live state", () => {
    mockGetPollingResult.mockReturnValue(undefined);
    const persistence: DepositWarning = {
      stage: "persistence",
      terminal: true,
      message: "Could not save a local copy of this deposit",
    };
    render(<ContinuationWarnings warnings={[persistence]} />);
    expect(screen.getByText(persistence.message)).toBeInTheDocument();
  });
});
