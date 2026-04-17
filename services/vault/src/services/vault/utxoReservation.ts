/**
 * UTXO reservation — thin wrapper over SDK.
 *
 * Re-exports SDK reservation logic. Vault-specific types (PendingPeginRequest,
 * Vault) are structurally compatible with the SDK's narrow types
 * (PendingPeginLike, VaultLike).
 */

export type {
  CollectReservedUtxoRefsParams,
  SelectUtxosForDepositParams,
  UtxoRef,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";

export {
  collectReservedUtxoRefs,
  selectUtxosForDeposit,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
