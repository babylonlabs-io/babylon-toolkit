/**
 * Watchtower artifact assembly for the delegated claim.
 *
 * Collects every claimer-side signature the `vaultd vp wt` watchtower CLI
 * will need — in one batched wallet interaction — and bundles them with the
 * vault provider's transaction graph into an `artifacts.json`.
 *
 * Do this while the vault provider is still online and the depositor is
 * still at the keyboard. The signatures are Taproot script-path signatures
 * whose sighashes do not cover witness data, so they stay valid however the
 * claim later plays out: the WOTS values, the Groth16 proof, and the hashlock
 * preimages are all witness-only. That is what lets one signing session
 * authorize a claim that runs months later without the depositor present.
 *
 * @module services/delegated-claim/assembleWatchtowerArtifacts
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import { signPsbtsWithFallback } from "../../managers/pegin/signPsbtsWithFallback";
import { isAddressFromPublicKey } from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptionsForInput } from "../../utils/signing";
import {
  buildAssertClaimerPsbt,
  buildClaimPsbt,
  buildPayoutClaimerPsbt,
  buildPayoutDepositorPsbt,
  buildWatchtowerArtifacts,
  buildWronglyChallengedPsbts,
  extractTapScriptSig,
  finalizeClaimTx,
} from "../../wasm";
import type { WronglyChallengedSigs } from "../../wasm";

import type {
  ClaimerArtifactsSource,
  DelegatedClaimVaultContext,
} from "./types";
import {
  assertClaimSpendsVault,
  peginTxidFromClaimPsbt,
} from "./vaultIdBinding";

/**
 * Index of the input each delegated-claim PSBT asks the wallet to sign.
 *
 * Every one of these PSBTs is built by the Rust graph, so these indices
 * mirror `btc-vault crates/vault` and are not free to choose: the Payout's
 * Assert connector is input 1 (input 0 is the PegIn UTXO), and every other
 * signing input is input 0 of its own transaction.
 */
const CLAIM_DEPOSITOR_INPUT = 0;
const ASSERT_CLAIMER_INPUT = 0;
const PAYOUT_CLAIMER_INPUT = 1;
const PAYOUT_DEPOSITOR_INPUT = 0;
const WRONGLY_CHALLENGED_INPUT = 0;

/**
 * One PSBT in the batch, with the input the wallet must sign.
 */
interface PsbtSigningRequest {
  psbtBase64: string;
  inputIndex: number;
}

/**
 * Everything one delegated-claim signing session needs.
 *
 * @experimental
 */
export interface AssembleWatchtowerArtifactsParams {
  /** Wallet holding the depositor key the graph was built with. */
  btcWallet: BitcoinWallet;
  /** Depositor's BTC public key (compressed or x-only hex). */
  depositorPublicKey: string;
  /** Network the depositor's address is derived on, to check the signer. */
  btcNetwork: Network;
  /** Graph and verifying key as the vault provider returned them. */
  source: ClaimerArtifactsSource;
  vault: DelegatedClaimVaultContext;
  /**
   * Per-challenger BaBe sessions as `{"<pk>": {"decryptor_artifacts_hex":
   * "..."}}`, passed through into the file unchanged.
   *
   * Omit it for anything but a fixture. Real sessions run to hundreds of
   * megabytes per challenger, and this argument crosses the WASM boundary as
   * one string — join them into the file downstream instead.
   */
  babeSessionsJson?: string;
}

/**
 * Signs the delegated-claim set and returns the `artifacts.json` content,
 * ready to write verbatim.
 *
 * Every signature is verified against the graph before the file is produced,
 * so a wallet that signed under the wrong key fails here rather than at claim
 * time, when nothing can be re-signed.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws If the graph is not version 3, if the wallet returns a signature
 *         that does not verify, or if the graph's own presignatures are
 *         incomplete.
 * @experimental
 */
export async function assembleWatchtowerArtifacts(
  params: AssembleWatchtowerArtifactsParams,
): Promise<string> {
  const { txGraphVersion } = params.vault;
  const graphJson = params.source.txGraphJson;

  const [claimPsbt, assertPsbt, payoutClaimerPsbt, wronglyChallengedPsbts] =
    await Promise.all([
      buildClaimPsbt(txGraphVersion, graphJson),
      buildAssertClaimerPsbt(txGraphVersion, graphJson),
      buildPayoutClaimerPsbt(txGraphVersion, graphJson),
      buildWronglyChallengedPsbts(txGraphVersion, graphJson),
    ]);

  // The graph arrives from the vault provider and carries no proof that it
  // belongs to this vault. The Claim's first input spends the PegIn output
  // the on-chain vault id is derived from, so that input is the binding.
  assertClaimSpendsVault({
    peginTxid: peginTxidFromClaimPsbt(claimPsbt),
    depositorEthAddress: params.vault.depositorEthAddress,
    expectedVaultId: params.vault.vaultId,
  });

  // The depositor Payout signature is always signed fresh. The builder no
  // longer reads a presigned one off the graph, so its PSBT always joins this
  // batch rather than costing a second wallet prompt later.
  const requests: PsbtSigningRequest[] = [
    { psbtBase64: claimPsbt, inputIndex: CLAIM_DEPOSITOR_INPUT },
    { psbtBase64: assertPsbt, inputIndex: ASSERT_CLAIMER_INPUT },
    { psbtBase64: payoutClaimerPsbt, inputIndex: PAYOUT_CLAIMER_INPUT },
    {
      psbtBase64: await buildPayoutDepositorPsbt(txGraphVersion, graphJson),
      inputIndex: PAYOUT_DEPOSITOR_INPUT,
    },
  ];

  // Challenger order is fixed here and reused when the signatures are mapped
  // back, so a wallet that reorders nothing keeps every signature with the
  // challenger and garbled-circuit index it was computed for.
  const challengerPubkeys = Object.keys(wronglyChallengedPsbts);
  for (const challengerPubkey of challengerPubkeys) {
    for (const psbtBase64 of wronglyChallengedPsbts[challengerPubkey]) {
      requests.push({ psbtBase64, inputIndex: WRONGLY_CHALLENGED_INPUT });
    }
  }

  const signatures = await signAndExtract(
    params.btcWallet,
    params.depositorPublicKey,
    params.btcNetwork,
    requests,
  );

  let cursor = 0;
  const claimSig = signatures[cursor++];
  const assertClaimerSigHex = signatures[cursor++];
  const payoutClaimerSigHex = signatures[cursor++];
  const depositorPayoutSigHex = signatures[cursor++];

  const wronglyChallengedSigs: WronglyChallengedSigs = {};
  for (const challengerPubkey of challengerPubkeys) {
    const count = wronglyChallengedPsbts[challengerPubkey].length;
    wronglyChallengedSigs[challengerPubkey] = signatures.slice(
      cursor,
      cursor + count,
    );
    cursor += count;
  }

  const signedClaimTxHex = await finalizeClaimTx(
    txGraphVersion,
    graphJson,
    claimSig,
  );

  return buildWatchtowerArtifacts({
    txGraphVersion,
    graphJson,
    signedClaimTxHex,
    assertClaimerSigHex,
    payoutClaimerSigHex,
    wronglyChallengedSigs,
    depositorPayoutSigHex,
    verifyingKeyHex: params.source.verifyingKeyHex,
    claimableEventBlockNumber: params.vault.claimableEventBlockNumber,
    proverCircuitVersion: params.vault.proverCircuitVersion,
    vaultIdHex: params.vault.vaultId,
    babeSessionsJson: params.babeSessionsJson,
    expectedVaultCoreVersion: params.vault.vaultCoreVersion,
  });
}

/** The 32-byte x-only form of a compressed or x-only public key, lowercase. */
function xOnlyHex(publicKeyHex: string): string {
  const hex = publicKeyHex.replace(/^0x/, "").toLowerCase();
  if (hex.length === 66) return hex.slice(2);
  if (hex.length === 64) return hex;
  throw new Error(
    `Public key must be 33-byte compressed or 32-byte x-only hex, got ${hex.length / 2} bytes.`,
  );
}

/**
 * Returns the wallet's signing address, once both it and the wallet's public
 * key are proved to be the vault's depositor.
 *
 * Both halves matter. The public key is what the graph's scripts commit to;
 * the address is what the sign options name the signer by, and a wallet whose
 * reported address and public key belong to different accounts would
 * otherwise sign the whole batch for the wrong account.
 *
 * @throws When the wallet is on a different account than the vault's
 *         depositor, or reports an address that key does not control.
 */
async function assertWalletMatchesDepositor(
  btcWallet: BitcoinWallet,
  depositorPublicKey: string,
  btcNetwork: Network,
): Promise<string> {
  const walletPublicKey = await btcWallet.getPublicKeyHex();
  if (xOnlyHex(walletPublicKey) !== xOnlyHex(depositorPublicKey)) {
    throw new Error(
      "Connected wallet does not hold the vault's depositor key. " +
        "Select the account that made the deposit, then try again.",
    );
  }

  const signerAddress = await btcWallet.getAddress();
  if (!isAddressFromPublicKey(signerAddress, depositorPublicKey, btcNetwork)) {
    throw new Error(
      `Connected wallet reports address "${signerAddress}", which is not ` +
        "derived from the vault's depositor key. Select the account that " +
        "made the deposit, then try again.",
    );
  }
  return signerAddress;
}

/**
 * Signs every PSBT in one wallet interaction and extracts the 64-byte
 * script-path signatures, in the order the requests were given.
 */
async function signAndExtract(
  btcWallet: BitcoinWallet,
  depositorPublicKey: string,
  btcNetwork: Network,
  requests: PsbtSigningRequest[],
): Promise<string[]> {
  // The sign options name the signer by address, because a wallet derives a
  // key-path address from a public key and then refuses any input that sits
  // elsewhere — every script-path connector. An address names the account, so
  // it must be proved to be this depositor's account first: otherwise a wallet
  // on the wrong account signs all N+3 PSBTs and the mismatch only surfaces
  // later, in finalizeClaimTx or verify_bundle.
  const signerAddress = await assertWalletMatchesDepositor(
    btcWallet,
    depositorPublicKey,
    btcNetwork,
  );
  const signedPsbtHexes = await signPsbtsWithFallback(
    btcWallet,
    requests.map((request) => psbtBase64ToHex(request.psbtBase64)),
    requests.map((request) =>
      createTaprootScriptPathSignOptionsForInput(
        depositorPublicKey,
        request.inputIndex,
        signerAddress,
      ),
    ),
  );

  return Promise.all(
    signedPsbtHexes.map((signedPsbtHex, i) =>
      extractTapScriptSig(psbtHexToBase64(signedPsbtHex), requests[i].inputIndex),
    ),
  );
}

// The WASM graph emits and reads PSBTs as base64; wallets take and return
// them as hex. These re-encode the same bytes rather than parsing the PSBT,
// so no field is normalized, dropped, or reordered on the way through.
function psbtBase64ToHex(psbtBase64: string): string {
  return Buffer.from(psbtBase64, "base64").toString("hex");
}

function psbtHexToBase64(psbtHex: string): string {
  return Buffer.from(psbtHex, "hex").toString("base64");
}
