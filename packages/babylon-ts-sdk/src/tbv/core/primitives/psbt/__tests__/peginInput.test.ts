/**
 * Tests for extractPeginInputSignature sighash validation
 *
 * Verifies that the signature extraction correctly validates sighash types,
 * accepting implicit SIGHASH_DEFAULT (64-byte sig) while rejecting signatures
 * with appended sighash bytes. Per BIP-341, the sighash byte changes the
 * Taproot message, so it must not be stripped.
 */

import { Buffer } from "buffer";

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { fundPeginTransaction } from "../../../utils/transaction/fundPeginTransaction";
import * as wasmFacade from "../../../wasm";
import { deriveExpectedPrePeginHtlc } from "../assertWasmPeginSizing";
import {
  buildPeginTxFromFundedPrePegin,
  buildPrePeginPsbt,
  type PrePeginParams,
} from "../pegin";
import {
  buildPeginInputPsbt,
  extractPeginInputSignature,
  extractSchnorrSig,
} from "../peginInput";
import {
  NULL_TXID,
  TEST_WITNESS_UTXO_VALUE,
  createDummyP2WPKH,
} from "./constants";
import { TEST_AMOUNTS, TEST_KEYS, initializeWasmForTests } from "./helpers";

/**
 * Creates a PSBT with a tapScriptSig entry for testing signature extraction.
 */
function createPsbtWithSignature(signature: Buffer): string {
  const psbt = new Psbt();
  psbt.addInput({
    hash: NULL_TXID,
    index: 0,
    witnessUtxo: {
      script: createDummyP2WPKH("0"),
      value: TEST_WITNESS_UTXO_VALUE,
    },
    tapScriptSig: [
      {
        pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
        signature,
        leafHash: Buffer.alloc(32, 0),
      },
    ],
  });
  return psbt.toHex();
}

describe("extractPeginInputSignature — sighash validation", () => {
  it("accepts 64-byte signature (implicit SIGHASH_DEFAULT)", () => {
    const signature64 = Buffer.alloc(64, 0xaa);
    const psbtHex = createPsbtWithSignature(signature64);

    const extracted = extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR);

    expect(extracted).toBe(signature64.toString("hex"));
    expect(extracted.length).toBe(128);
  });

  it("rejects 65-byte signature with explicit SIGHASH_DEFAULT (0x00) — consensus-invalid per BIP-342", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] = 0x00;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash byte 0x00 in PegIn input signature\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
    );
  });

  it("rejects 65-byte signature with SIGHASH_ALL (0x01)", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xcc, 0, 64);
    signature65[64] = Transaction.SIGHASH_ALL;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash byte 0x01 in PegIn input signature\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
    );
  });

  it("rejects 65-byte signature with SIGHASH_NONE (0x02)", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] = Transaction.SIGHASH_NONE;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash byte 0x02 in PegIn input signature\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
    );
  });

  it("rejects 65-byte signature with SIGHASH_SINGLE|ANYONECANPAY (0x83)", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] =
      Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash byte 0x83 in PegIn input signature\. Expected implicit SIGHASH_DEFAULT as a 64-byte signature\./,
    );
  });

  it("rejects signature with wrong length (63 bytes)", () => {
    const signature63 = new Uint8Array(63).fill(0xaa);

    expect(() => extractSchnorrSig(signature63)).toThrow(
      /Unexpected PegIn input signature length: 63/,
    );
  });

  it("rejects signature with wrong length (66 bytes)", () => {
    const signature66 = new Uint8Array(66).fill(0xaa);

    expect(() => extractSchnorrSig(signature66)).toThrow(
      /Unexpected PegIn input signature length: 66/,
    );
  });
});

describe("buildPeginInputPsbt — HTLC taptree merkle root", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  // Real keypair so the wallet-engine signing test can produce a Schnorr sig
  // over the hashlock leaf (the depositor key appears in that script).
  const DEPOSITOR_PRIVKEY = Buffer.alloc(32, 7);
  const DEPOSITOR_XONLY = Buffer.from(
    ecc.xOnlyPointFromScalar(DEPOSITOR_PRIVKEY),
  ).toString("hex");

  const HASHLOCK = "ab".repeat(32);
  const TIMELOCK_REFUND = 50;
  const TIMELOCK_PEGIN = 100;

  function prePeginParams(): PrePeginParams {
    return {
      vaultCoreVersion: 1,
      depositorPubkey: DEPOSITOR_XONLY,
      vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
      vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
      universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
      hashlocks: [HASHLOCK],
      timelockRefund: TIMELOCK_REFUND,
      pegInAmounts: [TEST_AMOUNTS.PEGIN],
      feeRate: 10n,
      minPeginFeeRate: 10n,
      numLocalChallengers: 1,
      councilQuorum: 2,
      councilSize: 3,
      network: "signet" as Network,
    };
  }

  async function buildFixture() {
    const params = prePeginParams();
    const prePegin = await buildPrePeginPsbt(params);
    const fundedPrePeginTxHex = fundPeginTransaction({
      unfundedTxHex: prePegin.psbtHex,
      selectedUTXOs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          value: Number(prePegin.totalOutputValue + 10_000n),
          scriptPubKey: "0014" + "bb".repeat(20),
        },
      ],
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10_000n,
      network: networks.testnet,
    });
    const pegin = await buildPeginTxFromFundedPrePegin({
      prePeginParams: params,
      timelockPegin: TIMELOCK_PEGIN,
      fundedPrePeginTxHex,
      htlcVout: 0,
    });
    const built = await buildPeginInputPsbt({
      vaultCoreVersion: 1,
      peginTxHex: pegin.txHex,
      fundedPrePeginTxHex,
      depositorPubkey: DEPOSITOR_XONLY,
      vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
      vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
      universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
      hashlock: HASHLOCK,
      timelockRefund: TIMELOCK_REFUND,
      network: "signet" as Network,
    });
    return { built, fundedPrePeginTxHex, pegin };
  }

  it("sets a 32-byte tapMerkleRoot consistent with the control block", async () => {
    const { built } = await buildFixture();
    const psbt = Psbt.fromHex(built.psbtHex);
    // bitcoinjs's checkIfTapLeafInTree verified control-block consistency at
    // addInput time; here we pin that the field is present for the device.
    expect(psbt.data.inputs[0].tapMerkleRoot).toHaveLength(32);
    expect(psbt.data.inputs[0].tapLeafScript).toHaveLength(1);
  });

  it("still signs script-path with tapMerkleRoot present (wallet-engine parity)", async () => {
    // Signs via the same bitcoinjs engine our Keystone adapter uses (and
    // that UniSat's wallet-sdk wraps per its published source); closed-source
    // wallets are covered by the real-wallet parity matrix, not this test.
    const { built } = await buildFixture();
    const psbt = Psbt.fromHex(built.psbtHex);
    const signer = {
      publicKey: Buffer.concat([
        Buffer.from([0x02]),
        Buffer.from(DEPOSITOR_XONLY, "hex"),
      ]),
      sign: () => {
        throw new Error("ecdsa sign must not be called for taproot");
      },
      signSchnorr: (hash: Buffer) =>
        Buffer.from(ecc.signSchnorr(hash, DEPOSITOR_PRIVKEY)),
    };
    psbt.signTaprootInput(0, signer);
    const sigs = psbt.data.inputs[0].tapScriptSig;
    expect(sigs).toBeDefined();
    expect(sigs![0].signature).toHaveLength(64);
  });

  it("uses canonical signing data when the WASM facade returns forged connector data", async () => {
    const params = prePeginParams();
    const expected = deriveExpectedPrePeginHtlc(params, HASHLOCK);
    const forgedHashlockScript = "51";
    const forgedHashlockControlBlock = "c0" + "11".repeat(32) + "22".repeat(32);
    const connectorSpy = vi
      .spyOn(wasmFacade, "getPrePeginHtlcConnectorInfo")
      .mockResolvedValue({
        hashlockScript: forgedHashlockScript,
        hashlockControlBlock: forgedHashlockControlBlock,
        refundScript: "52",
        refundControlBlock: "c0" + "33".repeat(32) + "44".repeat(32),
        address: "tb1pforged",
        scriptPubKey: "5120" + "55".repeat(32),
      });

    try {
      const { built } = await buildFixture();
      const psbt = Psbt.fromHex(built.psbtHex);
      const input = psbt.data.inputs[0];
      const leaf = input.tapLeafScript?.[0];

      expect(connectorSpy).toHaveBeenCalledOnce();
      expect(leaf?.script).toEqual(expected.hashlockScript);
      expect(leaf?.controlBlock).toEqual(expected.hashlockControlBlock);
      expect(input.tapMerkleRoot).toEqual(expected.tapMerkleRoot);
      expect(leaf?.script.toString("hex")).not.toBe(forgedHashlockScript);
      expect(leaf?.controlBlock.toString("hex")).not.toBe(
        forgedHashlockControlBlock,
      );

      const signer = {
        publicKey: Buffer.concat([
          Buffer.from([0x02]),
          Buffer.from(DEPOSITOR_XONLY, "hex"),
        ]),
        sign: () => {
          throw new Error("ecdsa sign must not be called for taproot");
        },
        signSchnorr: (hash: Buffer) =>
          Buffer.from(ecc.signSchnorr(hash, DEPOSITOR_PRIVKEY)),
      };
      psbt.signTaprootInput(0, signer);
      expect(psbt.data.inputs[0].tapScriptSig?.[0].signature).toHaveLength(64);
    } finally {
      connectorSpy.mockRestore();
    }
  });

  it("refuses to sign when the connector params do not reproduce the funded HTLC scriptPubKey", async () => {
    // A byte-tampered funded tx is already caught earlier by the txid
    // binding; the taptree check guards the other failure mode — connector
    // params (here: a different hashlock) that derive a tree the funded
    // HTLC output does not commit to.
    const { fundedPrePeginTxHex, pegin } = await buildFixture();
    await expect(
      buildPeginInputPsbt({
        vaultCoreVersion: 1,
        peginTxHex: pegin.txHex,
        fundedPrePeginTxHex,
        depositorPubkey: DEPOSITOR_XONLY,
        vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
        vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
        universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
        hashlock: "cd".repeat(32),
        timelockRefund: TIMELOCK_REFUND,
        network: "signet" as Network,
      }),
    ).rejects.toThrow(/HTLC taptree mismatch/);
  });
});
