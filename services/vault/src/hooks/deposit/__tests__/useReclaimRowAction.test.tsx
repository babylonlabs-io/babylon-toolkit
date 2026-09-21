/**
 * useReclaimRowAction — the wallet-needed outcome. The eligibility rules
 * themselves are covered in models/__tests__/reclaimEligibility.test.ts; these
 * lock in when an Ethereum-only session is offered the Bitcoin connection in
 * place of the reclaim, and when the model's own answer stands instead.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtocolGateState } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useReclaimRowAction } from "@/hooks/deposit/useReclaimRowAction";
import type { ReclaimStatus } from "@/hooks/useReclaimStatus";

const wallet = vi.hoisted(() => ({
  connected: false,
  locked: false,
  publicKeyNoCoord: undefined as string | undefined,
}));
const gate = vi.hoisted(() => ({
  value: { protocol: null, aave: null } as ProtocolGateState,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({
    connected: wallet.connected,
    locked: wallet.locked,
    publicKeyNoCoord: wallet.publicKeyNoCoord,
  }),
  useChainConnector: () => undefined,
}));

vi.mock("@/context/wallet/VaultWalletConnectionProvider", () => ({
  isLedgerVaultConnector: () => false,
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gate.value,
}));

// Settled payout heights from reclaimEligibility.test.ts.
const SETTLED_STATUS: ReclaimStatus = {
  payoutSpend: { spent: true, confirmed: true, blockHeight: 899_995 },
  reserveSpend: { spent: false, confirmed: false },
  reserveValueSats: 33_000n,
  observedTipHeight: 900_000,
};

function renderReclaimRowAction(depositorBtcPubkey = "ab".repeat(32)) {
  return renderHook(() =>
    useReclaimRowAction({
      status: SETTLED_STATUS,
      onChainStatus: OnChainBtcVaultStatus.REDEEMED,
      depositorBtcPubkey,
      isReclaimInFlight: false,
    }),
  ).result.current;
}

describe("useReclaimRowAction needsWallet", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.connected = false;
    wallet.locked = false;
    wallet.publicKeyNoCoord = undefined;
    gate.value = { protocol: null, aave: null };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks for the wallet when the owner could reclaim now", () => {
    const action = renderReclaimRowAction();

    expect(action.needsWallet).toBe(true);
    expect(action.available).toBe(false);
    expect(action.blockedTooltip).toBeNull();
    expect(action.reclaimableSats).toBe(33_000n);
  });

  it("keeps the model's blocked reason while withdraw is paused", () => {
    gate.value = { protocol: "paused", aave: null };

    const action = renderReclaimRowAction();

    expect(action.needsWallet).toBe(false);
    expect(action.blockedTooltip).toBe(COPY.reclaim.blocked.protocolPaused);
  });

  it("does not ask for the wallet once Bitcoin is connected", () => {
    wallet.connected = true;

    const action = renderReclaimRowAction();

    expect(action.needsWallet).toBe(false);
    expect(action.available).toBe(false);
  });

  it("checks a locked wallet's own key instead of asking for the wallet", () => {
    wallet.connected = true;
    wallet.locked = true;
    wallet.publicKeyNoCoord = "cd".repeat(32);

    const action = renderReclaimRowAction();

    expect(action.needsWallet).toBe(false);
    expect(action.available).toBe(false);
  });

  it("does not ask for the wallet while Ethereum-only access is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "false");

    const action = renderReclaimRowAction();

    expect(action.needsWallet).toBe(false);
    expect(action.reclaimableSats).toBeNull();
  });

  it("does not ask for the wallet when the depositor key is unknown", () => {
    const action = renderReclaimRowAction("");

    expect(action.needsWallet).toBe(false);
    expect(action.reclaimableSats).toBeNull();
  });
});
