/**
 * The wallet-PSBT trust boundary, exercised through the real service.
 *
 * The sibling suite mocks every primitive so it can test orchestration, and the primitives suite
 * tests the finalizer directly. Neither shows what happens when a wallet returns a PSBT the service
 * did not build — which is the only thing standing between a signed reclaim and a broadcast that
 * cannot confirm.
 *
 * So this file mocks nothing below the service except the vault-id derivation (async WASM). A real
 * PegIn, a real PSBT, a real BIP-340 signature, and a `signPsbt` that behaves like a wallet which
 * adds a key-path signature on the way back.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import { deriveDepositorClaimDescriptor } from "../../../primitives/psbt/depositorClaim";
import { computeTapLeafHash } from "../../../primitives/utils/taproot";
import { buildAndBroadcastReclaim } from "../buildAndBroadcastReclaim";

const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const DEPOSITOR_ETH = `0x${"33".repeat(20)}` as Address;

// The vault-id bind goes through WASM, which these tests do not need to exercise — the golden
// vector for that derivation lives in `primitives/__tests__/deriveVaultId.test.ts`.
// Mocked at the lazy WASM boundary the service imports, not at the engine package.
vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  // Literal, not the VAULT_ID constant: `vi.mock` factories are hoisted above it.
  deriveVaultId: vi.fn().mockResolvedValue(`0x${"aa".repeat(32)}`),
}));

const DEPOSITOR_PRIV = Buffer.alloc(32, 5);
const DEPOSITOR_XONLY = Buffer.from(
  ecc.xOnlyPointFromScalar(DEPOSITOR_PRIV),
).toString("hex");

const CLAIM_VALUE = 33_000n;

/** A PegIn shaped like the real one: vault output at vout 0, the reserve at vout 1. */
function makePeginTxHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 9), 0);
  tx.addOutput(
    Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 1)]),
    500_000,
  );
  tx.addOutput(
    deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).scriptPubKey,
    Number(CLAIM_VALUE),
  );
  return tx.toHex();
}

/** Genuine BIP-340 script-path signature over input 0 of `psbtHex`. */
function signInput0(psbtHex: string): string {
  const psbt = Psbt.fromHex(psbtHex);
  const leaf = psbt.data.inputs[0].tapLeafScript![0];

  const tx = new Transaction();
  tx.version = psbt.version;
  tx.locktime = psbt.locktime;
  for (const input of psbt.txInputs) {
    tx.addInput(input.hash, input.index, input.sequence);
  }
  for (const output of psbt.txOutputs) {
    tx.addOutput(output.script, output.value);
  }

  const sighash = tx.hashForWitnessV1(
    0,
    psbt.data.inputs.map((i) => i.witnessUtxo!.script),
    psbt.data.inputs.map((i) => i.witnessUtxo!.value),
    Transaction.SIGHASH_DEFAULT,
    computeTapLeafHash(leaf.leafVersion, leaf.script),
  );

  return Buffer.from(ecc.signSchnorr(sighash, DEPOSITOR_PRIV)).toString("hex");
}

function makeInput(signPsbt: (psbtHex: string) => Promise<string>) {
  const peginTxHex = makePeginTxHex();
  const { scriptPubKey } = deriveDepositorClaimDescriptor(DEPOSITOR_XONLY);
  return {
    vaultIds: [VAULT_ID],
    depositorEthAddress: DEPOSITOR_ETH,
    depositorBtcPubkey: DEPOSITOR_XONLY,
    readVaults: async () => [
      {
        depositorSignedPeginTxHex: peginTxHex,
        observed: {
          txid: Transaction.fromHex(peginTxHex).getId(),
          vout: 1,
          scriptPubKey: scriptPubKey.toString("hex"),
          value: CLAIM_VALUE,
        },
        expectedClaimValue: CLAIM_VALUE,
      },
    ],
    feeRate: 5,
    signPsbt,
    broadcastTx: async (signedTxHex: string) => ({ txId: signedTxHex }),
  };
}

describe("buildAndBroadcastReclaim — wallet PSBT boundary", () => {
  it("broadcasts a script-path witness even when the wallet adds a key-path signature", async () => {
    // bitcoinjs checks key spend first, so a service that finalized the returned PSBT would emit a
    // one-element key-path witness against the NUMS internal key — consensus-invalid, and rejected
    // at relay after the depositor had already approved the prompt.
    const signPsbt = async (psbtHex: string): Promise<string> => {
      const signature = signInput0(psbtHex);
      const returned = Psbt.fromHex(psbtHex);
      const leaf = returned.data.inputs[0].tapLeafScript![0];
      returned.updateInput(0, {
        tapKeySig: Buffer.alloc(64, 0xff),
        tapScriptSig: [
          {
            pubkey: Buffer.from(DEPOSITOR_XONLY, "hex"),
            leafHash: computeTapLeafHash(leaf.leafVersion, leaf.script),
            signature: Buffer.from(signature, "hex"),
          },
        ],
      });
      return returned.toHex();
    };

    const { txId: signedTxHex } = await buildAndBroadcastReclaim(
      makeInput(signPsbt),
    );

    const witness = Transaction.fromHex(signedTxHex).ins[0].witness;
    expect(witness).toHaveLength(3);
    expect(Buffer.from(witness[1])).toEqual(
      deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).leafScript,
    );
    expect(Buffer.from(witness[2])).toEqual(
      deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).controlBlock,
    );
  });

  it("broadcasts a script-path witness when the wallet rewrites the leaf it signed under", async () => {
    // `assertPsbtUnsignedTxMatches` deliberately skips per-input metadata, so a returned PSBT can
    // carry any tapLeafScript it likes. Ours is the only one that reaches the witness.
    const signPsbt = async (psbtHex: string): Promise<string> => {
      const signature = signInput0(psbtHex);
      const returned = Psbt.fromHex(psbtHex);
      const leaf = returned.data.inputs[0].tapLeafScript![0];
      returned.updateInput(0, {
        tapScriptSig: [
          {
            pubkey: Buffer.from(DEPOSITOR_XONLY, "hex"),
            leafHash: computeTapLeafHash(leaf.leafVersion, leaf.script),
            signature: Buffer.from(signature, "hex"),
          },
        ],
      });
      // Swap in a foreign leaf and control block alongside the real one.
      returned.data.inputs[0].tapLeafScript = [
        {
          leafVersion: leaf.leafVersion,
          script: Buffer.concat([
            Buffer.from([0x20]),
            Buffer.alloc(32, 0xee),
            Buffer.from([0xac]),
          ]),
          controlBlock: Buffer.concat([
            Buffer.from([leaf.controlBlock[0]]),
            Buffer.alloc(32, 0xdd),
          ]),
        },
      ];
      return returned.toHex();
    };

    const { txId: signedTxHex } = await buildAndBroadcastReclaim(
      makeInput(signPsbt),
    );

    expect(Buffer.from(Transaction.fromHex(signedTxHex).ins[0].witness[1])).toEqual(
      deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).leafScript,
    );
  });
});
