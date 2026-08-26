/**
 * Transport clients for the external systems the SDK talks to (Ethereum, Bitcoin mempool, vault provider RPC).
 *
 * Use the `eth` readers for authoritative vault / protocol / signer-set data at the version a vault pinned
 * at registration — signing-critical values must not come from the indexer mirror.
 *
 * @module clients
 */

export * from "./mempool";
export * from "./vault-provider";
export * from "./eth";

