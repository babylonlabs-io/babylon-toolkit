/**
 * The connected Keystone key is the first receive leaf of the Taproot account:
 * `${accountPath}/0/0`. This leaf — not the bare account path — is the key used
 * for the address, PSBT signing, and message signing, and it is the
 * `connectedPubkey` the deriveContextHash spec binds into the HKDF `info`
 * (docs/specs/derive-context-hash.md §2.2).
 *
 * Centralizing it here keeps the `/0/0` leaf invariant in one tested place so a
 * refactor can't silently drop the suffix and regress to deriving against the
 * account path.
 */
export const connectedLeafKeyPath = (accountPath: string): string => `${accountPath}/0/0`;
