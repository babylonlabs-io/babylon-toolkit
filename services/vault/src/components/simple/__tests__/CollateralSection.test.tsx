import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

// Capture the `vaults` prop handed to the reorder modal so we can assert the
// optimistic "activating" row never enters the reorder path (gas estimate +
// executeReorder inputs), only the display list.
let reorderModalVaults: CollateralVaultEntry[] | null = null;
vi.mock("../ReorderVaults", () => ({
  ReorderVaultsModal: (props: { vaults: CollateralVaultEntry[] }) => {
    reorderModalVaults = props.vaults;
    return null;
  },
  ReorderSuccessModal: () => null,
}));

// Capture the `vaults` prop handed to the expanded list — the activating row
// SHOULD still be displayed there.
let expandedVaults: CollateralVaultEntry[] | null = null;
vi.mock("../CollateralExpandedContent", () => ({
  CollateralExpandedContent: (props: { vaults: CollateralVaultEntry[] }) => {
    expandedVaults = props.vaults;
    return null;
  },
}));

vi.mock("@/components/deposit/ArtifactDownloadModal", () => ({
  ArtifactDownloadModal: () => null,
}));

vi.mock("@/components/shared", () => ({
  DepositButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  ExpandMenuButton: ({ onToggle }: { onToggle: () => void }) => (
    <button data-testid="expand-toggle" onClick={onToggle}>
      expand
    </button>
  ),
  ExpandablePanel: ({
    expanded,
    children,
  }: {
    expanded: boolean;
    children: React.ReactNode;
  }) => (expanded ? <>{children}</> : null),
}));

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({ icon: "/btc.svg", coinSymbol: "sBTC" }),
  FeatureFlags: { isDepositDisabled: false },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xabc" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => ({ findProvider: () => undefined }),
}));

vi.mock("@/applications/aave/utils", () => ({
  canWithdrawAnyVault: () => false,
  computeProjectedHealthFactor: () => null,
  getEffectiveVaultSelection: () => ({
    selectedVaultIds: [],
    selectedVaults: [],
  }),
  getWithdrawHfWarningState: () => ({ wouldBreachHF: false }),
  isVaultIndividuallyWithdrawable: () => false,
}));

vi.mock("@/applications/aave/constants", () => ({
  WITHDRAW_HF_BLOCK_THRESHOLD: 1.1,
}));

import { CollateralSection } from "../CollateralSection";

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
const VAULT_C = ("0x" + "c".repeat(64)) as `0x${string}`;

function entry(
  vaultId: `0x${string}`,
  overrides: Partial<CollateralVaultEntry> = {},
): CollateralVaultEntry {
  return {
    id: `entry-${vaultId}`,
    vaultId,
    amountBtc: 1,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "VP",
    liquidationIndex: 0,
    ...overrides,
  };
}

function renderSection(collateralVaults: CollateralVaultEntry[]) {
  return render(
    <CollateralSection
      totalAmountBtc="3 sBTC"
      collateralVaults={collateralVaults}
      hasCollateral
      isConnected
      collateralBtc={2}
      currentHealthFactor={null}
      selectedVaultIds={[]}
      onSelectedVaultIdsChange={vi.fn()}
      onWithdraw={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
}

describe("CollateralSection reorder input", () => {
  beforeEach(() => {
    reorderModalVaults = null;
    expandedVaults = null;
  });

  it("excludes optimistic activating vaults from the reorder modal data", () => {
    renderSection([
      entry(VAULT_A, { liquidationIndex: 0 }),
      entry(VAULT_B, { liquidationIndex: 1 }),
      entry(VAULT_C, {
        inUse: false,
        isActivating: true,
        liquidationIndex: Number.MAX_SAFE_INTEGER,
      }),
    ]);

    // The reorder modal only sees indexer-confirmed vaults.
    expect(reorderModalVaults?.map((v) => v.vaultId)).toEqual([
      VAULT_A,
      VAULT_B,
    ]);
  });

  it("still displays the activating vault in the expanded collateral list", () => {
    renderSection([
      entry(VAULT_A, { liquidationIndex: 0 }),
      entry(VAULT_B, { liquidationIndex: 1 }),
      entry(VAULT_C, { inUse: false, isActivating: true }),
    ]);

    // Expand to mount the list.
    fireEvent.click(screen.getByTestId("expand-toggle"));

    expect(expandedVaults?.map((v) => v.vaultId)).toEqual([
      VAULT_A,
      VAULT_B,
      VAULT_C,
    ]);
  });
});
