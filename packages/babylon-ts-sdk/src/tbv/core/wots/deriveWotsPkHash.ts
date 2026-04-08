import { computeWotsPkHash, deriveWotsKeypair, mnemonicToWotsSeed } from "./derivation";

/**
 * Convenience wrapper: derive a WOTS keypair from a mnemonic and return
 * the keccak256 hash of its public key. Handles seed creation and cleanup.
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
    const keypair = await deriveWotsKeypair(
      seed,
      peginTxid,
      depositorBtcPubkey,
      appContractAddress,
    );
    try {
      return computeWotsPkHash(keypair);
    } finally {
      for (const p of keypair.falsePreimages) p.fill(0);
      for (const p of keypair.truePreimages) p.fill(0);
    }
  } finally {
    seed.fill(0);
  }
}
