/**
 * Recovery of a Pre-PegIn stranded by an Ethereum reorg (#2203).
 *
 * When a reorg orphans the `submitPeginRequestBatch` registration and it is
 * never re-included, the on-chain vault row and the indexer's copy both
 * disappear while the depositor's BTC stays locked in the HTLC. Nothing here
 * performs a `vaultId`-keyed read: the depositor pubkey comes from the wallet,
 * the vault count and the auth anchor from the transaction, the hashlocks from
 * the wallet's derivation, and the destroyed protocol parameters from a search
 * over the version-keyed reads that survive.
 *
 * @module recovery
 */

export * from "./deriveHashlocksFromPrePegin";
export * from "./peginParamsCandidates";
export * from "./reconstructPeginParams";
export * from "./recoveryErrors";
