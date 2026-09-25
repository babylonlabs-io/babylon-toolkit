/**
 * The ordered list of PSBTs a delegated claim asks the depositor to sign.
 *
 * Order and input indices mirror `btc-vault crates/vault` and are not free
 * to choose: the Payout's Assert connector is input 1 (input 0 is the PegIn
 * UTXO); every other signing input is input 0 of its own transaction. Request
 * ids tie WronglyChallenged entries to their (challenger, gcIndex) pair, so
 * the array position is not load-bearing; the challenger order reflects the
 * caller's Record insertion order. The engine emits that record BTreeMap-
 * sorted by challenger hex (btc-vault `crates/vault/src/wasm/api.rs`,
 * `wasm_build_wrongly_challenged_psbts`), which is what keeps the
 * assembler's positional compare stable.
 *
 * @module services/delegated-claim/signingRequests
 */

import {
  ASSERT_CLAIM_INPUT_INDEX,
  CLAIM_PEGIN_INPUT_INDEX,
  PAYOUT_ASSERT_INPUT_INDEX,
  PAYOUT_PEGIN_INPUT_INDEX,
  WRONGLY_CHALLENGED_INPUT_INDEX,
} from "../../primitives/psbt/constants";
import type { DelegatedClaimSigningRequest } from "./types";

/**
 * The five PSBT groups the WASM builders produce, all base64.
 *
 * @experimental
 */
export interface DelegatedClaimPsbtSet {
  claim: string;
  assert: string;
  payoutClaimer: string;
  payoutDepositor: string;
  wronglyChallenged: Record<string, string[]>;
}

/**
 * Stable id of a WronglyChallenged request.
 *
 * @experimental
 */
export function wronglyChallengedRequestId(
  challengerPubkey: string,
  gcIndex: number,
): string {
  return `wronglyChallenged:${challengerPubkey}:${gcIndex}`;
}

/**
 * @experimental
 */
export function buildDelegatedClaimSigningRequests(
  psbts: DelegatedClaimPsbtSet,
): DelegatedClaimSigningRequest[] {
  const requests: DelegatedClaimSigningRequest[] = [
    {
      id: "claim",
      kind: "claim",
      psbtBase64: psbts.claim,
      inputIndex: CLAIM_PEGIN_INPUT_INDEX,
    },
    {
      id: "assert",
      kind: "assert",
      psbtBase64: psbts.assert,
      inputIndex: ASSERT_CLAIM_INPUT_INDEX,
    },
    {
      id: "payoutClaimer",
      kind: "payoutClaimer",
      psbtBase64: psbts.payoutClaimer,
      inputIndex: PAYOUT_ASSERT_INPUT_INDEX,
    },
    {
      id: "payoutDepositor",
      kind: "payoutDepositor",
      psbtBase64: psbts.payoutDepositor,
      inputIndex: PAYOUT_PEGIN_INPUT_INDEX,
    },
  ];
  for (const challengerPubkey of Object.keys(psbts.wronglyChallenged)) {
    psbts.wronglyChallenged[challengerPubkey].forEach((psbtBase64, gcIndex) => {
      requests.push({
        id: wronglyChallengedRequestId(challengerPubkey, gcIndex),
        kind: "wronglyChallenged",
        psbtBase64,
        inputIndex: WRONGLY_CHALLENGED_INPUT_INDEX,
      });
    });
  }
  return requests;
}
