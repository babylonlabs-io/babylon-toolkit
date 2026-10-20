import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { VaultReturnedView } from "../VaultReturnedView";

describe("VaultReturnedView", () => {
  const body = COPY.deposit.vaultReturnedSuccess.full.body;

  it("renders the cap_exceeded sentence after the body", () => {
    const { getByText } = render(
      <VaultReturnedView
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
        variant="full"
        reason={null}
        onGoToDashboard={vi.fn()}
      />,
    );

    expect(getByText(body).nextElementSibling).toBeNull();
  });
});
