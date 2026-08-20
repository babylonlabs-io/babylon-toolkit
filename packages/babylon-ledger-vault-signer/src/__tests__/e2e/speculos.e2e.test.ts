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
 *   10. BIP-322 PoP, last, so it signs while the intent is still loaded — the
 *       path that exercises the firmware's intent-key check
 *       (`sign_psbt_validate.c:2764-2769`).
 *
 * Stage 5 MUST precede stage 6: a successful Pre-PegIn sign arms the one-shot
 * cap and the next one answers SW_CAP_EXCEEDED (`sign_psbt_validate.c:539-543`).
 *
 * Requires a running container with the vault app (nanosp, testnet build,
 * firmware-test mnemonic) built from ELF commit `e2d0c45b`. Skipped unless
 * SPECULOS_URL is set:
 *
 *   SPECULOS_URL=http://127.0.0.1:5055 pnpm exec vitest run src/__tests__/e2e/
 *
 * Each run re-runs the full ceremony, so the container does not need restarting
 * between runs.
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { getExtendedPublicKey, getMasterFingerprintHex } from "../../derivation";
import { assertDepositTermsDeviceCompatible } from "../../envelope";
import { isLedgerDeviceError } from "../../errors";
import { bip86OutputScript } from "../../expectedSignatures";
import { augmentPsbtForWalletPolicy, deriveChangeXOnlyHex } from "../../policyPsbt";
import { bip322ToSpendTxid, buildPopPsbtHex } from "../../popPsbt";
import { signPreparedVaultPsbt, signVaultPsbt, type SignVaultPsbtResult } from "../../signPsbt";
import { prepareSignPsbt } from "../../signPsbtPrepare";
import { approveVaultIntent, deriveContextHash } from "../../vaultCommands";
import { buildDefaultTaprootPolicy, type DefaultTaprootWalletPolicy } from "../../walletPolicy";
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

/** SW_INCORRECT_DATA — `_validate_prepegin`'s catch-all output reject (`sign_psbt_validate.c:507-510`). */
const SW_INCORRECT_DATA = 0x6a80;

/** `<eth>:<chainId>:pegin:<registry>` — grammar is the device's boundary, not ours. */
const POP_MESSAGE =
  "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678";
/** The policy's key origin is DEPOSITOR_PATH's account prefix, m/86'/1'/0'. */
const ACCOUNT_PATH_LEVELS = 3;
const POLICY_COIN_TYPE = 1;
const POLICY_ACCOUNT_INDEX = 0;
/** Change lives at `account/1/0` — BIP-86 change branch, first address. */
const BIP86_CHANGE_BRANCH = 1;
const CHANGE_ADDRESS_INDEX = 0;

/**
 * BIP-322 to_sign shape, restated rather than imported from `popPsbt.ts` so the
 * verification below is independent of the builder under test.
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
        masterFingerprintHex: masterFingerprintHex as string,
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
        masterFingerprintHex: masterFingerprintHex as string,
        depositorPath: DEPOSITOR_PATH,
        change: {
          xOnlyHex: changeXOnly as string,
          path: [...DEPOSITOR_PATH.slice(0, ACCOUNT_PATH_LEVELS), BIP86_CHANGE_BRANCH, CHANGE_ADDRESS_INDEX],
        },
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
