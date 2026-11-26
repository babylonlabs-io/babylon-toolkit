/**
 * Tests for ReorderVaultsModal — the dialog stays mounted while closed, so it
 * drops its last failure on close: a failed reorder must not greet the next
 * open (#2827), while a failure that settles after the close must still show
 * on it (#2706).
 *
 * The real useReorderModal and useReorderVaults run; only the chain reads,
 * the wallet and the transaction send are mocked.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { UserRejectedRequestError, type Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/applications/aave/context", () => ({
  useReorderOverride: () => ({ applyReorderedOrder: vi.fn() }),
}));

vi.mock("../useReorderGasEstimate", () => ({
  useReorderGasEstimate: () => ({
    feeEth: "< 0.000001 ETH",
    feeUsd: "",
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/clients/eth-contract/transactionInFlight", () => ({
  assertNoTransactionInFlight: () => Promise.resolve(),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      getTransaction: () => Promise.reject(new Error("not found")),
    }),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({
    address: "0x000000000000000000000000000000000000beef",
  }),
}));

vi.mock("@/clients/eth-contract/walletChain", () => ({
  getWalletClientOnExpectedChain: () =>
    Promise.resolve({
      account: { address: "0x000000000000000000000000000000000000beef" },
      chain: { id: 11155111 },
    }),
}));

vi.mock("@/components/shared/protocolStatus", () => ({
  isReorderBlocked: () => false,
}));

vi.mock("@/applications/aave/config", () => ({
  getAaveAdapterAddress: () => "0xaaaa000000000000000000000000000000000ada",
}));

const VAULT_A_ID =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B_ID =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;

const mockReorderVaultOrder = vi.fn();
vi.mock("@/applications/aave/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/applications/aave/services")>()),
  assertReorderMembership: () => Promise.resolve([VAULT_A_ID, VAULT_B_ID]),
  assertReorderBaseline: () => undefined,
  assertCollateralAmountsMatchOnChain: () => Promise.resolve(),
  reorderVaultOrder: (...args: unknown[]) => mockReorderVaultOrder(...args),
}));

import type { CollateralVaultEntry } from "@/types/collateral";

import { ReorderVaultsModal } from "../ReorderVaultsModal";

function makeVault(
  id: string,
  vaultId: Hex,
  liquidationIndex: number,
): CollateralVaultEntry {
  return {
    id,
    lifecycle: "active",
    vaultId,
    amountBtc: 0.5,
    amountSats: 50_000_000n,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "Test VP",
    liquidationIndex,
  };
}

const VAULTS = [makeVault("a", VAULT_A_ID, 0), makeVault("b", VAULT_B_ID, 1)];

function renderModal(isOpen: boolean) {
  return (
    <ReorderVaultsModal
      isOpen={isOpen}
      onClose={vi.fn()}
      vaults={VAULTS}
      onSuccess={vi.fn()}
    />
  );
}

/** Move the second vault up and Confirm; the wallet rejects the prompt. */
async function confirmAndReject() {
  mockReorderVaultOrder.mockRejectedValueOnce(
    new UserRejectedRequestError(new Error("User rejected the request.")),
  );
  fireEvent.click(screen.getByRole("button", { name: "Move 2nd BTCVault up" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  });
  expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
}

describe("ReorderVaultsModal — the last failure is dropped when the modal closes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no scrollIntoView; a moved row scrolls its focused arrow into view.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("does not show the previous attempt's failure after the modal is closed and reopened", async () => {
    const { rerender } = render(renderModal(true));
    await confirmAndReject();

    rerender(renderModal(false));
    rerender(renderModal(true));

    expect(screen.getByText("Reorder Vaults")).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
  });

  // Pins clearing on close, not on open. The dialog cannot close while the
  // wallet prompt is open; the reachable case is a write left waiting for
  // confirmation, the dialog closed, then a revert or replacement. Driving the
  // receipt wait that long is impractical here, so a rejection after an early
  // close stands in for it: both set the failure after the close.
  it("keeps a failure set after the modal closed for the next open", async () => {
    let rejectSend: (reason: Error) => void = () => {};
    mockReorderVaultOrder.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSend = reject;
      }),
    );
    const { rerender } = render(renderModal(true));
    fireEvent.click(
      screen.getByRole("button", { name: "Move 2nd BTCVault up" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(mockReorderVaultOrder).toHaveBeenCalled());

    rerender(renderModal(false));
    await act(async () => {
      rejectSend(
        new UserRejectedRequestError(new Error("User rejected the request.")),
      );
    });
    rerender(renderModal(true));

    expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
  });
});
