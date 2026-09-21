/**
 * Delegated-claim (depositor-as-claimer) assembly surface.
 *
 * These wrap the `vault-wasm` exports that let a browser produce the two
 * files the `vaultd vp wt` watchtower CLI consumes — `artifacts.json` and
 * `wots_keypair.json` — without the vault provider's cooperation, and then
 * run the claim from those same two files.
 *
 * Claim-time execution is part of this surface: `pinPegoutProof` verifies
 * the prover's Groth16 proof into the artifacts, `attachFinalizedAssert`
 * finalizes the Assert from it, and `finalizePayout` and
 * `finalizeWronglyChallenged` return broadcastable transactions. Two things
 * stay outside: the proof comes from the prover service, and nothing here
 * watches the chain for a ChallengeAssert.
 *
 * Every graph-taking export is graph v3 only and fails closed on v1/v2 with
 * `unsupported tx graph version for delegated claim: <v> (supported: 3)` —
 * those vaults predate the artifacts format.
 *
 * @see btc-vault docs/delegated_claim.md
 */

import type * as VaultWasm from '../dist/generated/vault_wasm.js';
import { toError } from './errors.js';
import type {
  WatchtowerArtifactsInputs,
  WotsKeypairDerivation,
  WronglyChallengedPsbts,
} from './types.js';

/**
 * Loads the wasm-bindgen surface. The browser and Node entries each pass
 * their own loader, so this surface has one implementation rather than one
 * copy per entry point.
 */
type GetWasmBindings = () => Promise<typeof VaultWasm>;

/**
 * Parses a JSON string a wasm export returned. A failure here is a
 * binary/facade mismatch, not caller error, so it carries the export name.
 */
function parseWasmJson<T>(json: string, fnName: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    // The cause is deliberately dropped. `toError` returns an `Error`
    // unchanged, so a V8 `SyntaxError` would arrive verbatim — and its message
    // quotes a snippet of the input it choked on. For `wotsKeypairFromSeed`
    // that input is the secret keypair JSON, which would then reach any log
    // that records the error.
    throw new Error(`${fnName}: unparseable JSON from WASM`);
  }
}

/** Rejects a value WASM would silently truncate into a u64. */
function assertU64(value: bigint, label: string): void {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit in a u64, got ${value}`);
  }
}

/**
 * Rejects a value WASM would silently truncate into a u16.
 *
 * wasm-bindgen wraps rather than throws, so `65543` would arrive as `7` and
 * produce a well-formed artifacts file carrying the wrong version.
 */
function assertU16(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be an integer in 0..65535, got ${value}`);
  }
}

export function createDelegatedClaimApi(getWasmBindings: GetWasmBindings) {
  return {
    /** Depositor's Claim signing PSBT (base64) — spends PegIn:1, script path. */
    async buildClaimPsbt(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.buildClaimPsbt(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'buildClaimPsbt');
      }
    },

    /** Claimer's Assert signing PSBT (base64) — the single WOTS input. */
    async buildAssertClaimerPsbt(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.buildAssertClaimerPsbt(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'buildAssertClaimerPsbt');
      }
    },

    /** Claimer's Payout signing PSBT (base64) — input 1, Assert connector path. */
    async buildPayoutClaimerPsbt(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.buildPayoutClaimerPsbt(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'buildPayoutClaimerPsbt');
      }
    },

    /**
     * Depositor's Payout signing PSBT (base64) — input 0, the PegIn UTXO
     * spend. Always signed: the builder no longer reads a presign-phase
     * depositor Payout signature off the graph, so this PSBT rides in the
     * same batch as the rest rather than costing a second wallet prompt.
     */
    async buildPayoutDepositorPsbt(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.buildPayoutDepositorPsbt(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'buildPayoutDepositorPsbt');
      }
    },

    /**
     * Claimer's WronglyChallenged signing PSBTs, keyed by hex challenger
     * pubkey and ordered by garbled-circuit index. One signature per entry
     * answers one challenger's fraudulent ChallengeAssert.
     */
    async buildWronglyChallengedPsbts(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<WronglyChallengedPsbts> {
      const wasm = await getWasmBindings();
      let json: string;
      try {
        json = wasm.buildWronglyChallengedPsbts(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'buildWronglyChallengedPsbts');
      }
      return parseWasmJson<WronglyChallengedPsbts>(
        json,
        'buildWronglyChallengedPsbts',
      );
    },

    /**
     * Applies the depositor's signature to the Claim transaction and returns
     * the fully signed consensus hex — the `claim_tx` the artifacts carry.
     * The signature is verified before the witness is populated, so a
     * wrong-key signature fails here rather than at broadcast.
     */
    async finalizeClaimTx(
      txGraphVersion: number,
      graphJson: string,
      depositorSigHex: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.finalizeClaimTx(
          txGraphVersion,
          graphJson,
          depositorSigHex,
        );
      } catch (err) {
        throw toError(err, 'finalizeClaimTx');
      }
    },

    /**
     * Extracts the single taproot script-path signature from a signed PSBT
     * input, enforcing the 64-byte SIGHASH_DEFAULT form. Version-agnostic.
     */
    async extractTapScriptSig(
      psbtBase64: string,
      inputIndex: number,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.extractTapScriptSig(psbtBase64, inputIndex);
      } catch (err) {
        throw toError(err, 'extractTapScriptSig');
      }
    },

    /**
     * Derives the depositor's WOTS keypair from the 64-byte `wotsSeed`.
     *
     * `keypair` is exactly the `wots_keypair.json` the watchtower CLI
     * accepts. The secret chains are single-use: never persist them beyond
     * the claim, and never reuse them — reuse leaks the WOTS key.
     *
     * @stability frozen — `HASH160(seed || block index)` is an on-chain
     * binding through `depositorWotsPkHash`; rotating it severs existing
     * vaults from their claim path.
     */
    async wotsKeypairFromSeed(
      wotsSeed: Uint8Array,
    ): Promise<WotsKeypairDerivation> {
      const wasm = await getWasmBindings();
      let json: string;
      try {
        json = wasm.wotsKeypairFromSeed(wotsSeed);
      } catch (err) {
        throw toError(err, 'wotsKeypairFromSeed');
      }
      return parseWasmJson<WotsKeypairDerivation>(json, 'wotsKeypairFromSeed');
    },

    /**
     * Throws unless the keypair's public keys match the ones the graph's
     * Claim commits to. This is the gate before WOTS secrets leave the
     * browser: an unbound keypair produces an Assert witness no verifier
     * accepts.
     */
    async validateWotsKeypairAgainstGraph(
      txGraphVersion: number,
      keypair: unknown,
      graphJson: string,
    ): Promise<void> {
      const wasm = await getWasmBindings();
      try {
        wasm.validateWotsKeypairAgainstGraph(
          txGraphVersion,
          JSON.stringify(keypair),
          graphJson,
        );
      } catch (err) {
        throw toError(err, 'validateWotsKeypairAgainstGraph');
      }
    },

    /**
     * Assembles the watchtower `artifacts.json` content and returns it as the
     * JSON string to write verbatim — re-encoding it risks drifting from the
     * schema the CLI reads.
     *
     * Every claimer-side signature and the graph's own presign set are
     * verified before bundling, so a broken artifact surfaces here, while the
     * signer is still on the page, instead of months later at claim time.
     *
     * `babeSessionsJson` and `verifyingKeyHex` pass through opaquely. The
     * BaBe sessions are multi-hundred-megabyte payloads; omit them here and
     * join them into the file downstream rather than routing them through
     * WASM memory.
     *
     * `depositorPayoutSigHex` is always signed fresh and required — the
     * upstream binding no longer reads a presigned one off the graph.
     * `expectedVaultCoreVersion` comes from the finalized `PegInSubmitted`
     * event and must equal the version the graph records.
     */
    async buildWatchtowerArtifacts(
      inputs: WatchtowerArtifactsInputs,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      assertU64(inputs.claimableEventBlockNumber, 'claimableEventBlockNumber');
      assertU16(inputs.proverCircuitVersion, 'proverCircuitVersion');
      assertU16(inputs.expectedVaultCoreVersion, 'expectedVaultCoreVersion');
      try {
        return wasm.buildWatchtowerArtifacts(
          inputs.txGraphVersion,
          inputs.graphJson,
          inputs.signedClaimTxHex,
          inputs.assertClaimerSigHex,
          inputs.payoutClaimerSigHex,
          JSON.stringify(inputs.wronglyChallengedSigs),
          inputs.depositorPayoutSigHex,
          inputs.verifyingKeyHex,
          inputs.claimableEventBlockNumber,
          inputs.proverCircuitVersion,
          inputs.vaultIdHex,
          // Required upstream, optional here: an omitted value means the
          // sessions are joined into the file downstream, which the empty
          // object represents.
          inputs.babeSessionsJson ?? '{}',
          inputs.expectedVaultCoreVersion,
        );
      } catch (err) {
        throw toError(err, 'buildWatchtowerArtifacts');
      }
    },

    /**
     * Re-verifies every claimer-side signature inside an `artifacts.json`
     * against its own embedded graph. Use it on a file that arrives from disk
     * before relying on it for a claim — an artifacts file is only as good as
     * the signatures in it, and nothing else checks them until the CLI runs.
     */
    async verifyWatchtowerArtifacts(
      txGraphVersion: number,
      artifactsJson: string,
    ): Promise<void> {
      const wasm = await getWasmBindings();
      try {
        wasm.verifyWatchtowerArtifacts(txGraphVersion, artifactsJson);
      } catch (err) {
        throw toError(err, 'verifyWatchtowerArtifacts');
      }
    },

    /**
     * Verifies the Groth16 pegout proof against the artifacts' verifying key
     * and pins it into the artifacts, returning the updated artifacts JSON.
     *
     * Persist the returned JSON before the Assert is broadcast, and finalize
     * the Assert from that copy only: the depositor's one-time WOTS keypair
     * must sign exactly one π₁, so a second, different proof is refused once
     * one is pinned. Re-pinning the same proof is a no-op.
     */
    async pinPegoutProof(
      txGraphVersion: number,
      artifactsJson: string,
      proofHex: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.pinPegoutProof(txGraphVersion, artifactsJson, proofHex);
      } catch (err) {
        throw toError(err, 'pinPegoutProof');
      }
    },

    /**
     * Finalizes the Assert from the pinned proof and the depositor's WOTS
     * keypair, writes it into the artifacts as `assert_tx_hex` and returns
     * the updated artifacts JSON.
     *
     * Hand exactly that JSON to `vaultd vp wt start-claim`: it verifies the
     * attached Assert instead of signing one, so the keypair never leaves
     * the browser. Errors when no proof is pinned.
     */
    async attachFinalizedAssert(
      txGraphVersion: number,
      artifactsJson: string,
      keypairJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.attachFinalizedAssert(
          txGraphVersion,
          artifactsJson,
          keypairJson,
        );
      } catch (err) {
        throw toError(err, 'attachFinalizedAssert');
      }
    },

    /**
     * Finalizes the Payout from the depositor and claimer Payout signatures
     * the artifacts carry, and returns the transaction hex. Broadcastable
     * only after the Assert relative timelock expires.
     */
    async finalizePayout(
      txGraphVersion: number,
      artifactsJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.finalizePayout(txGraphVersion, artifactsJson);
      } catch (err) {
        throw toError(err, 'finalizePayout');
      }
    },

    /**
     * Finalizes one WronglyChallenged transaction from the artifacts — the
     * answer to a ChallengeAssert. It must confirm inside
     * `timelock_challenge_assert` or the challenger's NoPayout takes the
     * vault.
     */
    async finalizeWronglyChallenged(
      txGraphVersion: number,
      artifactsJson: string,
      challengerPkHex: string,
      gcIndex: number,
      preimageHex: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      assertU16(gcIndex, 'gcIndex');
      try {
        return wasm.finalizeWronglyChallenged(
          txGraphVersion,
          artifactsJson,
          challengerPkHex,
          gcIndex,
          preimageHex,
        );
      } catch (err) {
        throw toError(err, 'finalizeWronglyChallenged');
      }
    },
  };
}
