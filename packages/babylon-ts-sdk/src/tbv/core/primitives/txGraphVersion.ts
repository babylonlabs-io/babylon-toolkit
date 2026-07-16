/**
 * Tx graph (vault-core) versions the SDK can ask the vault-wasm facade to
 * build. The facade fails closed on anything it wasn't compiled with.
 *
 * Phase 1 of the multi-version rollout pins every construction site to v1 —
 * byte-identical to the pre-facade builder. Fresh/resume version resolution
 * (fresh: `activeVaultCoreVersion()`; resume: the vault's stamped
 * `vaultCoreVersion`) replaces this constant when the wiring lands.
 */
export const TX_GRAPH_VERSION_V1 = 1;
