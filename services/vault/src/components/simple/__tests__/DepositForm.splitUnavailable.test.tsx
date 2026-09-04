/**
 * The inline hint shown when a BTCVault split is not on offer.
 *
 * Two unrelated caps suppress the split: the per-position vault cap, and the
 * protocol's cap on HTLC outputs per transaction. They need different
 * explanations, and for a while they shared one — so a depositor holding 0 of
 * 10 vaults could be told "0 of 10 BTCVaults used" as the reason a split was
 * unavailable, which was simply untrue. These pin each reason to its own copy.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  DepositForm,
  type DepositAmountState,
  type DepositFeeState,
  type DepositGatingState,
  type DepositProviderState,
  type DepositWalletState,
} from "../DepositForm";

vi.mock("@/config", () => ({
  getNetworkConfigBTC: () => ({
    coinSymbol: "BTC",
    name: "Bitcoin",
    icon: "bitcoin.svg",
  }),
}));

vi.mock("@/services/deposit", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/deposit")>(
      "@/services/deposit",
    );
  return {
    ...actual,
    depositService: {
      ...actual.depositService,
      getDepositCtaState: () => ({ disabled: false, label: "Deposit" }),
    },
  };
});

vi.mock("../DepositFeesBreakdown", () => ({
  DepositFeesBreakdown: () => null,
}));
vi.mock("../VaultProviderSelectorV3", () => ({
  VaultProviderSelectorV3: () => null,
}));
vi.mock("@/components/shared", () => ({
  DepositButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const amountState: DepositAmountState = {
  amount: "",
  amountSats: 0n,
  btcBalance: 100_000_000n,
  unconfirmedBalance: 0n,
  hasUnconfirmedBalanceOnly: false,
  minDeposit: 10_000n,
  maxDeposit: 100_000_000n,
  maxDepositSats: 100_000_000n,
  effectiveRemaining: null,
  capUnavailable: false,
  suggestedAmountSats: null,
};

const feeState: DepositFeeState = {
  minPeginFee: 0n,
  minPeginFeeError: null,
  btcPrice: 60_000,
  hasPriceFetchError: false,
  estimatedFeeSats: 0n,
  estimatedFeeRate: 1,
  isLoadingFee: false,
  feeError: null,
  depositorClaimValue: 0n,
  commissionBaseValues: undefined,
  appVersionUnsupported: false,
  p2aAnchorValueSats: 0n,
  depositorClaimValueError: null,
  protocolFeeAmount: "--",
  protocolFeePrice: "",
  protocolFeeIsError: false,
  feeRows: [],
};

const providerState: DepositProviderState = {
  providers: [],
  isLoadingProviders: false,
  selectedProvider: "",
  onProviderSelect: vi.fn(),
};

const walletState: DepositWalletState = {
  isWalletConnected: true,
};

function renderForm(gatingOverrides: Partial<DepositGatingState>) {
  const gatingState: DepositGatingState = {
    isDepositDisabled: false,
    isGeoBlocked: false,
    isAddressBlocked: false,
    ...gatingOverrides,
  };
  render(
    <DepositForm
      amountState={amountState}
      feeState={feeState}
      providerState={providerState}
      walletState={walletState}
      gatingState={gatingState}
      collateralFactor={null}
      twoVaultSplit={undefined}
      onAmountChange={vi.fn()}
      onMaxClick={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
}

describe("DepositForm split-unavailable hint", () => {
  const PROTOCOL_HINT =
    COPY.deposit.maxVaultsReached.splitUnavailableProtocolLimit;

  it("shows no hint when a split is available", () => {
    renderForm({ splitUnavailableReason: null });
    expect(
      screen.queryByText(COPY.deposit.maxVaultsReached.splitUnavailable(9, 10)),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(PROTOCOL_HINT)).not.toBeInTheDocument();
  });

  it("quotes vault usage for the per-position cap", () => {
    renderForm({
      splitUnavailableReason: "per-position",
      vaultCapUsage: { used: 9, cap: 10 },
    });
    expect(
      screen.getByText(COPY.deposit.maxVaultsReached.splitUnavailable(9, 10)),
    ).toBeInTheDocument();
  });

  it("explains the protocol cap without quoting vault usage", () => {
    // The position can be empty when this fires, so any "N of M used" figure
    // would name a cause that is not the reason.
    renderForm({ splitUnavailableReason: "htlc-output-cap" });
    expect(screen.getByText(PROTOCOL_HINT)).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ BTCVaults used/)).not.toBeInTheDocument();
  });

  it("picks the hint from the reason, not from whether usage happens to be set", () => {
    // The reason is the discriminator. Keying off `vaultCapUsage` instead would
    // pass every other case here and still show the wrong explanation the
    // moment both are present — which is the bug this whole split exists for.
    renderForm({
      splitUnavailableReason: "htlc-output-cap",
      vaultCapUsage: { used: 9, cap: 10 },
    });
    expect(screen.getByText(PROTOCOL_HINT)).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.maxVaultsReached.splitUnavailable(9, 10)),
    ).not.toBeInTheDocument();
  });

  it("still shows the protocol-cap hint when the per-position cap is unknown", () => {
    // `vaultCapUsage` is undefined here. Gating the hint on it — as the
    // per-position-only version did — made the split vanish with no
    // explanation at all.
    renderForm({
      splitUnavailableReason: "htlc-output-cap",
      vaultCapUsage: undefined,
    });
    expect(screen.getByText(PROTOCOL_HINT)).toBeInTheDocument();
  });
});
