/**
 * Speculos end-to-end signing test (#2219 B2): the full production path —
 * envelope gate → DERIVE_CONTEXT_HASH → APPROVE_VAULT_INTENT → signVaultPsbt —
 * against the real vault app in a Speculos container, ending in cryptographic
 * verification of the device's Schnorr signature.
 *
 * Requires a running container with the vault app (nanosp, testnet build,
 * firmware-test mnemonic). Skipped unless SPECULOS_URL is set:
 *
 *   SPECULOS_URL=http://127.0.0.1:5055 pnpm exec vitest run src/__tests__/e2e/
 *
 * The suite is stateful and ordered: the ceremony arms the device state the
 * signing stage consumes. Each run re-runs the full ceremony, so the container
 * does not need restarting between runs.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { assertDepositTermsDeviceCompatible } from "../../envelope";
import { signVaultPsbt, type SignVaultPsbtResult } from "../../signPsbt";
import { approveVaultIntent, deriveContextHash } from "../../vaultCommands";
import {
  buildDepositTerms,
  buildPeginPsbt,
  computePeginSighash,
  DEPOSITOR_PATH,
  DEPOSITOR_XONLY_HEX,
  DERIVE_CONTEXT,
  HTLC_VOUT,
  PREPEGIN_TXID_INTERNAL,
  termsToIntent,
  VAULT_APP_NAME,
  vaultHashlock,
  verifySchnorrSignature,
  type PeginPsbtFixture,
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

/** Ceremony = APDUs + human-speed screen navigation; signing = ~40 APDU rounds. */
const CEREMONY_TIMEOUT_MS = 120_000;
const SIGNING_TIMEOUT_MS = 60_000;
const SANITY_TIMEOUT_MS = 30_000;

const SCHNORR_SIG_BYTES = 64;

describe.skipIf(SPECULOS_URL === "")("Speculos end-to-end vault signing", () => {
  const sendRaw = createSpeculosRawApduSender(SPECULOS_URL);
  const send = createSpeculosApduSender(SPECULOS_URL);

  // Ordered stages share state; a later stage failing on `undefined` means an
  // earlier stage failed first — read its failure, not this one.
  let contextRoot: Uint8Array | undefined;
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
    "(2) ceremony: envelope gate, DERIVE_CONTEXT_HASH, APPROVE_VAULT_INTENT via the production encoders",
    async () => {
      const terms = buildDepositTerms();
      // The envelope gate must accept these terms with zero device I/O.
      assertDepositTermsDeviceCompatible(terms);
      const intent = termsToIntent(terms);
      // Byte-order seam: display-order terms txid maps to the internal-order
      // prevout the PSBT carries and the firmware compares against.
      expect(Buffer.from(intent.scalars.prepeginTxidInternal).equals(PREPEGIN_TXID_INTERNAL)).toBe(true);

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
      console.log(`[speculos-e2e] derive screens: ${deriveScreens.join(" || ")}`);
      console.log(`[speculos-e2e] context root: ${Buffer.from(contextRoot).toString("hex")}`);

      // Scalars and group APDUs answer immediately; the final key batch blocks
      // on the intent review screen — drive it concurrently too.
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
    "(3) signVaultPsbt signs the PegIn PSBT on the device",
    async () => {
      expect(contextRoot, "ceremony stage must have produced a root").toBeDefined();
      const hashlock = vaultHashlock(contextRoot as Uint8Array, HTLC_VOUT);
      fixture = buildPeginPsbt(hashlock);

      // PegIn signing is silent (fw test_sign_psbt_validate.py header) — the
      // approved intent authorizes it, so no screen driving here.
      // Shorter than the test timeout so the typed abort surfaces first.
      signResult = await signVaultPsbt(sendRaw, {
        psbtHex: fixture.psbtHex,
        depositorXOnlyHex: DEPOSITOR_XONLY_HEX,
        signal: AbortSignal.timeout(SIGNING_TIMEOUT_MS - 10_000),
      });

      expect(signResult.yields).toHaveLength(1);
      const yielded = signResult.yields[0];
      expect(yielded.kind).toBe("tapscript");
      if (yielded.kind !== "tapscript") throw new Error("unreachable");
      expect(yielded.inputIndex).toBe(0);
      expect(yielded.signerXOnlyHex).toBe(DEPOSITOR_XONLY_HEX);
      expect(yielded.leafHashHex).toBe(fixture.leaf0Hash.toString("hex"));
      expect(yielded.signature).toHaveLength(SCHNORR_SIG_BYTES);
      console.log(`[speculos-e2e] schnorr signature: ${Buffer.from(yielded.signature).toString("hex")}`);
    },
    SIGNING_TIMEOUT_MS,
  );

  it(
    "(4) the device signature verifies against the BIP-341 script-path sighash",
    () => {
      expect(fixture, "signing stage must have built the fixture").toBeDefined();
      expect(signResult, "signing stage must have produced yields").toBeDefined();
      const psbtFixture = fixture as PeginPsbtFixture;
      const yielded = (signResult as SignVaultPsbtResult).yields[0];
      if (yielded.kind !== "tapscript") throw new Error("stage (3) asserted tapscript");

      const sighash = computePeginSighash(psbtFixture.psbtHex, psbtFixture);
      const valid = verifySchnorrSignature(sighash, DEPOSITOR_XONLY_HEX, yielded.signature);
      console.log(`[speculos-e2e] sighash: ${sighash.toString("hex")}`);
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
    "(5) the merged PSBT carries the tapScriptSig and finalizes",
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

  /** Best-effort settle back to the dashboard between the two approval flows. */
  async function waitForIdleScreen(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const screen = await readScreenText(SPECULOS_URL);
      if (screen.includes("app is ready")) return;
      await sleep(150);
    }
  }
});
