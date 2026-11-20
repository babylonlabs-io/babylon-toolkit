import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VaultsActiveSection } from "@/components/vaults/VaultsActiveSection";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { saveArtifactDownloadReceipt } from "@/utils/artifactDownloadStorage";

const activeVault: CollateralVaultEntry = {
  id: "vault-1",
  lifecycle: "active",
  vaultId: "0xvault1",
  amountBtc: 1,
  amountSats: 100_000_000n,
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
        onDownloadArtifacts={vi.fn()}
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
        onDownloadArtifacts={vi.fn()}
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

  it("shows the peg-out status and no withdraw action while a vault is withdrawing", () => {
    render(
      <VaultsActiveSection
        vaults={[{ ...activeVault, lifecycle: "withdrawing" }]}
        onWithdraw={vi.fn()}
        onDownloadArtifacts={vi.fn()}
        isWithdrawDisabled={false}
      />,
    );

    expect(
      screen.getByText(COPY.pegin.labels.REDEEM_IN_PROGRESS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.pegin.labels.IN_USE),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("vault-withdraw-button")).toBeDisabled();
  });

  it("reads Total collateral (1) in the heading for a single active vault", () => {
    render(
      <VaultsActiveSection
        vaults={[activeVault]}
        onWithdraw={vi.fn()}
        onDownloadArtifacts={vi.fn()}
        isWithdrawDisabled={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Total collateral (1)" }),
    ).toBeInTheDocument();
  });

  it("counts every rendered row in the Total collateral heading, withdrawing included", () => {
    render(
      <VaultsActiveSection
        vaults={[
          activeVault,
          { ...activeVault, id: "vault-withdrawing", lifecycle: "withdrawing" },
        ]}
        onWithdraw={vi.fn()}
        onDownloadArtifacts={vi.fn()}
        isWithdrawDisabled={false}
      />,
    );

    expect(screen.getByText(COPY.vaults.sections.count(2))).toBeInTheDocument();
  });

  it("renders nothing when there is no vault and no empty state to show", () => {
    const { container } = render(
      <VaultsActiveSection
        vaults={[]}
        onWithdraw={vi.fn()}
        onDownloadArtifacts={vi.fn()}
        isWithdrawDisabled={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the download on a row whose artifacts are saved, as Download again", () => {
    const vaultId = `0x${"aa".repeat(32)}`;
    const peginTxid = "bb".repeat(32);
    saveArtifactDownloadReceipt(vaultId, {
      version: 1,
      peginTxid,
      filename: "artifacts.json",
      byteLength: 1,
      sha256: "cc".repeat(32),
      savedAt: 1,
      method: "browser-download",
    });
    const onDownloadArtifacts = vi.fn();

    render(
      <VaultsActiveSection
        vaults={[
          {
            ...activeVault,
            vaultId,
            peginTxHash: `0x${peginTxid}`,
            depositorBtcPubkey: "dd".repeat(32),
            unsignedPrePeginTx: "0200",
          },
        ]}
        ethAddress="0x1111111111111111111111111111111111111111"
        onWithdraw={vi.fn()}
        onDownloadArtifacts={onDownloadArtifacts}
        isWithdrawDisabled={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.vaults.actions.downloadArtifactsAgain,
      }),
    );

    expect(onDownloadArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ vaultId }),
    );
    window.localStorage.clear();
  });
});
