/**
 * The CTA gate for the on-chain funding-input bound.
 *
 * Both blocked states fail closed: a Pre-PegIn built against no bound, or
 * against a bound that could not be read, is one the registry rejects after
 * the depositor has already signed. A regression here would not produce an
 * over-limit transaction — `useDepositFlow` still aborts — it would let a
 * depositor start a deposit that cannot finish.
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
// Forwards `disabled`, unlike the sibling suites' stub — the gate under test
// is exactly that prop.
vi.mock("@/components/shared", () => ({
  DepositButton: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
}));

const amountState: DepositAmountState = {
  amount: "",
  amountSats: 0n,
  btcBalance: 100_000_000n,
  unconfirmedBalance: 0n,
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

describe("DepositForm funding-input bound gate", () => {
  it("disables the CTA when the chain publishes no bound", () => {
    renderForm({ fundingInputBoundUnpublished: true });

    const cta = screen.getByRole("button", {
      name: COPY.deposit.fundingInputBound.pausedCta,
    });
    expect(cta).toBeDisabled();
  });

  it("disables the CTA when the bound read failed", () => {
    renderForm({ fundingInputBoundUnavailable: true });

    const cta = screen.getByRole("button", {
      name: COPY.deposit.fundingInputBound.unavailableCta,
    });
    expect(cta).toBeDisabled();
  });

  it("leaves the CTA enabled once the bound resolves", () => {
    renderForm({});

    expect(screen.getByRole("button", { name: "Deposit" })).toBeEnabled();
  });
});
