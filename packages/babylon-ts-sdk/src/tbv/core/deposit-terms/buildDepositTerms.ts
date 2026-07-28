import { MAX_VP_COMMISSION_BPS_EXCLUSIVE } from "../primitives/psbt/constants";

import type {
  BuildDepositTermsInputs,
  DepositTerms,
  DepositTermsVaultGroup,
} from "./depositTerms";

const TXID_HEX_LENGTH = 64;

/**
 * Project already-validated pegin inputs into protocol-level deposit terms.
 * Not a second validator: keys arrive canonical and sorted from on-chain
 * validation, and non-negative sizing is already asserted by WASM output checks.
 */
export function buildDepositTerms(inputs: BuildDepositTermsInputs): DepositTerms {
  const txid = inputs.prepeginTxid.toLowerCase();
  if (!/^[0-9a-f]+$/.test(txid) || txid.length !== TXID_HEX_LENGTH) {
    throw new Error(`buildDepositTerms: prepeginTxid must be 64 hex chars, got "${inputs.prepeginTxid}"`);
  }
  if (inputs.vaultAmounts.length === 0) {
    throw new Error("buildDepositTerms: at least one vault amount is required");
  }
  // TODO(#2106): device-range validation
  if (inputs.timelockPegin <= 0 || inputs.timelockRefund <= 0) {
    throw new Error("buildDepositTerms: timelocks must be positive");
  }
  // Same bound payout.ts enforces before broadcast; catching drift here keeps
  // the projected commissionFee meaningful.
  if (
    inputs.commissionBps !== undefined &&
    (!Number.isInteger(inputs.commissionBps) ||
      inputs.commissionBps < 0 ||
      inputs.commissionBps >= MAX_VP_COMMISSION_BPS_EXCLUSIVE)
  ) {
    throw new Error(
      `buildDepositTerms: commissionBps must be an integer in ` +
        `[0, ${MAX_VP_COMMISSION_BPS_EXCLUSIVE}), got ${inputs.commissionBps}`,
    );
  }

  const bpsDenominator = BigInt(MAX_VP_COMMISSION_BPS_EXCLUSIVE);
  const vaults: DepositTermsVaultGroup[] = inputs.vaultAmounts.map((vaultAmount, index) => {
    // floor(vaultAmount * bps / 10_000) — matches the vault provider's commission math.
    const commissionFee =
      inputs.commissionBps === undefined
        ? undefined
        : (vaultAmount * BigInt(inputs.commissionBps)) / bpsDenominator;
    return {
      htlcVout: index,
      vaultProviderPk: inputs.vaultProviderPk,
      vaultAmount,
      ...(commissionFee !== undefined ? { commissionFee } : {}),
      depositorClaimValue: inputs.depositorClaimValue,
      peginMaxFee: inputs.peginMaxFee,
    };
  });

  return {
    baseFeeRate: inputs.protocolFeeRate,
    peginCsvTimelock: inputs.timelockPegin,
    payoutTimelock: inputs.timelockPegin,
    htlcRefundTimelock: inputs.timelockRefund,
    prepeginTxid: txid,
    prepeginMaxFee: inputs.prepeginMaxFee,
    keeperPks: [...inputs.keeperPks],
    challengerPks: [...inputs.challengerPks],
    vaults,
  };
}
