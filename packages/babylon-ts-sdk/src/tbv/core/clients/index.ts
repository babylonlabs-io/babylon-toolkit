/**
 * Transport clients for the external systems the SDK talks to (Ethereum, Bitcoin mempool, vault provider RPC).
 *
 * Use the `eth` readers for authoritative vault, protocol and signer-set data — signing-critical values
 * must not come from the indexer mirror. Rosters at a vault's pinned membership versions hold registration
 * keys; the keys a vault's scripts commit to are RFC-006 operation keys, read with `ViemOperationKeyReader`:
 * current ones for a fresh deposit, and the ones at the vault's frozen epochs for any existing vault.
 *
 * @module clients
 */

export * from "./mempool";
export * from "./vault-provider";
export * from "./eth";

