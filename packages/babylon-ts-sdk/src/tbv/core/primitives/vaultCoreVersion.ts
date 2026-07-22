/**
 * Vault core version — the on-chain version axis that selects which tx graph
 * the vault-wasm facade builds.
 *
 * One number, two names: the contract calls it `vaultCoreVersion`
 * (`ProtocolParams.activeVaultCoreVersion()` for fresh deposits, the vault's
 * stamped `BTCVaultProtocolInfo.vaultCoreVersion` for resume), while the
 * vault-wasm facade calls the same axis `txGraphVersion`. SDK params carry
 * `vaultCoreVersion` and map it to `txGraphVersion` at each WASM call site.
 */

/** `vaultCoreVersion` is `uint16` on-chain (see `IProtocolParams.sol`). */
const VAULT_CORE_VERSION_UINT16_MAX = 65_535;

/**
 * Assert a vault core version is a well-formed on-chain value: an integer in
 * `[1, 65535]`. Mirrors the contract (`uint16`, setter rejects 0) and vaultd
 * (`SUPPORTED_CORE_VERSIONS` never contains 0). A `0` here means the vault
 * predates the `vaultCoreVersion` contract field or the read was mis-decoded —
 * fail closed rather than guess a graph version.
 *
 * Whether the version is *buildable* by the bundled WASM is a separate
 * question — the facade fails closed on unsupported versions at construction.
 *
 * @param version - The value to validate.
 * @param source - Where the value came from, for the error message
 *   (e.g. `"ProtocolParams.activeVaultCoreVersion()"`).
 */
export function assertValidVaultCoreVersion(
  version: number,
  source: string,
): void {
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > VAULT_CORE_VERSION_UINT16_MAX
  ) {
    throw new Error(
      `Invalid vaultCoreVersion ${version} from ${source}: expected an ` +
        `integer in [1, ${VAULT_CORE_VERSION_UINT16_MAX}].`,
    );
  }
}
