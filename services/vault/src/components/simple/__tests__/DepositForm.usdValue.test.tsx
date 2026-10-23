/**
 * The USD value shown under the deposit amount. It is priced from the BTC
 * oracle only while that price is usable; a stale or failed round must not
 * produce a USD figure.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  amount: "1",
  amountSats: 100_000_000n,
  btcBalance: 200_000_000n,
  unconfirmedBalance: 0n,
  minDeposit: 10_000n,
  maxDeposit: 200_000_000n,
  maxDepositSats: 200_000_000n,
  effectiveRemaining: null,
  capUnavailable: false,
  suggestedAmountSats: null,
};

const feeState: DepositFeeState = {
  minPeginFee: 0n,
  minPeginFeeError: null,
  btcPriceUsd: 60_000,
  estimatedFeeSats: 0n,
  estimatedFeeRate: 1,
  isLoadingFee: false,
  feeError: null,
  depositorClaimValue: 0n,
  commissionBaseValues: undefined,
  appVersionUnsupported: false,
  p2aAnchorValueSats: 0n,
  depositorClaimValueError: null,
  protocolFeeWei: 0n,
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

const gatingState: DepositGatingState = {
  isDepositDisabled: false,
  isGeoBlocked: false,
  isAddressBlocked: false,
  isAddressScreeningUnavailable: false,
};

function renderForm(btcPriceUsd: number | null) {
  render(
    <DepositForm
      amountState={amountState}
      feeState={{ ...feeState, btcPriceUsd }}
      providerState={providerState}
      walletState={walletState}
      gatingState={gatingState}
      collateralFactor={null}
      twoVaultSplit={undefined}
      maxFundingInputCount={20}
      onAmountChange={vi.fn()}
      onMaxClick={vi.fn()}
      onDeposit={vi.fn()}
    />,
  );
}

describe("DepositForm amount USD value", () => {
  it("shows the amount in USD when a usable BTC price is supplied", () => {
    renderForm(60_000);

    expect(screen.getByText("$60,000.00 USD")).toBeInTheDocument();
  });

  it("shows no USD value for the amount when no usable BTC price is available", () => {
    renderForm(null);

    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });
});
