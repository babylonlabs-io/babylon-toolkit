import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

// The `@/components/shared` barrel drags in deps vitest can't transform; stub
// the only export this component uses so the test stays focused on the item.
vi.mock("@/components/shared", () => ({
  ExplorerLink: () => null,
}));

import { CollateralVaultItem } from "../CollateralVaultItem";

const VAULT_ID = "0x" + "a".repeat(64);

const baseProps = {
  vaultId: VAULT_ID,
  amountBtc: 1,
  providerName: "Provider X",
  providerAddress: "0x" + "b".repeat(40),
  selected: false,
  selectable: false,
  onToggleSelect: vi.fn(),
};

describe("CollateralVaultItem", () => {
  it("shows the activating status with a disabled checkbox and no actions", () => {
    render(
      <CollateralVaultItem
        {...baseProps}
        inUse={false}
        isActivating
        onArtifactDownload={vi.fn()}
      />,
    );

    expect(screen.getByText(COPY.collateral.activating)).toBeInTheDocument();
    // The indexed status badge is replaced by the activating indicator.
    expect(
      screen.queryByText(COPY.pegin.labels.IN_USE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.pegin.labels.AVAILABLE),
    ).not.toBeInTheDocument();
    // Indexed-metadata actions are suppressed.
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /download artifacts/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Liquidation Order")).not.toBeInTheDocument();
    // Provider row is suppressed while activating (indexed metadata may be
    // incomplete on the transient row).
    expect(screen.queryByText("Vault provider")).not.toBeInTheDocument();
  });

  it("shows the normal status badge and provider row when not activating", () => {
    render(<CollateralVaultItem {...baseProps} inUse={true} selectable />);

    expect(screen.getByText(COPY.pegin.labels.IN_USE)).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.collateral.activating),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Vault provider")).toBeInTheDocument();
  });
});
