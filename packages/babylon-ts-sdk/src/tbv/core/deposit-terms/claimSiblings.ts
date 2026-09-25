/**
 * Sibling discovery for the claim-time terms rebuild — pure, fail-closed.
 *
 * A batch deposit registers every sibling in one transaction, so the target's
 * registration block holds them all: the siblings are the block's other
 * registrations by the same depositor whose `unsignedPrePeginTx` is the same
 * transaction. Completeness is backstopped by the core's auth-anchor check.
 *
 * @module deposit-terms/claimSiblings
 */

import { registrationPrePeginTxHash } from "../clients/eth/registration-records";
import type { PeginRegistrationRecord, VaultData } from "../clients/eth/types";
import type { RebuildSibling } from "./rebuildDepositTermsCore";

/**
 * One batch member: the chain record plus its registration-log ceiling.
 *
 * @experimental
 */
export interface ClaimBatchMember {
  vault: VaultData;
  maxAcceptableCommissionBps: number;
}

/**
 * Fields that must be uniform across the batch: each sibling is stamped by its
 * own `submitPeginRequest`, so governance changes between registrations can
 * stamp them differently — and Gate 1 cannot see fields not encoded in the
 * HTLC outputs (timelocks, commission).
 */
const STAMPED_PROTOCOL_FIELDS = [
  "vaultCoreVersion",
  "offchainParamsVersion",
  "appVaultKeepersVersion",
  "universalChallengersVersion",
] as const;
const STAMPED_ADDRESS_FIELDS = [
  "applicationEntryPoint",
  "vaultProvider",
] as const;

/** @experimental */
export function selectSiblingRegistrations(
  records: readonly PeginRegistrationRecord[],
  target: PeginRegistrationRecord,
): PeginRegistrationRecord[] {
  const depositor = target.depositor.toLowerCase();
  const prePeginTxHash = registrationPrePeginTxHash(target).toLowerCase();
  // Depositor first, so only the depositor's own registrations are ever parsed.
  return records.filter(
    (r) =>
      r.vaultId !== target.vaultId &&
      r.depositor.toLowerCase() === depositor &&
      registrationPrePeginTxHash(r).toLowerCase() === prePeginTxHash,
  );
}

/** @experimental */
export function assertClaimBatchHomogeneous(
  target: ClaimBatchMember,
  siblings: readonly ClaimBatchMember[],
): void {
  for (const sibling of siblings) {
    for (const field of STAMPED_PROTOCOL_FIELDS) {
      if (sibling.vault.protocol[field] !== target.vault.protocol[field]) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${sibling.vault.protocol[field]} vs ${target.vault.protocol[field]}); ` +
            `the batch cannot be described by one set of deposit terms.`,
        );
      }
    }
    if (
      sibling.maxAcceptableCommissionBps !== target.maxAcceptableCommissionBps
    ) {
      throw new Error(
        `Sibling vaults of this Pre-PegIn disagree on maxAcceptableCommissionBps ` +
          `(${sibling.maxAcceptableCommissionBps} vs ${target.maxAcceptableCommissionBps}); ` +
          `the batch cannot be described by one set of deposit terms.`,
      );
    }
    for (const field of STAMPED_ADDRESS_FIELDS) {
      if (
        sibling.vault.basic[field].toLowerCase() !==
        target.vault.basic[field].toLowerCase()
      ) {
        throw new Error(
          `Sibling vaults of this Pre-PegIn disagree on ${field} ` +
            `(${sibling.vault.basic[field]} vs ${target.vault.basic[field]}); ` +
            `the batch cannot be described by one set of deposit terms.`,
        );
      }
    }
  }
}

/**
 * Sort by `htlcVout` and project into the core's sibling shape. htlcVout is
 * derived from array position downstream, so the vector must cover [0, N-1].
 *
 * @experimental
 */
export function orderClaimBatchByHtlcVout(
  members: readonly ClaimBatchMember[],
): RebuildSibling[] {
  const ordered = [...members].sort(
    (a, b) => a.vault.protocol.htlcVout - b.vault.protocol.htlcVout,
  );
  ordered.forEach((member, i) => {
    if (member.vault.protocol.htlcVout !== i) {
      throw new Error(
        `Sibling discovery produced a non-contiguous HTLC vector ` +
          `(${ordered.map((m) => m.vault.protocol.htlcVout).join(", ")}).`,
      );
    }
  });
  return ordered.map((m) => ({
    hashlock: m.vault.protocol.hashlock,
    amount: m.vault.basic.amount,
  }));
}
