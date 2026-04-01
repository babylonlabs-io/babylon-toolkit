import { computeLamportPkHash, deriveLamportKeypair, mnemonicToLamportSeed } from "./derivation";

/**
 * Convenience wrapper: derive a Lamport keypair from a mnemonic and return
 * the keccak256 hash of its public key. Handles seed creation and cleanup.
 *
 * Used before the ETH transaction to produce the `depositorLamportPkHash`
 * that gets committed on-chain.
 */
export async function deriveLamportPkHash(
  mnemonic: string,
  peginTxid: string,
  depositorBtcPubkey: string,
  appContractAddress: string,
): Promise<`0x${string}`> {
  const seed = mnemonicToLamportSeed(mnemonic);
  try {
    const keypair = await deriveLamportKeypair(
      seed,
      peginTxid,
      depositorBtcPubkey,
      appContractAddress,
    );
    try {
      return computeLamportPkHash(keypair);
    } finally {
      for (const p of keypair.falsePreimages) p.fill(0);
      for (const p of keypair.truePreimages) p.fill(0);
    }
  } finally {
    seed.fill(0);
  }
}
