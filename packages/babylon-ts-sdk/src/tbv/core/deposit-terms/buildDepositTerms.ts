import {
  BPS_DENOMINATOR,
  MAX_VP_COMMISSION_BPS_EXCLUSIVE,
} from "../primitives/psbt/constants";

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
export function buildDepositTerms(
  inputs: BuildDepositTermsInputs,
): DepositTerms {
  const txid = inputs.prepeginTxid.toLowerCase();
  if (!/^[0-9a-f]+$/.test(txid) || txid.length !== TXID_HEX_LENGTH) {
    throw new Error(
      `buildDepositTerms: prepeginTxid must be 64 hex chars, got "${inputs.prepeginTxid}"`,
    );
  }
  if (inputs.peginAmounts.length === 0) {
    throw new Error("buildDepositTerms: at least one pegin amount is required");
  }
  // Device-envelope validation is a PROVIDER obligation inside
  // approveDepositTerms (DepositTermsApprover contract; adapter lands at #2109).
  if (
    inputs.timelockPegin <= 0 ||
    inputs.timelockAssert <= 0 ||
    inputs.timelockRefund <= 0
  ) {
    throw new Error("buildDepositTerms: timelocks must be positive");
  }
  // Same bound payout.ts enforces before broadcast; catching drift here keeps
  // the projected commissionFee ceiling meaningful.
  if (
    !Number.isInteger(inputs.maxAcceptableCommissionBps) ||
    inputs.maxAcceptableCommissionBps < 0 ||
    inputs.maxAcceptableCommissionBps >= MAX_VP_COMMISSION_BPS_EXCLUSIVE
  ) {
    throw new Error(
      `buildDepositTerms: maxAcceptableCommissionBps must be an integer in ` +
        `[0, ${MAX_VP_COMMISSION_BPS_EXCLUSIVE}), got ${inputs.maxAcceptableCommissionBps}`,
    );
  }

  const bpsDenominator = BigInt(BPS_DENOMINATOR);
  const vaults: DepositTermsVaultGroup[] = inputs.peginAmounts.map(
    (peginAmount, index) => ({
      htlcVout: index,
      vaultProviderBtcPubkey: inputs.vaultProviderBtcPubkey,
      peginAmount,
      // Ceiling, not quote: floor(peginAmount * maxAcceptableBps / 10_000) —
      // the same bound the registration calldata enforces on-chain, so any
      // stamped commission the contract admits stays under it (firmware
      // >= c8db53e checks the payout commission output <= this value).
      commissionFee:
        (peginAmount * BigInt(inputs.maxAcceptableCommissionBps)) /
        bpsDenominator,
      depositorClaimValue: inputs.depositorClaimValue,
      peginMaxFee: inputs.peginMaxFee,
    }),
  );

  return {
    vaultCoreVersion: inputs.vaultCoreVersion,
    protocolFeeRate: inputs.protocolFeeRate,
    timelockPegin: inputs.timelockPegin,
    timelockAssert: inputs.timelockAssert,
    timelockRefund: inputs.timelockRefund,
    prepeginTxid: txid,
    prepeginMaxFee: inputs.prepeginMaxFee,
    vaultKeeperBtcPubkeys: [...inputs.vaultKeeperBtcPubkeys],
    universalChallengerBtcPubkeys: [...inputs.universalChallengerBtcPubkeys],
    vaults,
  };
}
