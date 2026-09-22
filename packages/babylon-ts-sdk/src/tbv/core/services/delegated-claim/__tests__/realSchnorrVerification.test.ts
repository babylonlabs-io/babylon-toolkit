import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import * as verifier from "../../../primitives/psbt/verifyScriptPathSchnorrSignature";
import { planDelegatedClaimSigning } from "../planDelegatedClaimSigning";
import { signDelegatedClaimPlan } from "../signDelegatedClaimPlan";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_PUBKEY,
  REGISTERED_PAYOUT_SCRIPT,
  SIGNER_ADDRESS,
  VAULT_ID,
  VAULT_PROVIDER_PUBKEY,
  buildDelegatedClaimFixture,
} from "./fixtures/delegatedClaimPsbts";

const wasm = vi.hoisted(() => ({
  buildClaimPsbt: vi.fn(),
  buildAssertClaimerPsbt: vi.fn(),
  buildPayoutClaimerPsbt: vi.fn(),
  buildPayoutDepositorPsbt: vi.fn(),
  buildWronglyChallengedPsbts: vi.fn(),
  extractTapScriptSig: vi.fn(),
}));
vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));

// DEPOSITOR_PUBKEY is the secp256k1 generator point, so its private scalar is 1.
const DEPOSITOR_PRIV = Buffer.concat([Buffer.alloc(31), Buffer.from([1])]);
const OTHER_PRIV = Buffer.concat([Buffer.alloc(31), Buffer.from([2])]);
const fx = buildDelegatedClaimFixture(DEPOSITOR_PUBKEY.slice(2));
const params = {
  depositorPublicKey: DEPOSITOR_PUBKEY,
  btcNetwork: "testnet" as const,
  source: { txGraphJson: "{graph}", verifyingKeyHex: "beef" },
  vault: {
    vaultId: VAULT_ID,
    depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
    registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    vaultProviderBtcPubkey: VAULT_PROVIDER_PUBKEY,
    vaultKeeperBtcPubkeys: [CHALLENGER_A],
    universalChallengerBtcPubkeys: [CHALLENGER_B],
    txGraphVersion: 3,
    proverCircuitVersion: 7,
    vaultCoreVersion: 3,
    claimableEventBlockNumber: 10_985_680n,
  },
};

/** Signs each requested input's leaf with `priv` while claiming the depositor key. */
function softwareWallet(priv: Buffer): BitcoinWallet {
  const keyPair = {
    publicKey: Buffer.from(DEPOSITOR_PUBKEY, "hex"),
    signSchnorr: (hash: Buffer) => Buffer.from(ecc.signSchnorr(hash, priv)),
    // bitcoinjs's Signer shape; a script-path spend never takes this branch.
    sign: (): Buffer => {
      throw new Error("ECDSA sign requested for a Taproot script-path input");
    },
  };
  return {
    getAddress: () => Promise.resolve(SIGNER_ADDRESS),
    getPublicKeyHex: () => Promise.resolve(DEPOSITOR_PUBKEY),
    signPsbt: vi.fn(),
    signPsbts: (hexes: string[], options: { signInputs: { index: number }[] }[]) =>
      Promise.resolve(hexes.map((hex, i) => Psbt.fromHex(hex).signInput(options[i].signInputs[0].index, keyPair).toHex())),
  } as unknown as BitcoinWallet;
}

describe("signDelegatedClaimPlan with the real Schnorr verifier", () => {
  beforeEach(() => {
    wasm.buildClaimPsbt.mockResolvedValue(fx.claimPsbt);
    wasm.buildAssertClaimerPsbt.mockResolvedValue(fx.assertPsbt);
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(fx.payoutClaimerPsbt);
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(fx.payoutDepositorPsbt);
    wasm.buildWronglyChallengedPsbts.mockResolvedValue(fx.wronglyChallengedPsbts);
    wasm.extractTapScriptSig.mockImplementation((psbtBase64: string, inputIndex: number) => {
      const tapScriptSig = Psbt.fromBase64(psbtBase64).data.inputs[inputIndex].tapScriptSig;
      return Promise.resolve(tapScriptSig?.[0].signature.toString("hex"));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("accepts every signature made with the depositor key, verifying each requested input", async () => {
    const verify = vi.spyOn(verifier, "assertScriptPathSchnorrSignature");
    const plan = await planDelegatedClaimSigning(params);

    const sigs = await signDelegatedClaimPlan(plan, softwareWallet(DEPOSITOR_PRIV));

    expect([...sigs.keys()]).toEqual(plan.requests.map((r) => r.id));
    expect(verify.mock.calls.map(([call]) => call.inputIndex)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it("rejects the set when the wallet signs with another key", async () => {
    const plan = await planDelegatedClaimSigning(params);

    await expect(signDelegatedClaimPlan(plan, softwareWallet(OTHER_PRIV))).rejects.toThrow(/does not verify/);
  });
});
