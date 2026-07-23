import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VaultsActiveSection } from "@/components/vaults/VaultsActiveSection";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";

const activeVault: CollateralVaultEntry = {
  id: "vault-1",
  vaultId: "0xvault1",
  amountBtc: 1,
  addedAt: 1_700_000_000,
  liquidationIndex: 0,
  inUse: true,
  providerAddress: "0x2222222222222222222222222222222222222222",
  providerName: "Atlas Custody",
  peginTxHash: "a1b2c3",
};

describe("VaultsActiveSection", () => {
  it("shows the empty state under a Vaults heading while no vault is active", () => {
    render(
      <VaultsActiveSection
        vaults={[]}
        onWithdraw={vi.fn()}
        isWithdrawDisabled={false}
        emptyState={<div data-testid="vaults-empty-state" />}
      />,
    );

    expect(
      screen.getByText(COPY.vaults.sections.vaultsTitle),
    ).toBeInTheDocument();
    expect(screen.getByTestId("vaults-empty-state")).toBeInTheDocument();
  });

  it("renders the vault rows instead of the empty state once a vault is active", () => {
    render(
      <VaultsActiveSection
        vaults={[activeVault]}
        onWithdraw={vi.fn()}
        isWithdrawDisabled={false}
        emptyState={<div data-testid="vaults-empty-state" />}
      />,
    );

    expect(screen.queryByTestId("vaults-empty-state")).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.vaults.sections.activeVaultsTitle, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.pegin.labels.IN_USE)).toBeInTheDocument();
  });

  it("renders nothing when there is no vault and no empty state to show", () => {
    const { container } = render(
      <VaultsActiveSection
        vaults={[]}
        onWithdraw={vi.fn()}
        isWithdrawDisabled={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
