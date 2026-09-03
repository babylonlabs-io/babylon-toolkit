/**
 * Delegated-claim (depositor-as-claimer) assembly surface.
 *
 * These wrap the `vault-wasm` exports that let a browser produce the two
 * files the `vaultd vp wt` watchtower CLI consumes — `artifacts.json` and
 * `wots_keypair.json` — without the vault provider's cooperation.
 *
 * Claim-time execution (proof verification, Assert/Payout/WronglyChallenged
 * finalization, race monitoring) is NOT part of this surface. It stays with
 * the watchtower CLI, which reads the two files these functions produce.
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
  } catch (err) {
    throw toError(err, `${fnName}: unparseable JSON from WASM`);
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
     * spend. Only needed when the graph carries no presign-phase depositor
     * Payout signature; see `extractDepositorPayoutSig`.
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
     * Extracts the presign-phase depositor Payout signature stored on the
     * graph, verified against the payout leaf. Throws when the graph carries
     * none — the caller then collects a fresh one via
     * `buildPayoutDepositorPsbt`.
     */
    async extractDepositorPayoutSig(
      txGraphVersion: number,
      graphJson: string,
    ): Promise<string> {
      const wasm = await getWasmBindings();
      try {
        return wasm.extractDepositorPayoutSig(txGraphVersion, graphJson);
      } catch (err) {
        throw toError(err, 'extractDepositorPayoutSig');
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
     */
    async buildWatchtowerArtifacts(
      inputs: WatchtowerArtifactsInputs,
    ): Promise<string> {
      const wasm = await getWasmBindings();
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
          inputs.babeSessionsJson,
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
  };
}
