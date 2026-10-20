/**
 * The wallet-PSBT trust boundary of the PegIn signature, exercised through the real `preparePegin`.
 *
 * `PeginManager.test.ts` mocks the PegIn primitives so it can test orchestration. Neither it nor the
 * primitive suites show what reaches `depositorSignedPeginTx` when a wallet returns a valid
 * signature inside a PSBT carrying fields we did not build — and nothing downstream checks that
 * witness before the Pre-PegIn is broadcast.
 *
 * So this file mocks nothing: real WASM, real PSBTs, a real BIP-340 signature, and a `signPsbt`
 * that behaves like a wallet which adds something on the way back.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Chain, PublicClient } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { MockBitcoinWallet, MockEthereumWallet } from "../../../../testing";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { deriveTaprootAddress } from "../../primitives";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import { computeTapLeafHash } from "../../primitives/utils/taproot";
import type { UTXO } from "../../utils";
import { PeginManager } from "../PeginManager";

const TEST_CHAIN: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.org"] } },
};

/** `preparePegin` reads nothing from Ethereum; only the register methods use the client. */
const UNUSED_PUBLIC_CLIENT = {} as PublicClient;

/** Privkey 1: its x-only pubkey is `DEPOSITOR` (the generator's x coordinate). */
const DEPOSITOR_PRIV = Buffer.from(`${"00".repeat(31)}01`, "hex");

const TEST_KEYS = {
  DEPOSITOR: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  VAULT_PROVIDER:
    "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  VAULT_KEEPER_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  UNIVERSAL_CHALLENGER_1:
    "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
} as const;

const TEST_UTXOS: UTXO[] = [
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000001",
    vout: 0,
    value: 800_000,
    scriptPubKey: `5120${TEST_KEYS.DEPOSITOR}`,
  },
];

const PARAMS = {
  vaultCoreVersion: 1,
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
  universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
  timelockPegin: 100,
  timelockAssert: 150,
  timelockRefund: 144,
  protocolFeeRate: 3n,
  minPeginFeeRate: 7n,
  mempoolFeeRate: 10,
  councilQuorum: 2,
  councilSize: 3,
  availableUTXOs: TEST_UTXOS,
  changeAddress: deriveTaprootAddress(TEST_KEYS.DEPOSITOR, "signet"),
  commissionBps: 250,
} as const;

/** What the wallet does to its own PSBT after attaching the genuine signature. */
type Tamper = (returned: Psbt, signature: Buffer) => void;

/**
 * A wallet that signs the PegIn input for real, then tampers with the PSBT it returns. It keeps
 * every PSBT it was asked to sign, so a test can compare the result with what we built.
 */
class TamperingWallet extends MockBitcoinWallet {
  readonly requestedPsbts: string[] = [];

  constructor(private readonly tamper: Tamper) {
    super({ publicKeyHex: TEST_KEYS.DEPOSITOR });
  }

  async signPsbt(psbtHex: string): Promise<string> {
    this.requestedPsbts.push(psbtHex);
    const returned = Psbt.fromHex(psbtHex);
    const leaf = returned.data.inputs[0].tapLeafScript![0];
    const signature = signInput0(psbtHex);
    returned.updateInput(0, {
      tapScriptSig: [
        {
          pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
          leafHash: computeTapLeafHash(leaf.leafVersion, leaf.script),
          signature,
        },
      ],
    });
    this.tamper(returned, signature);
    return returned.toHex();
  }
}

/** Genuine BIP-340 script-path signature over input 0 of `psbtHex`, under its only leaf. */
function signInput0(psbtHex: string): Buffer {
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
  return Buffer.from(ecc.signSchnorr(sighash, DEPOSITOR_PRIV));
}

async function preparePeginWith(wallet: TamperingWallet, amounts: bigint[]) {
  const manager = new PeginManager({
    btcNetwork: "signet",
    btcWallet: wallet,
    ethWallet: new MockEthereumWallet() as never,
    ethChain: TEST_CHAIN,
    publicClient: UNUSED_PUBLIC_CLIENT,
    vaultContracts: {
      btcVaultRegistry:
        "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address,
    },
    mempoolApiUrl: MEMPOOL_API_URLS.signet,
  });
  const prepared = await manager.preparePegin({ amounts, ...PARAMS });
  return prepared.transaction.perVault;
}

/** `[signature, leaf script, control block]` built from the PSBT we sent the wallet. */
function expectedWitnessHex(requestedPsbtHex: string, signatureHex: string) {
  const leaf = Psbt.fromHex(requestedPsbtHex).data.inputs[0]
    .tapLeafScript![0];
  return [
    signatureHex,
    leaf.script.toString("hex"),
    leaf.controlBlock.toString("hex"),
  ];
}

function witnessHex(txHex: string): string[] {
  return Transaction.fromHex(txHex).ins[0].witness.map((item) =>
    Buffer.from(item).toString("hex"),
  );
}

describe("PeginManager.preparePegin — wallet PSBT boundary", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("registers the witness from the PSBT it built when the wallet adds a key-path signature", async () => {
    // bitcoinjs checks key spend first, so finalizing the wallet's copy would emit a one-element
    // key-path witness against the HTLC's NUMS internal key.
    const wallet = new TamperingWallet((returned) => {
      returned.updateInput(0, { tapKeySig: Buffer.alloc(64, 0xff) });
    });

    const [vault] = await preparePeginWith(wallet, [90_000n]);

    expect(witnessHex(vault.peginTxHex)).toEqual(
      expectedWitnessHex(wallet.requestedPsbts[0], vault.peginInputSignature),
    );
  });

  it("registers the witness from the PSBT it built when the wallet returns its own final witness", async () => {
    const wallet = new TamperingWallet((returned, signature) => {
      returned.updateInput(0, {
        finalScriptWitness: Buffer.concat([
          Buffer.from([0x01, signature.length]),
          signature,
        ]),
      });
    });

    const [vault] = await preparePeginWith(wallet, [90_000n]);

    expect(witnessHex(vault.peginTxHex)).toEqual(
      expectedWitnessHex(wallet.requestedPsbts[0], vault.peginInputSignature),
    );
  });

  it("registers the witness from the PSBT it built when the wallet files the signature under a different leaf hash", async () => {
    // The signature is matched to the depositor by pubkey, so a relabelled leaf hash survives
    // extraction; finalizing the wallet's copy then finds no signature for the real leaf and fails.
    const wallet = new TamperingWallet((returned) => {
      returned.data.inputs[0].tapScriptSig![0].leafHash = Buffer.alloc(32, 0);
    });

    const [vault] = await preparePeginWith(wallet, [90_000n]);

    expect(witnessHex(vault.peginTxHex)).toEqual(
      expectedWitnessHex(wallet.requestedPsbts[0], vault.peginInputSignature),
    );
  });

  it("registers the PegIn under peginTxid when the wallet adds a scriptSig", async () => {
    // A scriptSig survives finalization and changes the txid the registry derives the vault id from.
    const wallet = new TamperingWallet((returned) => {
      returned.updateInput(0, { finalScriptSig: Buffer.from([0x51]) });
    });

    const [vault] = await preparePeginWith(wallet, [90_000n]);

    const registered = Transaction.fromHex(vault.peginTxHex);
    expect(registered.ins[0].script).toHaveLength(0);
    expect(registered.getId()).toBe(vault.peginTxid);
  });

  it("finalizes each vault's PegIn from its own PSBT in a two-vault deposit", async () => {
    const wallet = new TamperingWallet((returned) => {
      returned.updateInput(0, { tapKeySig: Buffer.alloc(64, 0xff) });
    });

    const vaults = await preparePeginWith(wallet, [90_000n, 120_000n]);

    expect(vaults.map((vault) => witnessHex(vault.peginTxHex))).toEqual(
      vaults.map((vault, i) =>
        expectedWitnessHex(wallet.requestedPsbts[i], vault.peginInputSignature),
      ),
    );
  });
});
