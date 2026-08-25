/**
 * Speculos end-to-end signing test (#2219 B2, #2221 PoP, #2222 Pre-PegIn): the
 * full production path against the real vault app in a Speculos container,
 * ending in cryptographic verification of the device's Schnorr signatures.
 *
 * Stages, in order — each one arms the device state the next consumes:
 *   1. app identity
 *   2. DERIVE_CONTEXT_HASH → context root (the HTLC hashlock's source)
 *   3. policy context (fingerprint, account xpub, change key) + Pre-PegIn build
 *   4. APPROVE_VAULT_INTENT over terms bound to that Pre-PegIn's txid
 *   5. Pre-PegIn with an UNMARKED change output → device rejection, intent intact
 *   6. Pre-PegIn under the default wallet policy → one key-path yield per input
 *   7-9. PegIn (spends the real Pre-PegIn txid), sighash check, finalize
 *   10. BIP-322 PoP, last among the intent stages, so it signs while the
 *       intent is still loaded — the path that exercises the firmware's
 *       intent-key check (`sign_psbt_validate.c:2764-2769`).
 *   11. depositor-graph presign (T7 stage a): Payout + NoPayout against a
 *       production-SDK-built graph fixture, still under the stage-4 intent.
 *   12. abort/dispatcher recovery (T7 stage b): interrupt SIGN_PSBT mid-loop,
 *       pin the eaten-APDU behavior and the full re-ceremony recovery. Runs
 *       LAST — it re-derives, which resets the vault session.
 *
 * Stage 5 MUST precede stage 6: a successful Pre-PegIn sign arms the one-shot
 * cap and the next one answers SW_CAP_EXCEEDED (`sign_psbt_validate.c:539-543`).
 *
 * Requires a running container with the vault app (nanosp, testnet build,
 * firmware-test mnemonic) built from ELF commit `29beb88d5` (stages 1-10 also
 * pass at `e2d0c45b`; stages 11-12 cite `29beb88d5` line numbers). Skipped
 * unless SPECULOS_URL is set:
 *
 *   SPECULOS_URL=http://127.0.0.1:5055 pnpm exec vitest run src/__tests__/e2e/
 *
 * Each run re-runs the full ceremony, so the container does not need restarting
 * between runs.
 */

import { assertScriptPathSchnorrSignature } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { getExtendedPublicKey, getMasterFingerprintHex } from "../../derivation";
import { assertDepositTermsDeviceCompatible } from "../../envelope";
import {
  isLedgerDeviceError,
  isLedgerSignPsbtAbortedError,
  isLedgerSignPsbtIncompleteError,
  type LedgerSignPsbtAbortedError,
  type LedgerSignPsbtIncompleteError,
} from "../../errors";
import { bip86OutputScript } from "../../expectedSignatures";
import { augmentPsbtForWalletPolicy, deriveChangeXOnlyHex } from "../../policyPsbt";
import { bip322ToSpendTxid, buildPopPsbtHex } from "../../popPsbt";
import { SW_CAP_EXCEEDED } from "../../rawApdu";
import { signPreparedVaultPsbt, signVaultPsbt, type SignVaultPsbtResult } from "../../signPsbt";
import { getPreparedSignPsbtState, prepareSignPsbt, type PreparedSignPsbt } from "../../signPsbtPrepare";
import { approveVaultIntent, deriveContextHash } from "../../vaultCommands";
import { buildDefaultTaprootPolicy, type DefaultTaprootWalletPolicy } from "../../walletPolicy";
import { buildDepositorGraphFixture, type DepositorGraphFixture } from "./depositorGraphFixture";
import {
  buildDepositTerms,
  buildPeginPsbt,
  buildPrePeginPsbt,
  computePeginSighash,
  DEPOSITOR_PATH,
  DEPOSITOR_XONLY_HEX,
  DERIVE_CONTEXT,
  HTLC_VOUT,
  PREPEGIN_INPUT_VALUE_SATS,
  termsToIntent,
  TESTNET_VERSIONS,
  VAULT_APP_NAME,
  vaultHashlock,
  verifySchnorrSignature,
  type PeginPsbtFixture,
  type PrePeginPsbtFixture,
} from "./peginFixture";
import {
  approveOnScreen,
  createSpeculosApduSender,
  createSpeculosRawApduSender,
  getAppAndVersion,
  readScreenText,
  sleep,
} from "./speculosClient";

const SPECULOS_URL = process.env.SPECULOS_URL ?? "";

/** Live-verified nanosp review-screen texts (reference driver `lsk_ceremony2.py`). */
const DERIVE_APPROVAL_TEXT = "Allow derivation";
const INTENT_APPROVAL_TEXT = "Approve intent";
/**
 * The PoP finish page is "Register ETH\naddress?" (`display.c:336-342`); the
 * intro page is the same title WITHOUT the question mark, and `approveOnScreen`
 * presses both on the FIRST match — so target the "?", unique to the finish page.
 */
const POP_APPROVAL_TEXT = "address?";

/** Ceremony = APDUs + human-speed screen navigation; signing = ~40 APDU rounds. */
const CEREMONY_TIMEOUT_MS = 120_000;
const SIGNING_TIMEOUT_MS = 60_000;
const SANITY_TIMEOUT_MS = 30_000;
/** Shorter than the test timeout so the typed abort surfaces first. */
const SIGNING_ABORT_MS = SIGNING_TIMEOUT_MS - 10_000;

const SCHNORR_SIG_BYTES = 64;

/** Depositor-graph challengers = VKs + UCs (VP excluded): 1 keeper + 1 universal in the fixture roster. */
const DEPOSITOR_GRAPH_CHALLENGER_COUNT = 2;
/** Stage 12 aborts after the FIRST yield — validation (and the Pre-PegIn cap bump) is over, signing is not. */
const ABORT_AFTER_YIELD_COUNT = 1;

/**
 * SW_INCORRECT_DATA — `_validate_prepegin`'s catch-all output reject
 * (`sign_psbt_validate.c:507-510`); also what the dispatcher answers for the
 * one eaten APDU after an abandoned CONTINUE loop (`base:dispatcher.c:107-111`).
 */
const SW_INCORRECT_DATA = 0x6a80;

/** `<eth>:<chainId>:pegin:<registry>` — grammar is the device's boundary, not ours. */
const POP_MESSAGE =
  "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678";
/** The policy's key origin is DEPOSITOR_PATH's account prefix, m/86'/1'/0'. */
const ACCOUNT_PATH_LEVELS = 3;
const POLICY_COIN_TYPE = 1;
const POLICY_ACCOUNT_INDEX = 0;
/** Change lives at `account/1/0` — the policy derives the branch, we pick the index. */
const CHANGE_ADDRESS_INDEX = 0;

/**
 * BIP-322 to_sign framing, restated. The to_spend txid still comes from
 * `bip322ToSpendTxid` (the builder under test), but the device is the
 * independent oracle for it: the firmware rebuilds to_spend from the message
 * and its own BIP-86 key and rejects a PSBT_IN_PREVIOUS_TXID mismatch before
 * signing (`sign_psbt_validate.c:2751-2802` @ 4decf822).
 */
const TO_SIGN_VERSION = 0;
const TO_SIGN_LOCKTIME = 0;
const TO_SIGN_SEQUENCE = 0;
const TO_SPEND_VOUT = 0;
const OP_RETURN_SCRIPT = Buffer.from([0x6a]);
const ZERO_SATS = 0;
/** P2TR scriptPubKey = `OP_1 ‖ push-32 ‖ output key`; the key starts here. */
const P2TR_WITNESS_PROGRAM_OFFSET = 2;

describe.skipIf(SPECULOS_URL === "")("Speculos end-to-end vault signing", () => {
  const sendRaw = createSpeculosRawApduSender(SPECULOS_URL);
  const send = createSpeculosApduSender(SPECULOS_URL);

  // Ordered stages share state; a later stage failing on `undefined` means an
  // earlier stage failed first — read its failure, not this one.
  let contextRoot: Uint8Array | undefined;
  let policy: DefaultTaprootWalletPolicy | undefined;
  let masterFingerprintHex: string | undefined;
  let changeXOnly: string | undefined;
  let prePegin: PrePeginPsbtFixture | undefined;
  let fixture: PeginPsbtFixture | undefined;
  let signResult: SignVaultPsbtResult | undefined;

  it(
    "(1) reports the vault app name and version",
    async () => {
      const app = await getAppAndVersion(sendRaw);
      expect(app.name).toContain("Babylon Vault");
      expect(app.version).toMatch(/^\d+\.\d+\.\d+$/);
      console.log(`[speculos-e2e] app: ${app.name} v${app.version}`);
    },
    SANITY_TIMEOUT_MS,
  );

  it(
    "(2) DERIVE_CONTEXT_HASH returns the vault context root",
    async () => {
      // The final DERIVE APDU blocks on the review screen — drive it concurrently.
      const rootPending = deriveContextHash(send, {
        appName: VAULT_APP_NAME,
        derivationPath: DEPOSITOR_PATH,
        context: DERIVE_CONTEXT,
      });
      rootPending.catch(() => undefined); // handled at the await below
      const deriveScreens = await approveOnScreen(SPECULOS_URL, DERIVE_APPROVAL_TEXT);
      contextRoot = await rootPending;
      expect(contextRoot).toHaveLength(32);
      // NB: never log the context root, sighash or signature — CLAUDE.md #7
      // ("never log payload bytes") is unconditional here, and this suite can
      // be pointed at a real device. Assertions below pin the values instead.
      console.log(`[speculos-e2e] derive screens: ${deriveScreens.join(" || ")}`);
    },
    CEREMONY_TIMEOUT_MS,
  );

  it(
    "(3) reads the policy context and builds the Pre-PegIn the intent will bind to",
    async () => {
      expect(contextRoot, "derive stage must have produced a root").toBeDefined();
      masterFingerprintHex = await getMasterFingerprintHex(send);
      const accountXpub = await getExtendedPublicKey(
        send,
        DEPOSITOR_PATH.slice(0, ACCOUNT_PATH_LEVELS),
        TESTNET_VERSIONS,
      );
      policy = buildDefaultTaprootPolicy({
        masterFingerprintHex,
        coinType: POLICY_COIN_TYPE,
        accountIndex: POLICY_ACCOUNT_INDEX,
        accountXpub,
        bip32Versions: TESTNET_VERSIONS,
      });
      changeXOnly = deriveChangeXOnlyHex(accountXpub, TESTNET_VERSIONS, CHANGE_ADDRESS_INDEX);
      prePegin = buildPrePeginPsbt(vaultHashlock(contextRoot as Uint8Array, HTLC_VOUT), changeXOnly);
      expect(prePegin.txidInternal).toHaveLength(32);
    },
    SANITY_TIMEOUT_MS,
  );

  it(
    "(4) APPROVE_VAULT_INTENT accepts terms bound to that Pre-PegIn txid",
    async () => {
      expect(prePegin, "policy-context stage must have built the Pre-PegIn").toBeDefined();
      const terms = buildDepositTerms((prePegin as PrePeginPsbtFixture).txidInternal);
      // The envelope gate must accept these terms with zero device I/O.
      assertDepositTermsDeviceCompatible(terms);
      const intent = termsToIntent(terms);
      // Byte-order seam: display-order terms txid maps to the internal-order
      // prevout the PSBT carries and the firmware compares against.
      expect(
        Buffer.from(intent.scalars.prepeginTxidInternal).equals((prePegin as PrePeginPsbtFixture).txidInternal),
      ).toBe(true);

      // Scalars and group APDUs answer immediately; the final key batch blocks
      // on the intent review screen — drive it concurrently.
      await waitForIdleScreen();
      const approvePending = approveVaultIntent(send, intent);
      approvePending.catch(() => undefined); // handled at the await below
      const intentScreens = await approveOnScreen(SPECULOS_URL, INTENT_APPROVAL_TEXT);
      await approvePending;
      console.log(`[speculos-e2e] intent screens: ${intentScreens.join(" || ")}`);
    },
    CEREMONY_TIMEOUT_MS,
  );

  it(
    "(5) rejects a Pre-PegIn whose change output carries no derivation (not internal) without dropping the intent",
    async () => {
      expect(prePegin, "policy-context stage must have built the Pre-PegIn").toBeDefined();
      const unmarkedChange = augmentPsbtForWalletPolicy({
        psbtHex: (prePegin as PrePeginPsbtFixture).psbtHex,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        walletPolicy: policy as DefaultTaprootWalletPolicy,
        depositorPath: DEPOSITOR_PATH,
        // no `change` → the change output is external on-device → `_validate_prepegin`
        // catch-all reject (`sign_psbt_validate.c:507-510`), before the txid/cap checks.
      });
      const prepared = prepareSignPsbt({
        psbtHex: unmarkedChange,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        walletPolicy: policy as DefaultTaprootWalletPolicy,
      });
      const failure = await signPreparedVaultPsbt(sendRaw, prepared, {
        signal: AbortSignal.timeout(SIGNING_ABORT_MS),
      }).then(
        () => null,
        (error: unknown) => error,
      );
      // A terminal status word from the loop is classified into LedgerDeviceError
      // (`rawApdu.ts classifyStatusWord`, `signPsbtLoop.ts:159-171`).
      expect(isLedgerDeviceError(failure)).toBe(true);
      expect((failure as { statusWord: number }).statusWord).toBe(SW_INCORRECT_DATA);
      // Session and intent survive a validation failure: the next stage signs
      // the same Pre-PegIn under the same intent.
      expect(await getMasterFingerprintHex(send)).toBe(masterFingerprintHex);
    },
    SIGNING_TIMEOUT_MS,
  );

  it(
    "(6) signs the toolkit-shaped Pre-PegIn under the default policy — one key-path yield per input, each verifiable",
    async () => {
      expect(prePegin, "policy-context stage must have built the Pre-PegIn").toBeDefined();
      const psbtFixture = prePegin as PrePeginPsbtFixture;
      const augmented = augmentPsbtForWalletPolicy({
        psbtHex: psbtFixture.psbtHex,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        walletPolicy: policy as DefaultTaprootWalletPolicy,
        depositorPath: DEPOSITOR_PATH,
        change: { addressIndex: CHANGE_ADDRESS_INDEX },
      });
      const prepared = prepareSignPsbt({
        psbtHex: augmented,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        walletPolicy: policy as DefaultTaprootWalletPolicy,
      });
      expect(prepared.table.expectedYieldCount).toBe(2);
      // Pre-PegIn is silent on-device (no review screen) — no approveOnScreen here.
      const result = await signPreparedVaultPsbt(sendRaw, prepared, {
        signal: AbortSignal.timeout(SIGNING_ABORT_MS),
      });
      expect(result.yields).toHaveLength(2);

      const depositorSpk = bip86OutputScript(DEPOSITOR_XONLY_HEX);
      const tx = Transaction.fromBuffer(Psbt.fromHex(psbtFixture.psbtHex).data.globalMap.unsignedTx.toBuffer());
      for (const y of result.yields) {
        expect(y.kind).toBe("taproot-keypath");
        expect(y.signature).toHaveLength(SCHNORR_SIG_BYTES);
        const sighash = tx.hashForWitnessV1(
          y.inputIndex,
          [depositorSpk, depositorSpk],
          [PREPEGIN_INPUT_VALUE_SATS, PREPEGIN_INPUT_VALUE_SATS],
          Transaction.SIGHASH_DEFAULT,
        );
        expect(
          verifySchnorrSignature(
            sighash,
            depositorSpk.subarray(P2TR_WITNESS_PROGRAM_OFFSET).toString("hex"),
            y.signature,
          ),
        ).toBe(true);
      }
    },
    SIGNING_TIMEOUT_MS,
  );

  it(
    "(7) signVaultPsbt signs the PegIn PSBT on the device",
    async () => {
      expect(contextRoot, "derive stage must have produced a root").toBeDefined();
      expect(prePegin, "policy-context stage must have built the Pre-PegIn").toBeDefined();
      const hashlock = vaultHashlock(contextRoot as Uint8Array, HTLC_VOUT);
      fixture = buildPeginPsbt(hashlock, (prePegin as PrePeginPsbtFixture).txidInternal);
      // The PegIn spends the Pre-PegIn's HTLC output — same script, same txid.
      expect(fixture.htlcScriptPubKey.equals((prePegin as PrePeginPsbtFixture).htlcScriptPubKey)).toBe(true);

      // PegIn signing is silent (fw test_sign_psbt_validate.py header) — the
      // approved intent authorizes it, so no screen driving here.
      signResult = await signVaultPsbt(sendRaw, {
        psbtHex: fixture.psbtHex,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        signal: AbortSignal.timeout(SIGNING_ABORT_MS),
      });

      expect(signResult.yields).toHaveLength(1);
      const yielded = signResult.yields[0];
      expect(yielded.kind).toBe("tapscript");
      if (yielded.kind !== "tapscript") throw new Error("unreachable");
      expect(yielded.inputIndex).toBe(0);
      expect(yielded.signerXOnlyHex).toBe(DEPOSITOR_XONLY_HEX);
      expect(yielded.leafHashHex).toBe(fixture.leaf0Hash.toString("hex"));
      expect(yielded.signature).toHaveLength(SCHNORR_SIG_BYTES);
    },
    SIGNING_TIMEOUT_MS,
  );

  it(
    "(8) the device signature verifies against the BIP-341 script-path sighash",
    () => {
      expect(fixture, "signing stage must have built the fixture").toBeDefined();
      expect(signResult, "signing stage must have produced yields").toBeDefined();
      const psbtFixture = fixture as PeginPsbtFixture;
      const yielded = (signResult as SignVaultPsbtResult).yields[0];
      if (yielded.kind !== "tapscript") throw new Error("stage (7) asserted tapscript");

      const sighash = computePeginSighash(psbtFixture.psbtHex, psbtFixture);
      const valid = verifySchnorrSignature(sighash, DEPOSITOR_XONLY_HEX, yielded.signature);
      console.log(`[speculos-e2e] verifySchnorr(depositor key): ${valid}`);
      expect(valid).toBe(true);

      // Negative control: a different message must not verify.
      const tampered = Buffer.from(sighash);
      tampered[0] ^= 0x01;
      expect(verifySchnorrSignature(tampered, DEPOSITOR_XONLY_HEX, yielded.signature)).toBe(false);
    },
    SANITY_TIMEOUT_MS,
  );

  it(
    "(9) the merged PSBT carries the tapScriptSig and finalizes",
    () => {
      expect(fixture, "signing stage must have built the fixture").toBeDefined();
      expect(signResult, "signing stage must have produced a merged PSBT").toBeDefined();
      const psbtFixture = fixture as PeginPsbtFixture;
      const result = signResult as SignVaultPsbtResult;

      const original = Psbt.fromHex(psbtFixture.psbtHex);
      const merged = Psbt.fromHex(result.signedPsbtHex);
      // Merge writes signature fields only — the unsigned tx is byte-identical.
      expect(merged.data.globalMap.unsignedTx.toBuffer().equals(original.data.globalMap.unsignedTx.toBuffer())).toBe(
        true,
      );

      const tapScriptSig = merged.data.inputs[0].tapScriptSig;
      expect(tapScriptSig).toBeDefined();
      expect(tapScriptSig).toHaveLength(1);
      const entry = (tapScriptSig ?? [])[0];
      expect(entry.pubkey.toString("hex")).toBe(DEPOSITOR_XONLY_HEX);
      expect(entry.leafHash.toString("hex")).toBe(psbtFixture.leaf0Hash.toString("hex"));
      expect(entry.signature).toHaveLength(SCHNORR_SIG_BYTES);

      // Structural finalizability: bitcoinjs accepts the script-path input and
      // assembles witness = [sig, leaf script, control block]. (Consensus
      // validity additionally needs the co-signers + preimage — out of scope.)
      merged.finalizeInput(0);
      const witness = merged.data.inputs[0].finalScriptWitness;
      expect(witness).toBeDefined();
      expect((witness ?? Buffer.alloc(0)).includes(psbtFixture.leaf0Script)).toBe(true);
      expect((witness ?? Buffer.alloc(0)).includes(psbtFixture.controlBlock)).toBe(true);
    },
    SANITY_TIMEOUT_MS,
  );

  describe("(10) PoP (BIP-322) under the default policy", () => {
    it(
      "signs a PoP while the intent is loaded and the signature verifies over the BIP-322 to_sign sighash",
      async () => {
        const popFingerprintHex = await getMasterFingerprintHex(send);
        const accountXpub = await getExtendedPublicKey(
          send,
          DEPOSITOR_PATH.slice(0, ACCOUNT_PATH_LEVELS),
          TESTNET_VERSIONS,
        );
        const popPolicy = buildDefaultTaprootPolicy({
          masterFingerprintHex: popFingerprintHex,
          coinType: POLICY_COIN_TYPE,
          accountIndex: POLICY_ACCOUNT_INDEX,
          accountXpub,
          bip32Versions: TESTNET_VERSIONS,
        });
        const psbtHex = buildPopPsbtHex({
          message: POP_MESSAGE,
          depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
          masterFingerprintHex: popFingerprintHex,
          depositorPath: DEPOSITOR_PATH,
        });
        const prepared = prepareSignPsbt({ psbtHex, depositorXOnlyHex: DEPOSITOR_XONLY_HEX, walletPolicy: popPolicy });

        // PoP is the one signing flow with a review screen — drive it concurrently.
        const approval = approveOnScreen(SPECULOS_URL, POP_APPROVAL_TEXT);
        approval.catch(() => undefined); // handled at the await below
        const result = await signPreparedVaultPsbt(sendRaw, prepared, {
          signal: AbortSignal.timeout(SIGNING_ABORT_MS),
        });
        const popScreens = await approval;
        console.log(`[speculos-e2e] pop screens: ${popScreens.join(" || ")}`);

        expect(result.yields).toHaveLength(1);
        const yielded = result.yields[0];
        expect(yielded.kind).toBe("taproot-keypath");
        expect(yielded.signature).toHaveLength(SCHNORR_SIG_BYTES);

        // Independent verification: BIP-341 key-path sighash of to_sign, checked
        // against the BIP-86 tweaked output key.
        const spk = bip86OutputScript(DEPOSITOR_XONLY_HEX);
        const tweakedKey = spk.subarray(P2TR_WITNESS_PROGRAM_OFFSET);
        const toSign = new Transaction();
        toSign.version = TO_SIGN_VERSION;
        toSign.locktime = TO_SIGN_LOCKTIME;
        const toSpendTxid = bip322ToSpendTxid(new TextEncoder().encode(POP_MESSAGE), tweakedKey);
        toSign.addInput(Buffer.from(toSpendTxid), TO_SPEND_VOUT, TO_SIGN_SEQUENCE);
        toSign.addOutput(OP_RETURN_SCRIPT, ZERO_SATS);
        const sighash = toSign.hashForWitnessV1(0, [spk], [ZERO_SATS], Transaction.SIGHASH_DEFAULT);
        // Key-path: the device signs under the TWEAKED key, and
        // verifySchnorrSignature verifies against the key as passed (no tweak).
        expect(verifySchnorrSignature(sighash, tweakedKey.toString("hex"), yielded.signature)).toBe(true);
      },
      SIGNING_TIMEOUT_MS,
    );
  });

  describe("(11) depositor-graph presign (Payout + NoPayout) under the loaded intent", () => {
    let graph: DepositorGraphFixture | undefined;

    it(
      "builds the graph fixture with the production SDK builders, bound to the signed PegIn",
      async () => {
        expect(fixture, "PegIn stage must have built its fixture").toBeDefined();
        const peginTxHex = Transaction.fromBuffer(
          Psbt.fromHex((fixture as PeginPsbtFixture).psbtHex).data.globalMap.unsignedTx.toBuffer(),
        ).toHex();
        graph = await buildDepositorGraphFixture(peginTxHex);
        expect(graph.perChallenger).toHaveLength(DEPOSITOR_GRAPH_CHALLENGER_COUNT);
      },
      SANITY_TIMEOUT_MS,
    );

    it(
      "Payout: the device yields ONE signature (input 0, Vault-UTXO leaf) — the host table also expects input 1, pinning the completion gap",
      async () => {
        expect(graph, "fixture stage must have built the graph").toBeDefined();
        const g = graph as DepositorGraphFixture;
        const prepared = prepareSignPsbt({ psbtHex: g.payoutPsbtHex, depositorXOnlyHex: DEPOSITOR_XONLY_HEX });
        // The host table counts every leaf-carrying input (expectedSignatures.ts
        // buildExpectedSignatureTable) — inputs 0 AND 1 here…
        expect(prepared.table.expectedYieldCount).toBe(2);
        const { collector } = getPreparedSignPsbtState(prepared);
        const failure = await signPreparedVaultPsbt(sendRaw, prepared, {
          signal: AbortSignal.timeout(SIGNING_ABORT_MS),
        }).then(
          () => null,
          (error: unknown) => error,
        );
        // …but the firmware signs Payout input 0 ONLY and answers SW_OK
        // (`sign_custom_inputs.c:345-424`; fw test_sign_psbt_payout_vk asserts a
        // single sig for the depositor claimer). Input 1 belongs to the separate
        // PayoutFinalize flow. The host's set-equal completion therefore fails
        // AFTER the device signed — package gap to fix before the payout stage
        // ships; this stage pins both sides.
        expect(isLedgerSignPsbtIncompleteError(failure)).toBe(true);
        expect((failure as LedgerSignPsbtIncompleteError).missing).toEqual([`1:${g.payoutInput1LeafHashHex}`]);

        expect(collector.yields).toHaveLength(1);
        const yielded = collector.yields[0];
        expect(yielded.kind).toBe("tapscript");
        if (yielded.kind !== "tapscript") throw new Error("unreachable");
        expect(yielded.inputIndex).toBe(0);
        expect(yielded.signerXOnlyHex).toBe(DEPOSITOR_XONLY_HEX);
        expect(yielded.leafHashHex).toBe(g.payoutInput0LeafHashHex);
        expect(yielded.signature).toHaveLength(SCHNORR_SIG_BYTES);
        // Far side, via the SDK's own verifier: recompute the BIP-341
        // script-path sighash from the PSBT WE built and check the Schnorr.
        assertScriptPathSchnorrSignature({
          requestedPsbtHex: g.payoutPsbtHex,
          signatureHex: Buffer.from(yielded.signature).toString("hex"),
          signerXOnlyPubkeyHex: DEPOSITOR_XONLY_HEX,
          inputIndex: 0,
        });
      },
      SIGNING_TIMEOUT_MS,
    );

    it(
      "NoPayout, production shape (input 0 spends Assert:0 per btc-vault/HLD): rejected per challenger, intent survives — challenger 0's firmware-shaped sign succeeds with no re-ceremony (FIRMWARE DIVERGENCE PIN)",
      async () => {
        expect(graph, "fixture stage must have built the graph").toBeDefined();
        for (const challenger of (graph as DepositorGraphFixture).perChallenger) {
          const failure = await signVaultPsbt(sendRaw, {
            psbtHex: challenger.productionPsbtHex,
            depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
            signal: AbortSignal.timeout(SIGNING_ABORT_MS),
          }).then(
            () => null,
            (error: unknown) => error,
          );
          // DIVERGENCE PINNED (raise with Ledger): `_validate_nopayout` resolves
          // the vault group by matching input 0's PREVIOUS_TXID against
          // vault_compute_pegin_txid (`sign_psbt_validate.c:2196-2219`), but the
          // protocol's NoPayout spends Assert:0 (btc-vault nopayout.rs:146-155;
          // HLD v22 §4.9.8 "Prevout Assert:0"), whose txid the device cannot
          // compute — so every honest NoPayout dies here at this tip.
          expect(isLedgerDeviceError(failure)).toBe(true);
          expect((failure as { statusWord: number }).statusWord).toBe(SW_INCORRECT_DATA);
        }
        // Intent-survival proof, not a liveness probe: `_validate_nopayout` runs
        // only in VAULT_STATE_INTENT_LOADED (`sign_psbt_validate.c:2000-2003`),
        // so a completed sign under the SAME intent — no derive/intent re-run —
        // proves the rejects above left the session loaded (their SEND_SW path
        // carries no vault_context_invalidate).
        await signAndVerifyFirmwareShapedNoPayout((graph as DepositorGraphFixture).perChallenger[0]);
      },
      SIGNING_TIMEOUT_MS,
    );

    it(
      "NoPayout, firmware shape for challenger 1 (FIRMWARE DIVERGENCE PIN — non-protocol shape, input 0 prevout swapped to the PegIn txid): signs and verifies",
      async () => {
        expect(graph, "fixture stage must have built the graph").toBeDefined();
        // Challenger 0's slot was consumed by the survival proof above (per-slot
        // dedup, `sign_psbt_validate.c:2221-2234`); this completes the roster.
        await signAndVerifyFirmwareShapedNoPayout((graph as DepositorGraphFixture).perChallenger[1]);
      },
      SIGNING_TIMEOUT_MS,
    );

    /**
     * Sign the firmware-shaped NoPayout — the shape the firmware's own tests
     * build (test_sign_psbt_validate.py:2997), differing from production ONLY
     * in input 0's prevout txid. Its completing isolates the production-shape
     * rejection to the prevout routing alone: leaf, control block, witness
     * band and sink all pass. NOT an endorsed scenario: a signature over the
     * PegIn-txid prevout is unusable on the real Assert:0 (sighash commits
     * the outpoint).
     */
    async function signAndVerifyFirmwareShapedNoPayout(
      challenger: DepositorGraphFixture["perChallenger"][number],
    ): Promise<void> {
      const result = await signVaultPsbt(sendRaw, {
        psbtHex: challenger.firmwareShapedPsbtHex,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        signal: AbortSignal.timeout(SIGNING_ABORT_MS),
      });
      expect(result.yields).toHaveLength(1);
      const yielded = result.yields[0];
      expect(yielded.kind).toBe("tapscript");
      if (yielded.kind !== "tapscript") throw new Error("unreachable");
      expect(yielded.inputIndex).toBe(0);
      expect(yielded.signerXOnlyHex).toBe(DEPOSITOR_XONLY_HEX);
      expect(yielded.leafHashHex).toBe(challenger.noPayoutLeafHashHex);
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: challenger.firmwareShapedPsbtHex,
        signatureHex: Buffer.from(yielded.signature).toString("hex"),
        signerXOnlyPubkeyHex: DEPOSITOR_XONLY_HEX,
        inputIndex: 0,
      });
    }
  });

  describe("(12) SIGN_PSBT abort mid-loop: eaten APDU, consumed cap, re-ceremony recovery", () => {
    it(
      "an abort after the first yield leaves the device awaiting CONTINUE: exactly one APDU is eaten with 0x6a80",
      async () => {
        expect(prePegin, "policy-context stage must have built the Pre-PegIn").toBeDefined();
        const root = await rearmIntentCeremony();
        // Same context ⇒ same root: the re-derivation is deterministic.
        expect(Buffer.from(root).equals(Buffer.from(contextRoot as Uint8Array))).toBe(true);

        const abort = new AbortController();
        const prepared = prepareAugmentedPrePegin();
        const failure = await signPreparedVaultPsbt(sendRaw, prepared, {
          signal: abort.signal,
          onProgress: ({ yieldedCount }) => {
            // Abort BEFORE the loop sends this round's CONTINUE — the device is
            // left mid-interruption with the first signature already yielded.
            if (yieldedCount === ABORT_AFTER_YIELD_COUNT) abort.abort();
          },
        }).then(
          () => null,
          (error: unknown) => error,
        );
        expect(isLedgerSignPsbtAbortedError(failure)).toBe(true);
        expect((failure as LedgerSignPsbtAbortedError).yieldedCount).toBe(ABORT_AFTER_YIELD_COUNT);

        // Probe IMMEDIATELY — the 50-tick ≈ 5 s deadline (base:io_ext.h:28)
        // resets the app on further host silence. The dispatcher answers a
        // non-CONTINUE APDU with SW_INCORRECT_DATA and drops the interrupted
        // handler (base:dispatcher.c:107-111 @ e400d8d8): one eaten APDU…
        const eaten = await getMasterFingerprintHex(send).then(
          () => null,
          (error: unknown) => error,
        );
        expect(isLedgerDeviceError(eaten)).toBe(true);
        expect((eaten as { statusWord: number }).statusWord).toBe(SW_INCORRECT_DATA);
        // …and exactly one: the same read now answers normally.
        expect(await getMasterFingerprintHex(send)).toBe(masterFingerprintHex);
      },
      CEREMONY_TIMEOUT_MS,
    );

    it(
      "the aborted sign consumed the one-per-intent Pre-PegIn cap: the retry answers SW_CAP_EXCEEDED",
      async () => {
        // `pre_pegin_signed++` runs at the END of validation, BEFORE any yield
        // ("a failed attempt counts as used", sign_psbt_validate.c:648-656) —
        // the abort above came after yield 1, so the slot is already burnt.
        // Pins the fw-reverify delta note: recovery REQUIRES the re-ceremony.
        const failure = await signPreparedVaultPsbt(sendRaw, prepareAugmentedPrePegin(), {
          signal: AbortSignal.timeout(SIGNING_ABORT_MS),
        }).then(
          () => null,
          (error: unknown) => error,
        );
        expect(isLedgerDeviceError(failure)).toBe(true);
        expect((failure as { statusWord: number }).statusWord).toBe(SW_CAP_EXCEEDED);
      },
      SIGNING_TIMEOUT_MS,
    );

    it(
      "a full re-ceremony (derive → intent → sign) recovers: the Pre-PegIn completes with two verifiable yields",
      async () => {
        // SW_CAP_EXCEEDED nullified the session — this re-ceremony is exactly
        // T3's post-cancel recovery path, pinned here on real firmware.
        const root = await rearmIntentCeremony();
        expect(Buffer.from(root).equals(Buffer.from(contextRoot as Uint8Array))).toBe(true);

        const result = await signPreparedVaultPsbt(sendRaw, prepareAugmentedPrePegin(), {
          signal: AbortSignal.timeout(SIGNING_ABORT_MS),
        });
        expect(result.yields).toHaveLength(2);
        const depositorSpk = bip86OutputScript(DEPOSITOR_XONLY_HEX);
        const tx = Transaction.fromBuffer(
          Psbt.fromHex((prePegin as PrePeginPsbtFixture).psbtHex).data.globalMap.unsignedTx.toBuffer(),
        );
        for (const yielded of result.yields) {
          expect(yielded.kind).toBe("taproot-keypath");
          expect(yielded.signature).toHaveLength(SCHNORR_SIG_BYTES);
          const sighash = tx.hashForWitnessV1(
            yielded.inputIndex,
            [depositorSpk, depositorSpk],
            [PREPEGIN_INPUT_VALUE_SATS, PREPEGIN_INPUT_VALUE_SATS],
            Transaction.SIGHASH_DEFAULT,
          );
          expect(
            verifySchnorrSignature(
              sighash,
              depositorSpk.subarray(P2TR_WITNESS_PROGRAM_OFFSET).toString("hex"),
              yielded.signature,
            ),
          ).toBe(true);
        }
      },
      CEREMONY_TIMEOUT_MS,
    );
  });

  /** Re-run the device ceremony (derive → intent) over the same deterministic fixture; returns the re-derived root. */
  async function rearmIntentCeremony(): Promise<Uint8Array> {
    await waitForIdleScreen();
    const rootPending = deriveContextHash(send, {
      appName: VAULT_APP_NAME,
      derivationPath: DEPOSITOR_PATH,
      context: DERIVE_CONTEXT,
    });
    rootPending.catch(() => undefined); // handled at the await below
    await approveOnScreen(SPECULOS_URL, DERIVE_APPROVAL_TEXT);
    const root = await rootPending;

    const terms = buildDepositTerms((prePegin as PrePeginPsbtFixture).txidInternal);
    const intent = termsToIntent(terms);
    await waitForIdleScreen();
    const approvePending = approveVaultIntent(send, intent);
    approvePending.catch(() => undefined); // handled at the await below
    await approveOnScreen(SPECULOS_URL, INTENT_APPROVAL_TEXT);
    await approvePending;
    return root;
  }

  /** Stage-6-shaped Pre-PegIn (change marked internal), freshly prepared — prepared objects are single-use. */
  function prepareAugmentedPrePegin(): PreparedSignPsbt {
    const augmented = augmentPsbtForWalletPolicy({
      psbtHex: (prePegin as PrePeginPsbtFixture).psbtHex,
      depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
      walletPolicy: policy as DefaultTaprootWalletPolicy,
      depositorPath: DEPOSITOR_PATH,
      change: { addressIndex: CHANGE_ADDRESS_INDEX },
    });
    return prepareSignPsbt({
      psbtHex: augmented,
      depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
      walletPolicy: policy as DefaultTaprootWalletPolicy,
    });
  }

  /** Best-effort settle back to the dashboard between the ceremony's two approval flows. */
  async function waitForIdleScreen(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const screen = await readScreenText(SPECULOS_URL);
      if (screen.includes("app is ready")) return;
      await sleep(150);
    }
  }
});
