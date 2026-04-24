import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlockPublicKeys,
  mnemonicToWotsSeed,
} from "./blockDerivation";

/**
 * Convenience wrapper: derive WOTS block public keys from a mnemonic and
 * return the keccak256 hash. Handles seed creation and cleanup.
 *
 * Used before the ETH transaction to produce the `depositorWotsPkHash`
 * that gets committed on-chain.
 */
export async function deriveWotsPkHash(
  mnemonic: string,
  peginTxid: string,
  depositorBtcPubkey: string,
  appContractAddress: string,
): Promise<`0x${string}`> {
  const seed = mnemonicToWotsSeed(mnemonic);
  try {
    const publicKeys = await deriveWotsBlockPublicKeys(
      seed,
      peginTxid,
      depositorBtcPubkey,
      appContractAddress,
    );
    return computeWotsBlockPublicKeysHash(publicKeys);
  } finally {
    seed.fill(0);
  }
}
