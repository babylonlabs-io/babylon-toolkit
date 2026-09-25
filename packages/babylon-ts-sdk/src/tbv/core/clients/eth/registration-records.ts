/**
 * Pure helpers over {@link PeginRegistrationRecord}.
 *
 * The reader decodes a whole block leniently; the strict per-record checks
 * live here and run only on the records a caller selects, so a stranger's
 * malformed registration in the same block cannot fail an unrelated read (the
 * vault app's deposit resume reads its commission ceiling through the same
 * block). That leniency stops at duplicates: a vault registers once, so two
 * logs for any vault id are an inconsistent node and the reader fails the
 * whole block's read closed by design.
 *
 * @module clients/eth/registration-records
 */

import type { Hex } from "viem";

import { MAX_PAYOUT_SCRIPT_LEN } from "../../primitives/psbt/constants";
import { calculateBtcTxHash } from "./pegin-transaction";
import { RegistrationLogsUnavailableError } from "./registration-logs-error";
import type { PeginRegistrationRecord } from "./types";

const HEX_PREFIX_LEN = 2;

/**
 * The record of `vaultId` among a block's registrations.
 *
 * @throws {RegistrationLogsUnavailableError} (transient, retry) when the
 * block's registration logs do not include the vault: the registry emits a
 * `PegInSubmittedV2` on every submission, so an answer without the target's
 * is as readily a node's partial answer as a vault registered elsewhere.
 * @experimental
 */
export function findRegistrationRecord(
  records: readonly PeginRegistrationRecord[],
  vaultId: Hex,
  createdAt: bigint,
): PeginRegistrationRecord {
  const wanted = vaultId.toLowerCase();
  const record = records.find((r) => r.vaultId === wanted);
  if (record === undefined) {
    // Both shapes are emitted together on every submission
    // (vault-contracts-aave-v4 `PeginLogic.sol:144-147` @ c559f5c2).
    throw new RegistrationLogsUnavailableError(
      createdAt,
      `Vault ${vaultId} has no PegInSubmittedV2 registration log at its on-chain registration ` +
        `block ${createdAt}: either the node served a partial answer for block ${createdAt} ` +
        `(retry, preferably another node) or the vault was not registered in this block`,
    );
  }
  return record;
}

/**
 * Txid of the record's `unsignedPrePeginTx`, `0x`-prefixed display order —
 * what the vault record stores as `prePeginTxHash`.
 *
 * @throws When the log's transaction does not parse.
 * @experimental
 */
export function registrationPrePeginTxHash(
  record: PeginRegistrationRecord,
): Hex {
  return calculateBtcTxHash(record.unsignedPrePeginTx);
}

/**
 * The bound `assertPayoutScriptMatchesPopKey` enforces before a registration
 * is submitted (payout-script.ts); a log outside it is not a script the SDK
 * ever registered.
 *
 * @experimental
 */
export function assertRegisteredPayoutScriptBounds(
  record: PeginRegistrationRecord,
): void {
  const bytes =
    (record.depositorPayoutScriptPubKey.length - HEX_PREFIX_LEN) / 2;
  if (bytes === 0 || bytes > MAX_PAYOUT_SCRIPT_LEN) {
    throw new Error(
      `PegInSubmittedV2 log for vault ${record.vaultId} carries a ${bytes}-byte ` +
        `depositorPayoutBtcAddress; expected 1..${MAX_PAYOUT_SCRIPT_LEN} bytes`,
    );
  }
}
