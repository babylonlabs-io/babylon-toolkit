import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { VaultCardShell } from "../VaultCardShell";

// The card body is the action surface: clicking (or pressing Enter/Space on)
// it opens the deposit multistepper, EXCEPT when the interaction lands on an
// inner control (Copy button / explorer link), which keeps its own behaviour.

const onClick = vi.fn();
const innerButtonClick = vi.fn();

function renderClickableShell() {
  render(
    <VaultCardShell testId="shell" onClick={onClick}>
      <button data-testid="copy" onClick={innerButtonClick}>
        Copy
      </button>
      {/* preventDefault keeps jsdom from logging "navigation not implemented"
          when the click test fires on this real anchor; the card-guard
          assertion (onClick not called) is unaffected. */}
      <a
        data-testid="explorer"
        href="https://example.com"
        onClick={(e) => e.preventDefault()}
      >
        View
      </a>
      <span data-testid="plain">0.05 BTC</span>
    </VaultCardShell>,
  );
}

describe("VaultCardShell — card-as-button routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the multistepper when the card body is clicked", () => {
    renderClickableShell();
    fireEvent.click(screen.getByTestId("plain"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not open the multistepper when an inner button is clicked", () => {
    renderClickableShell();
    fireEvent.click(screen.getByTestId("copy"));
    expect(innerButtonClick).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not open the multistepper when an inner link is clicked", () => {
    renderClickableShell();
    fireEvent.click(screen.getByTestId("explorer"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens the multistepper on Enter/Space over the card body", () => {
    renderClickableShell();
    const shell = screen.getByTestId("shell");
    fireEvent.keyDown(shell, { key: "Enter" });
    fireEvent.keyDown(shell, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not open the multistepper on Enter over an inner control", () => {
    renderClickableShell();
    fireEvent.keyDown(screen.getByTestId("copy"), { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes button semantics with an accessible label when clickable", () => {
    renderClickableShell();
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveAttribute("role", "button");
    expect(shell).toHaveAttribute(
      "aria-label",
      COPY.deposit.progress.openDetailsAria,
    );
    expect(shell).toHaveAttribute("tabindex", "0");
  });

  it("is not a button and not focusable when no onClick is wired", () => {
    render(
      <VaultCardShell testId="shell">
        <span>read-only</span>
      </VaultCardShell>,
    );
    const shell = screen.getByTestId("shell");
    expect(shell).not.toHaveAttribute("role");
    expect(shell).not.toHaveAttribute("tabindex");
  });

  it("is inert when disabled even with an onClick — but still shows the tooltip", () => {
    // Wallet-ownership mismatch: the card dims and explains itself, but must not
    // open the multistepper (that would auto-sign with the wrong wallet).
    render(
      <VaultCardShell
        testId="shell"
        disabled
        disabledTooltip="Switch to the owning wallet"
        onClick={onClick}
      >
        <span data-testid="plain">0.05 BTC</span>
      </VaultCardShell>,
    );
    const shell = screen.getByTestId("shell");

    fireEvent.click(screen.getByTestId("plain"));
    fireEvent.keyDown(shell, { key: "Enter" });
    fireEvent.keyDown(shell, { key: " " });
    expect(onClick).not.toHaveBeenCalled();

    expect(shell).not.toHaveAttribute("role");
    expect(shell).not.toHaveAttribute("tabindex");
    // Dim + tooltip still communicate why the card is inert.
    expect(shell).toHaveAttribute(
      "data-tooltip-content",
      "Switch to the owning wallet",
    );
  });
});
