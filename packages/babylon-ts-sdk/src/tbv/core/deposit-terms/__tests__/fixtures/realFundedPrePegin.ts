/**
 * A funded Pre-PegIn whose HTLC outputs carry the REAL connector scriptPubKey
 * and `amount + DCV + peginMaxFee + anchor` value, followed by the auth-anchor
 * OP_RETURN at vout === sibling count — a tx the core's Gate 1 accepts.
 * Shared by the core golden tests and the claim-time golden test.
 */
import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { TEST_KEYS } from "../../../primitives/psbt/__tests__/helpers";

export const REAL_FUNDED_PREPEGIN = {
  NETWORK: "signet" as Network,
  // All four scalars deliberately DISTINCT: identical rates (or timelocks)
  // would blind these tests to a swapped-argument bug in the core's WASM
  // calls or a transposed field in the projection.
  TIMELOCK_REFUND: 2016,
  TIMELOCK_PEGIN: 684,
  TIMELOCK_ASSERT: 700,
  COUNCIL_QUORUM: 2,
  COUNCIL_SIZE: 3,
  PROTOCOL_FEE_RATE: 3n,
  MIN_PEGIN_FEE_RATE: 7n,
  PREPEGIN_MAX_FEE: 1500n,
  COMMISSION_BPS: 250,
  BPS_DENOMINATOR: 10_000n,
  DEPOSITOR: TEST_KEYS.DEPOSITOR,
  VP: TEST_KEYS.VAULT_PROVIDER,
  // Sorted ascending, as validateOnChainParticipantKeys and
  // resolveParticipantKeysAtEpochs hand them to script construction.
  VKS: [TEST_KEYS.VAULT_KEEPER_2, TEST_KEYS.VAULT_KEEPER_1],
  UCS: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
} as const;

export interface Sibling {
  hashlock: string;
  amount: bigint;
}

/** Amount-independent sizing, recomputed exactly as the core does. */
async function sizing(version: number) {
  const f = REAL_FUNDED_PREPEGIN;
  const dcv = await computeMinClaimValue(
    version,
    f.VKS.length,
    f.UCS.length,
    f.COUNCIL_QUORUM,
    f.COUNCIL_SIZE,
    f.PROTOCOL_FEE_RATE,
  );
  const fee = await computeMinPeginFee(
    version,
    f.VKS.length,
    f.UCS.length,
    f.MIN_PEGIN_FEE_RATE,
  );
  const anchor = (await peginP2aAnchorOutput(version))?.value ?? 0n;
  return { dcv, fee, anchor };
}

export async function buildRealFundedTx(version: number, siblings: Sibling[]) {
  const f = REAL_FUNDED_PREPEGIN;
  const { dcv, fee, anchor } = await sizing(version);
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (const s of siblings) {
    const info = await getPrePeginHtlcConnectorInfo({
      txGraphVersion: version,
      depositorPubkey: f.DEPOSITOR,
      vaultProviderPubkey: f.VP,
      vaultKeeperPubkeys: [...f.VKS],
      universalChallengerPubkeys: [...f.UCS],
      hashlock: s.hashlock,
      timelockRefund: f.TIMELOCK_REFUND,
      network: f.NETWORK,
    });
    tx.addOutput(
      Buffer.from(info.scriptPubKey, "hex"),
      Number(s.amount + dcv + fee + anchor),
    );
  }
  tx.addOutput(
    Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xcd)]),
    0,
  );
  return { txHex: tx.toHex(), dcv, fee, anchor };
}
