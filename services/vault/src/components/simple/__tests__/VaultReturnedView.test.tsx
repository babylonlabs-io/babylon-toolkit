import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { VaultReturnedView } from "../VaultReturnedView";

describe("VaultReturnedView", () => {
  const body = COPY.deposit.vaultReturnedSuccess.full.body;

  it("renders the cap_exceeded sentence after the body", () => {
    const { getByText } = render(
      <VaultReturnedView
        outcome="returned"
        variant="full"
        reason={{ kind: "cap_exceeded" }}
        onGoToDashboard={vi.fn()}
      />,
    );

    const bodyText = getByText(body);
    const reasonText = getByText(COPY.vaults.redeemReason.capExceeded);
    expect(
      bodyText.compareDocumentPosition(reasonText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no extra sentence for an unknown reason", () => {
    const { getByText } = render(
      <VaultReturnedView
        outcome="returned"
        variant="full"
        reason={{ kind: "unknown" }}
        onGoToDashboard={vi.fn()}
      />,
    );

    expect(getByText(body).nextElementSibling).toBeNull();
  });

  it("renders no extra sentence when there is no reason", () => {
    const { getByText } = render(
      <VaultReturnedView
        outcome="returned"
        variant="full"
        reason={null}
        onGoToDashboard={vi.fn()}
      />,
    );

    expect(getByText(body).nextElementSibling).toBeNull();
  });

  it("words the screen as the depositor's own withdrawal for a withdrawn outcome", () => {
    const { getByText, queryByText } = render(
      <VaultReturnedView
        outcome="withdrawn"
        variant="partial"
        onGoToDashboard={vi.fn()}
      />,
    );

    expect(
      getByText(COPY.deposit.vaultWithdrawnSuccess.partial.heading),
    ).toBeInTheDocument();
    expect(
      getByText(COPY.deposit.vaultWithdrawnSuccess.partial.body),
    ).toBeInTheDocument();
    expect(
      queryByText(COPY.deposit.vaultReturnedSuccess.partial.body),
    ).not.toBeInTheDocument();
  });
});
